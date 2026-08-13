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
  otherUser: "security-finance-other-user",
  ownedContract: "security-finance-owned-contract",
  otherContract: "security-finance-other-contract",
  ownedReconciliation: "security-finance-owned-reconciliation",
  otherReconciliation: "security-finance-other-reconciliation",
  deletedReconciliation: "security-finance-deleted-reconciliation",
  crossOwnedReconciliation: "security-finance-cross-owned-reconciliation",
  draftContract: "security-finance-draft-contract",
  deletedContract: "security-finance-deleted-contract",
  ownedBatch: "security-bi-owned-batch",
  otherBatch: "security-bi-other-batch",
  ownedSale: "security-bi-owned-sale",
  otherSale: "security-bi-other-sale",
} as const;

let ownedCustomerId = "";
let otherCustomerId = "";

async function request(
  path: string,
  options: RequestInit = {},
  cookie?: string,
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });
}

async function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, cookie);
}

before(async () => {
  const fixture = await seedFourRoleFixture(prisma);
  ownedCustomerId = fixture.customers.ownedCustomer.id;

  await prisma.user.create({
    data: {
      id: ids.otherUser,
      name: "Security Finance Other User",
      email: "security-finance-other@test.invalid",
      passwordHash: "security-test-not-a-login-password",
      role: "USER",
      status: "APPROVED",
    },
  });
  const otherCustomer = await prisma.customer.create({
    data: {
      brandName: "Security Finance Other Customer",
      businessOwnerId: ids.otherUser,
      createdById: ids.otherUser,
    },
  });
  otherCustomerId = otherCustomer.id;

  await prisma.contract.createMany({
    data: [
      {
        id: ids.ownedContract,
        contractNo: "SECURITY-FINANCE-OWNED",
        customerId: ownedCustomerId,
        status: "COMPLETED",
        createdById: actors.user.id,
      },
      {
        id: ids.otherContract,
        contractNo: "SECURITY-FINANCE-OTHER",
        customerId: otherCustomerId,
        status: "COMPLETED",
        createdById: ids.otherUser,
      },
      {
        id: ids.draftContract,
        contractNo: "SECURITY-FINANCE-DRAFT",
        customerId: otherCustomerId,
        status: "DRAFT",
        createdById: ids.otherUser,
      },
      {
        id: ids.deletedContract,
        contractNo: "SECURITY-FINANCE-DELETED",
        customerId: otherCustomerId,
        status: "COMPLETED",
        deletedAt: new Date("2026-05-01T00:00:00.000Z"),
        createdById: ids.otherUser,
      },
    ],
  });

  const periodStart = new Date("2026-06-01T00:00:00.000Z");
  const periodEnd = new Date("2026-06-30T23:59:59.000Z");
  await prisma.customerReconciliation.createMany({
    data: [
      {
        id: ids.ownedReconciliation,
        customerId: ownedCustomerId,
        contractId: ids.ownedContract,
        periodStart,
        periodEnd,
        createdById: actors.user.id,
      },
      {
        id: ids.otherReconciliation,
        customerId: otherCustomerId,
        contractId: ids.otherContract,
        periodStart,
        periodEnd,
        createdById: ids.otherUser,
      },
      {
        id: ids.deletedReconciliation,
        customerId: ownedCustomerId,
        contractId: ids.ownedContract,
        periodStart,
        periodEnd,
        createdById: actors.user.id,
        deletedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
  });

  await prisma.salesBatch.createMany({
    data: [
      {
        id: ids.ownedBatch,
        fileName: "security-owned.xlsx",
        customerId: ownedCustomerId,
        uploaderId: actors.user.id,
        recordCount: 1,
      },
      {
        id: ids.otherBatch,
        fileName: "security-other.xlsx",
        customerId: otherCustomerId,
        uploaderId: ids.otherUser,
        recordCount: 1,
      },
    ],
  });
  await prisma.salesRecord.createMany({
    data: [
      {
        id: ids.ownedSale,
        batchId: ids.ownedBatch,
        affiliatePlatform: "Security Platform",
        brand: "Security Owned Customer",
        affiliateName: "Security Affiliate A",
        orderDate: periodStart,
        customerId: ownedCustomerId,
      },
      {
        id: ids.otherSale,
        batchId: ids.otherBatch,
        affiliatePlatform: "Security Platform",
        brand: "Security Finance Other Customer",
        affiliateName: "Security Affiliate B",
        orderDate: periodStart,
        customerId: otherCustomerId,
      },
    ],
  });
});

after(async () => {
  await prisma.adminAuditLog.deleteMany({
    where: { actorId: { in: [actors.user.id, actors.brand.id] } },
  });
  await prisma.salesRecord.deleteMany({ where: { id: { in: [ids.ownedSale, ids.otherSale] } } });
  await prisma.salesBatch.deleteMany({ where: { id: { in: [ids.ownedBatch, ids.otherBatch] } } });
  await prisma.customerReconciliation.deleteMany({
    where: {
      id: {
        in: [ids.ownedReconciliation, ids.otherReconciliation, ids.deletedReconciliation, ids.crossOwnedReconciliation],
      },
    },
  });
  await prisma.contract.deleteMany({
    where: {
      id: {
        in: [
          ids.ownedContract,
          ids.otherContract,
          ids.draftContract,
          ids.deletedContract,
        ],
      },
    },
  });
  await prisma.userPermissionOverride.deleteMany({
    where: { userId: { in: [actors.user.id, actors.brand.id] } },
  });
  await prisma.customer.deleteMany({ where: { brandName: { startsWith: "Security " } } });
  await prisma.rolePermission.deleteMany({
    where: { role: { in: ["ADMIN", "USER", "BRAND", "CHANNEL"] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [...Object.values(actors).map((actor) => actor.id), ids.otherUser] } },
  });
  await prisma.$disconnect();
});

test("customer reconciliation endpoints reject unauthenticated and permission-NONE requests", async () => {
  const unauthenticated = await request("/api/finance/reconciliations");
  assert.equal(unauthenticated.status, 401);

  const brandCookie = await sessionCookie(actors.brand);
  const forbidden = await request("/api/finance/reconciliations", {}, brandCookie);
  assert.equal(forbidden.status, 403);
});

test("USER reconciliation READ stays in mine scope even when scope=all is requested", async () => {
  const userCookie = await sessionCookie(actors.user);
  const response = await request("/api/finance/reconciliations?scope=all", {}, userCookie);
  assert.equal(response.status, 200);
  const rows = await response.json() as Array<{ id: string }>;
  assert.deepEqual(rows.map((row) => row.id), [ids.ownedReconciliation]);
});

test("ADMIN reconciliation list can read all active rows but not soft-deleted rows", async () => {
  const adminCookie = await sessionCookie(actors.admin);
  const response = await request("/api/finance/reconciliations?scope=all", {}, adminCookie);
  assert.equal(response.status, 200);
  const rows = await response.json() as Array<{ id: string }>;
  const returned = new Set(rows.map((row) => row.id));
  assert.equal(returned.has(ids.ownedReconciliation), true);
  assert.equal(returned.has(ids.otherReconciliation), true);
  assert.equal(returned.has(ids.deletedReconciliation), false);
});

test("reconciliation detail returns 404 for cross-scope and soft-deleted rows", async () => {
  const userCookie = await sessionCookie(actors.user);
  const crossScope = await request(
    `/api/finance/reconciliations/${ids.otherReconciliation}`,
    {},
    userCookie,
  );
  assert.equal(crossScope.status, 404);

  const deleted = await request(
    `/api/finance/reconciliations/${ids.deletedReconciliation}`,
    {},
    userCookie,
  );
  assert.equal(deleted.status, 404);
});

test("USER reconciliation EDIT can create for an unrelated active customer without changing ownership", async () => {
  const before = await prisma.customer.findUniqueOrThrow({
    where: { id: otherCustomerId },
    select: { businessOwnerId: true, backendOwnerId: true, createdById: true },
  });
  const userCookie = await sessionCookie(actors.user);
  const response = await jsonRequest(
    "/api/finance/reconciliations",
    "POST",
    {
      customerId: otherCustomerId,
      contractId: ids.otherContract,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reconcileType: "FEE_ONLY",
    },
    userCookie,
  );
  assert.equal(response.status, 201);
  const created = await response.json() as { id: string; createdById: string };
  assert.equal(created.createdById, actors.user.id);
  assert.equal(
    (await prisma.customerReconciliation.findUniqueOrThrow({ where: { id: created.id } })).createdById,
    actors.user.id,
  );
  const afterCustomer = await prisma.customer.findUniqueOrThrow({
    where: { id: otherCustomerId },
    select: { businessOwnerId: true, backendOwnerId: true, createdById: true },
  });
  assert.deepEqual(afterCustomer, before);
  await prisma.customerReconciliation.update({
    where: { id: created.id },
    data: { id: ids.crossOwnedReconciliation },
  });
});

test("customer reconciliation creation rejects external actors and invalid contract references", async () => {
  const userCookie = await sessionCookie(actors.user);
  const brandCookie = await sessionCookie(actors.brand);
  const body = {
    customerId: otherCustomerId,
    contractId: ids.otherContract,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    reconcileType: "COMMISSION_ONLY",
  };
  assert.equal((await jsonRequest("/api/finance/reconciliations", "POST", body, brandCookie)).status, 403);
  assert.equal((await jsonRequest("/api/finance/reconciliations", "POST", { ...body, contractId: ids.ownedContract }, userCookie)).status, 404);
  assert.equal((await jsonRequest("/api/finance/reconciliations", "POST", { ...body, contractId: ids.draftContract }, userCookie)).status, 400);
  assert.equal((await jsonRequest("/api/finance/reconciliations", "POST", { ...body, contractId: ids.deletedContract }, userCookie)).status, 404);
});

test("BI clear requires internal MANAGE permission", async () => {
  const userCookie = await sessionCookie(actors.user);
  const editOnly = await jsonRequest(
    "/api/sales/clear",
    "POST",
    { filter: { customerId: ownedCustomerId }, dryRun: true },
    userCookie,
  );
  assert.equal(editOnly.status, 403);

  await prisma.userPermissionOverride.upsert({
    where: { userId_feature: { userId: actors.brand.id, feature: "bi" } },
    update: { level: "MANAGE" },
    create: { userId: actors.brand.id, feature: "bi", level: "MANAGE" },
  });
  const brandCookie = await sessionCookie(actors.brand);
  const externalManage = await jsonRequest(
    "/api/sales/clear",
    "POST",
    { filter: { customerId: ownedCustomerId }, dryRun: true },
    brandCookie,
  );
  assert.equal(externalManage.status, 403);
});

test("BI MANAGE clear preview is row-scoped and execution soft-deletes with audit logs", async () => {
  await prisma.userPermissionOverride.upsert({
    where: { userId_feature: { userId: actors.user.id, feature: "bi" } },
    update: { level: "MANAGE" },
    create: { userId: actors.user.id, feature: "bi", level: "MANAGE" },
  });
  const userCookie = await sessionCookie(actors.user);

  const crossScopePreview = await jsonRequest(
    "/api/sales/clear",
    "POST",
    { filter: { customerId: otherCustomerId }, dryRun: true },
    userCookie,
  );
  assert.equal(crossScopePreview.status, 200);
  const crossScopeBody = await crossScopePreview.json() as { count: number };
  assert.equal(crossScopeBody.count, 0);

  const preview = await jsonRequest(
    "/api/sales/clear",
    "POST",
    { filter: { customerId: ownedCustomerId }, dryRun: true },
    userCookie,
  );
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as { count: number; confirmationToken?: string };
  assert.equal(previewBody.count, 1);
  assert.ok(previewBody.confirmationToken);

  const execute = await jsonRequest(
    "/api/sales/clear",
    "POST",
    {
      filter: { customerId: ownedCustomerId },
      dryRun: false,
      confirmationToken: previewBody.confirmationToken,
    },
    userCookie,
  );
  assert.equal(execute.status, 200);
  assert.deepEqual(await execute.json(), { deleted: 1 });

  const [ownedSale, otherSale, auditActions] = await Promise.all([
    prisma.salesRecord.findUniqueOrThrow({ where: { id: ids.ownedSale } }),
    prisma.salesRecord.findUniqueOrThrow({ where: { id: ids.otherSale } }),
    prisma.adminAuditLog.findMany({
      where: { actorId: actors.user.id, module: "BI", action: { in: ["CLEAR_PREVIEW", "CLEAR"] } },
      select: { action: true },
    }),
  ]);
  assert.ok(ownedSale.deletedAt);
  assert.equal(otherSale.deletedAt, null);
  assert.deepEqual(new Set(auditActions.map((log) => log.action)), new Set(["CLEAR_PREVIEW", "CLEAR"]));
});
