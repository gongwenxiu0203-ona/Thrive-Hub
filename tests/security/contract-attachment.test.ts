import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  actors,
  createSecurityPrisma,
  seedFourRoleFixture,
  sessionCookie,
} from "./fixture";

const prisma = createSecurityPrisma();
const baseUrl = process.env.SECURITY_TEST_BASE_URL;
assert.ok(baseUrl, "SECURITY_TEST_BASE_URL must be set by the security test runner");

const runId = `contract-attachment-${process.pid}`;
const versionFileName = `${runId}.docx`;
const versionFilePath = resolve("private", "contracts-generated", versionFileName);
const uploadedPaths = new Set<string>();

let channelContractId: string;
let unrelatedContractId: string;
let channelVersionId: string;

async function request(
  path: string,
  actor?: (typeof actors)[keyof typeof actors],
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  if (actor) headers.set("cookie", await sessionCookie(actor));
  return fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
}

before(async () => {
  const fixture = await seedFourRoleFixture(prisma);

  // Keep the role-level fixture read-only and use a user override to exercise
  // row scope independently from feature permission failures.
  await prisma.userPermissionOverride.create({
    data: {
      userId: actors.channel.id,
      feature: "contracts",
      level: "EDIT",
    },
  });

  const channelContract = await prisma.contract.create({
    data: {
      contractNo: `${runId}-channel`,
      customerId: fixture.customers.channelCustomer.id,
      createdById: actors.admin.id,
    },
  });
  const unrelatedContract = await prisma.contract.create({
    data: {
      contractNo: `${runId}-unrelated`,
      customerId: fixture.customers.unrelatedCustomer.id,
      createdById: actors.admin.id,
    },
  });
  channelContractId = channelContract.id;
  unrelatedContractId = unrelatedContract.id;

  await mkdir(join("private", "contracts-generated"), { recursive: true });
  await writeFile(versionFilePath, Buffer.from("security-version-file"));
  const version = await prisma.contractVersion.create({
    data: {
      contractId: channelContract.id,
      versionNo: 1,
      fileUrl: `/contracts-generated/${versionFileName}`,
      fileType: "docx",
      reason: "security test",
      createdById: actors.admin.id,
    },
  });
  channelVersionId = version.id;
});

after(async () => {
  // This database is isolated and the test runner executes files serially.
  // Remove this suite's complete fixture so fixture.test.ts can assert exact counts.
  await prisma.attachment.deleteMany({ where: { fileName: { startsWith: runId } } });
  await prisma.contractVersion.deleteMany({ where: { id: channelVersionId } });
  await prisma.contract.deleteMany({ where: { id: { in: [channelContractId, unrelatedContractId] } } });
  await prisma.userPermissionOverride.deleteMany({ where: { userId: actors.channel.id } });
  await prisma.customer.deleteMany({
    where: { brandName: { startsWith: "Security " } },
  });
  await prisma.rolePermission.deleteMany({
    where: { role: { in: ["ADMIN", "USER", "BRAND", "CHANNEL"] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: Object.values(actors).map((actor) => actor.id) } },
  });
  await prisma.$disconnect();
  await rm(versionFilePath, { force: true });
  await Promise.all([...uploadedPaths].map((path) => rm(path, { force: true })));
});

test("contract version download rejects unauthenticated requests", async () => {
  const response = await request(`/api/contracts/version-download/${channelVersionId}`);
  assert.equal(response.status, 401);
});

test("contract version download enforces feature permission", async () => {
  await prisma.userPermissionOverride.create({
    data: { userId: actors.brand.id, feature: "contracts", level: "NONE" },
  });
  try {
    const response = await request(
      `/api/contracts/version-download/${channelVersionId}`,
      actors.brand,
    );
    assert.equal(response.status, 403);
  } finally {
    await prisma.userPermissionOverride.delete({
      where: { userId_feature: { userId: actors.brand.id, feature: "contracts" } },
    });
  }
});

test("channel downloads a version belonging to its own customer", async () => {
  const response = await request(
    `/api/contracts/version-download/${channelVersionId}`,
    actors.channel,
  );
  assert.equal(response.status, 200);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "security-version-file");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("channel cannot download a version outside its customer scope", async () => {
  const otherVersion = await prisma.contractVersion.create({
    data: {
      contractId: unrelatedContractId,
      versionNo: 1,
      fileUrl: `/contracts-generated/${versionFileName}`,
      fileType: "docx",
      reason: "security test",
      createdById: actors.admin.id,
    },
  });
  try {
    const response = await request(
      `/api/contracts/version-download/${otherVersion.id}`,
      actors.channel,
    );
    assert.equal(response.status, 404);
  } finally {
    await prisma.contractVersion.delete({ where: { id: otherVersion.id } });
  }
});

test("attachment upload rejects unauthenticated requests", async () => {
  const form = new FormData();
  form.set("file", new File(["upload"], `${runId}-unauth.txt`, { type: "text/plain" }));
  form.set("entityType", "CONTRACT");
  form.set("entityId", channelContractId);
  const response = await request("/api/upload", undefined, { method: "POST", body: form });
  assert.equal(response.status, 401);
});

test("attachment upload rejects a read-only actor", async () => {
  const form = new FormData();
  form.set("file", new File(["upload"], `${runId}-readonly.txt`, { type: "text/plain" }));
  form.set("entityType", "CONTRACT");
  form.set("entityId", channelContractId);
  const response = await request("/api/upload", actors.brand, { method: "POST", body: form });
  assert.equal(response.status, 403);
});

test("attachment upload rejects an entity outside channel scope without writing data", async () => {
  const beforeCount = await prisma.attachment.count();
  const form = new FormData();
  form.set("file", new File(["upload"], `${runId}-outside.txt`, { type: "text/plain" }));
  form.set("entityType", "CONTRACT");
  form.set("entityId", unrelatedContractId);
  const response = await request("/api/upload", actors.channel, { method: "POST", body: form });
  assert.equal(response.status, 404);
  assert.equal(await prisma.attachment.count(), beforeCount);
});

test("channel can upload an attachment to its own contract", async () => {
  const form = new FormData();
  form.set("file", new File(["owned upload"], `${runId}-owned.txt`, { type: "text/plain" }));
  form.set("entityType", "CONTRACT");
  form.set("entityId", channelContractId);
  const response = await request("/api/upload", actors.channel, { method: "POST", body: form });
  assert.equal(response.status, 200);

  const body = (await response.json()) as { attachment: { id: string; fileUrl: string } };
  const attachment = await prisma.attachment.findUnique({ where: { id: body.attachment.id } });
  assert.equal(attachment?.entityId, channelContractId);
  assert.equal(attachment?.uploadedById, actors.channel.id);
  uploadedPaths.add(resolve("uploads", body.attachment.fileUrl.split("/").pop()!));
});
