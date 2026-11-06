import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

async function main() {
  const db = process.env.FEISHU_TEST_DATABASE_URL;
  if (!db?.startsWith("file:") || !db.replace(/\\/g, "/").includes("backups/") || /prisma\/dev\.db/i.test(db)) throw new Error("Provide explicit isolated FEISHU_TEST_DATABASE_URL inside backups/");
  process.env.DATABASE_URL = db;
  Object.assign(process.env, { JWT_SECRET: "isolated-test-signing-key-never-production", FEISHU_NOTIFY_ENABLED: "true", FEISHU_NOTIFY_APP_ID: "cli_test", FEISHU_NOTIFY_APP_SECRET: "test-only", FEISHU_NOTIFY_TENANT_KEY: "tenant_test", NEXT_PUBLIC_APP_URL: "https://thrive.test" });
  const { completeAuthorization, OAUTH_COOKIE, sameOrigin, safeFeishuError } = await import("../src/lib/feishuOAuth");
  const { prisma } = await import("../src/lib/prisma");
  const realFetch = globalThis.fetch;
  const realCreate = prisma.feishuBinding.create;
  let calls = 0, writes = 0;
  globalThis.fetch = async input => {
    calls++;
    return Response.json(String(input).endsWith("/oauth/token") ? { access_token: "mock_access" } : { code: 0, data: { open_id: "mock_open", tenant_key: "WRONG_TENANT" } });
  };
  prisma.feishuBinding.create = (async () => { writes++; throw new Error("Unexpected binding write"); }) as unknown as typeof realCreate;
  const session = "fake-session";
  const payload = { userId: "test-user", state: "state", verifier: "verifier", appId: "cli_test", sessionHash: createHash("sha256").update(session).digest("hex") };
  const signed = (overrides = {}, expires = "10m") => new SignJWT({ ...payload, ...overrides }).setProtectedHeader({ alg: "HS256" }).setAudience("feishu-bind").setIssuedAt().setExpirationTime(expires).sign(new TextEncoder().encode(process.env.JWT_SECRET));
  function req(cookie: string, state = "state", sessionValue = session) {
    return new NextRequest(`https://thrive.test/api/settings/feishu/callback?state=${state}&code=mock_code`, { headers: { cookie: `ams_session=${sessionValue}; ${OAUTH_COOKIE}=${cookie}` } });
  }
  try {
    const good = await signed();
    await assert.rejects(completeAuthorization(req(""), "test-user"));
    await assert.rejects(completeAuthorization(req(good, "wrong"), "test-user"));
    await assert.rejects(completeAuthorization(req(good), "other-user"));
    await assert.rejects(completeAuthorization(req(good, "state", "new-session"), "test-user"));
    await assert.rejects(completeAuthorization(req(await signed({}, "-1s")), "test-user"));
    await assert.rejects(completeAuthorization(req(await signed({ appId: "another-app" })), "test-user"));
    assert.equal(calls, 0, "Invalid state must never call Feishu");
    await assert.rejects(completeAuthorization(req(good), "test-user"), /本企业/);
    assert.equal(calls, 2); assert.equal(writes, 0, "Wrong tenant must never bind");
    assert.equal(sameOrigin(new NextRequest("https://thrive.test", { headers: { origin: "https://evil.test" } })), false);
    process.env.NEXT_PUBLIC_APP_URL = "invalid-url";
    assert.equal(sameOrigin(new NextRequest("https://thrive.test", { headers: { origin: "https://thrive.test" } })), false);
    assert.doesNotMatch(safeFeishuError(new Error("Prisma secret sensitive-data")), /Prisma|secret|sensitive-data/);
    console.log("OAuth rejection, session binding, tenant isolation, origin and error-redaction tests passed; no binding writes or real messages.");
  } finally { globalThis.fetch = realFetch; prisma.feishuBinding.create = realCreate; await prisma.$disconnect(); }
}
main().catch(() => { console.error("Feishu OAuth test failed"); process.exitCode = 1; });
