import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true);

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { createSessionToken } = await import("../src/lib/auth");
  const { normalizeError } = await import("../src/lib/appError");
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
  assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", status: "APPROVED" } });
  const employee = await prisma.user.findFirst({ where: { role: "USER", status: "APPROVED" } });
  assert.ok(admin, "Local approved ADMIN required");
  assert.ok(employee, "Local approved USER required");
  const tokenFor = async (user: typeof admin) => createSessionToken({ userId: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
  const adminToken = await tokenFor(admin);
  const employeeToken = await tokenFor(employee);
  const request = (token: string, query = "", body?: unknown) => fetch(`${base}/api/admin/system-errors${query}`, {
    method: body ? "PATCH" : "GET", headers: { Cookie: `ams_session=${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await request("")).status, 401);
  assert.equal((await request(employeeToken)).status, 403);
  assert.equal((await request(adminToken, "?from=2026-02-30")).status, 400);
  assert.equal((await request(adminToken, "?page=-1")).status, 400);
  // Read-only existing route rejects USER before any business writes; exercises Next after().
  const denied = await fetch(`${base}/api/admin/email-settings`, { headers: { Cookie: `ams_session=${employeeToken}` } });
  assert.equal(denied.status, 403);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.code, "PERMISSION_DENIED");
  const deniedCode = denied.headers.get("X-Error-Code");
  assert.ok(deniedCode);
  assert.ok(deniedCode.startsWith("ERR-"));
  let deniedLog = await prisma.systemErrorLog.findUnique({ where: { traceCode: deniedCode } });
  for (let attempt = 0; !deniedLog && attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    deniedLog = await prisma.systemErrorLog.findUnique({ where: { traceCode: deniedCode } });
  }
  assert.ok(deniedLog, "Next after must persist rejected API error");
  assert.equal(deniedLog.category, "PERMISSION_DENIED");
  assert.equal((await request(adminToken, "", { id: deniedLog.id, status: "RESOLVED", resolutionNote: "本地自动化验证：权限拒绝与请求结束后日志持久化通过。" })).status, 200);
  const error = Object.assign(new Error("NaN password=SYSTEM_ERROR_TEST_SECRET"), { name: "PrismaClientValidationError" });
  const result = normalizeError(error, "test.system-errors", 500);
  const code = result.payload.code!;
  let row = await prisma.systemErrorLog.findUnique({ where: { traceCode: code } });
  for (let attempt = 0; !row && attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    row = await prisma.systemErrorLog.findUnique({ where: { traceCode: code } });
  }
  assert.ok(row, "Unified error must persist");
  assert.equal(JSON.stringify(row).includes("SYSTEM_ERROR_TEST_SECRET"), false);
  const response = await request(adminToken, `?code=${code}`);
  assert.equal(response.status, 200);
  const found = await response.json();
  assert.equal(found.total, 1); assert.equal(found.items[0].traceCode, code);
  assert.equal((await request(employeeToken, "", { id: row.id, status: "RESOLVED", resolutionNote: "blocked" })).status, 403);
  assert.equal((await request(adminToken, "", { id: row.id, status: "RESOLVED", resolutionNote: "" })).status, 400);
  assert.equal((await request(adminToken, "", { id: row.id, status: "INVALID" })).status, 400);
  assert.equal((await request(adminToken, "", { id: row.id, status: "RESOLVED", resolutionNote: "本地自动化验证：测试异常，已确认脱敏、查询和状态更新。" })).status, 200);
  const saved = await prisma.systemErrorLog.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.status, "RESOLVED"); assert.equal(saved.resolvedById, admin.id); assert.ok(saved.resolvedAt);
  console.log("System error API tests passed: 401/403, invalid filters, Next after persistence, sanitized persistence, trace lookup, status validation and save. Marked test logs retained; no business records changed.");
  await prisma.$disconnect();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
