import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  actors,
  createSecurityPrisma,
  seedFourRoleFixture,
  sessionCookie,
} from "./fixture";

const prisma = createSecurityPrisma();
const baseUrl = process.env.SECURITY_TEST_BASE_URL;
assert.ok(baseUrl, "SECURITY_TEST_BASE_URL must be set by the security test runner");

const ids = {
  affiliate: "security-affiliate-row",
  ownedContract: "security-channel-owned-contract",
  unrelatedContract: "security-channel-unrelated-contract",
  ownedReconciliation: "security-channel-owned-reconciliation",
  unrelatedReconciliation: "security-channel-unrelated-reconciliation",
} as const;

let ownedCustomerId = "";
let unrelatedCustomerId = "";

async function request(path: string, init: RequestInit = {}, actor?: (typeof actors)[keyof typeof actors]) {
  const headers = new Headers(init.headers);
  if (actor) headers.set("cookie", await sessionCookie(actor));
  return fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
}

async function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  actor?: (typeof actors)[keyof typeof actors],
) {
  return request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, actor);
}

before(async () => {
  const fixture = await seedFourRoleFixture(prisma);
  ownedCustomerId = fixture.customers.ownedCustomer.id;
  unrelatedCustomerId = fixture.customers.unrelatedCustomer.id;

  await prisma.userPermissionOverride.createMany({
    data: [
      { userId: actors.user.id, feature: "affiliates", level: "EDIT" },
      { userId: actors.brand.id, feature: "affiliates", level: "NONE" },
      { userId: actors.channel.id, feature: "finance_channel", level: "EDIT" },
      { userId: actors.user.id, feature: "finance_channel", level: "MANAGE" },
    ],
  });

  await prisma.affiliate.create({
    data: { id: ids.affiliate, platformAffiliateName: "Security Affiliate Permission Row" },
  });
  await prisma.contract.createMany({
    data: [
      {
        id: ids.ownedContract,
        contractNo: "SECURITY-CHANNEL-OWNED",
        customerId: ownedCustomerId,
        createdById: actors.user.id,
      },
      {
        id: ids.unrelatedContract,
        contractNo: "SECURITY-CHANNEL-UNRELATED",
        customerId: unrelatedCustomerId,
        createdById: actors.admin.id,
      },
    ],
  });
  await prisma.channelReconciliation.createMany({
    data: [
      {
        id: ids.ownedReconciliation,
        customerId: ownedCustomerId,
        contractId: ids.ownedContract,
        channelUserId: actors.channel.id,
        createdById: actors.user.id,
      },
      {
        id: ids.unrelatedReconciliation,
        customerId: unrelatedCustomerId,
        contractId: ids.unrelatedContract,
        channelUserId: actors.admin.id,
        createdById: actors.admin.id,
      },
    ],
  });
});

after(async () => {
  await prisma.channelReconciliation.deleteMany({
    where: { id: { in: [ids.ownedReconciliation, ids.unrelatedReconciliation] } },
  });
  await prisma.contract.deleteMany({ where: { id: { in: [ids.ownedContract, ids.unrelatedContract] } } });
  await prisma.affiliate.deleteMany({ where: { id: ids.affiliate } });
  await prisma.userPermissionOverride.deleteMany({
    where: { userId: { in: Object.values(actors).map((actor) => actor.id) } },
  });
  await prisma.customer.deleteMany({ where: { brandName: { startsWith: "Security " } } });
  await prisma.rolePermission.deleteMany({
    where: { role: { in: ["ADMIN", "USER", "BRAND", "CHANNEL"] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: Object.values(actors).map((actor) => actor.id) }, },
  });
  await prisma.$disconnect();
});

test("affiliate APIs reject unauthenticated and permission-NONE reads", async () => {
  assert.equal((await request("/api/affiliates")).status, 401);
  assert.equal((await request("/api/affiliates", {}, actors.brand)).status, 403);
  assert.equal((await request(`/api/affiliates/${ids.affiliate}`, {}, actors.brand)).status, 403);
});

test("affiliate EDIT can create and patch but cannot soft-delete", async () => {
  const created = await jsonRequest(
    "/api/affiliates",
    "POST",
    { platformAffiliateName: "Security Affiliate Created", tags: [] },
    actors.user,
  );
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { id: string };

  const patched = await jsonRequest(
    `/api/affiliates/${createdBody.id}`,
    "PATCH",
    { note: "security-patched" },
    actors.user,
  );
  assert.equal(patched.status, 200);
  assert.equal((await prisma.affiliate.findUniqueOrThrow({ where: { id: createdBody.id } })).note, "security-patched");

  const forbiddenDelete = await request(
    `/api/affiliates/${createdBody.id}`,
    { method: "DELETE" },
    actors.user,
  );
  assert.equal(forbiddenDelete.status, 403);
  assert.equal((await prisma.affiliate.findUniqueOrThrow({ where: { id: createdBody.id } })).deletedAt, null);
  await prisma.affiliate.delete({ where: { id: createdBody.id } });
});

test("channel reconciliation list is scoped to the signed-in channel", async () => {
  const response = await request("/api/finance/channel-reconciliations", {}, actors.channel);
  assert.equal(response.status, 200);
  const rows = await response.json() as Array<{ id: string }>;
  assert.deepEqual(rows.map((row) => row.id), [ids.ownedReconciliation]);
});

test("channel reconciliation writes are staff-only and remain row-scoped", async () => {
  const patchResponse = await jsonRequest(
    `/api/finance/channel-reconciliations/${ids.unrelatedReconciliation}`,
    "PATCH",
    { note: "cross-scope-write" },
    actors.channel,
  );
  assert.equal(patchResponse.status, 403);
  assert.equal(
    (await prisma.channelReconciliation.findUniqueOrThrow({ where: { id: ids.unrelatedReconciliation } })).note,
    null,
  );

  const deleteResponse = await request(
    `/api/finance/channel-reconciliations/${ids.unrelatedReconciliation}`,
    { method: "DELETE" },
    actors.user,
  );
  assert.equal(deleteResponse.status, 404);
  assert.ok(await prisma.channelReconciliation.findUnique({ where: { id: ids.unrelatedReconciliation } }));
});

test("channel reconciliation POST rejects a channel actor", async () => {
  const response = await jsonRequest(
    "/api/finance/channel-reconciliations",
    "POST",
    {
      customerId: unrelatedCustomerId,
      periodStart: "2026-07-01",
      contractId: ids.unrelatedContract,
      periodEnd: "2026-12-31",
    },
    actors.channel,
  );
  assert.equal(response.status, 403);
  assert.equal(
    await prisma.channelReconciliation.count({
      where: { customerId: unrelatedCustomerId, createdById: actors.channel.id },
    }),
    0,
  );
});
