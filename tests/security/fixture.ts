import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE, type SessionPayload } from "../../src/lib/auth";

const SAFE_DB_RE = /(?:^|[\\/])security-test-[a-f0-9-]+\.db$/i;

export type SecurityRole = "ADMIN" | "USER" | "BRAND" | "CHANNEL";

export type SecurityActor = {
  id: string;
  role: SecurityRole;
  name: string;
  email: string;
  brandName: string | null;
};

export const actors: Record<Lowercase<SecurityRole>, SecurityActor> = {
  admin: { id: "security-admin", role: "ADMIN", name: "Security Admin", email: "security-admin@test.invalid", brandName: null },
  user: { id: "security-user", role: "USER", name: "Security User", email: "security-user@test.invalid", brandName: null },
  brand: { id: "security-brand", role: "BRAND", name: "Security Brand", email: "security-brand@test.invalid", brandName: "Security Brand A" },
  channel: { id: "security-channel", role: "CHANNEL", name: "Security Channel", email: "security-channel@test.invalid", brandName: null },
};

export function assertIsolatedSecurityDatabase(): string {
  assert.equal(process.env.NODE_ENV, "test", "Security fixtures require NODE_ENV=test");
  const dbPath = process.env.SECURITY_TEST_DB_PATH;
  assert.ok(dbPath, "SECURITY_TEST_DB_PATH must be set by the security test runner");
  assert.match(dbPath.replace(/\\/g, "/"), SAFE_DB_RE, "Database must be a unique security-test-*.db file");
  assert.notEqual(dbPath.toLowerCase().replace(/\\/g, "/").endsWith("/prisma/dev.db"), true);
  assert.equal(process.env.DATABASE_URL?.startsWith("file:"), true, "Only isolated SQLite is allowed");
  return dbPath;
}

export function createSecurityPrisma(): PrismaClient {
  assertIsolatedSecurityDatabase();
  return new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
}

export async function seedFourRoleFixture(prisma: PrismaClient) {
  assertIsolatedSecurityDatabase();

  await prisma.user.createMany({
    data: Object.values(actors).map((actor) => ({
      id: actor.id,
      name: actor.name,
      email: actor.email,
      passwordHash: "security-test-not-a-login-password",
      role: actor.role,
      status: "APPROVED",
      brandName: actor.brandName,
      channelUserId: actor.role === "CHANNEL" ? actor.id : null,
    })),
  });

  await prisma.rolePermission.createMany({
    data: [
      { role: "ADMIN", feature: "customers", level: "MANAGE" },
      { role: "USER", feature: "customers", level: "EDIT" },
      { role: "BRAND", feature: "customers", level: "READ" },
      { role: "CHANNEL", feature: "customers", level: "EDIT" },
      { role: "ADMIN", feature: "contracts", level: "MANAGE" },
      { role: "USER", feature: "contracts", level: "EDIT" },
      { role: "BRAND", feature: "contracts", level: "READ" },
      { role: "CHANNEL", feature: "contracts", level: "READ" },
      { role: "ADMIN", feature: "bi", level: "MANAGE" },
      { role: "USER", feature: "bi", level: "EDIT" },
      { role: "BRAND", feature: "bi", level: "READ" },
      { role: "CHANNEL", feature: "bi", level: "READ" },
    ],
  });

  const ownedCustomer = await prisma.customer.create({
    data: { brandName: "Security Owned Customer", businessOwnerId: actors.user.id, createdById: actors.user.id },
  });
  const brandCustomer = await prisma.customer.create({
    data: { brandName: actors.brand.brandName!, createdById: actors.admin.id },
  });
  const channelCustomer = await prisma.customer.create({
    data: { brandName: "Security Channel Customer", channelUserId: actors.channel.id, createdById: actors.channel.id },
  });
  const unrelatedCustomer = await prisma.customer.create({
    data: { brandName: "Security Unrelated Customer", createdById: actors.admin.id },
  });

  return { actors, customers: { ownedCustomer, brandCustomer, channelCustomer, unrelatedCustomer } };
}

export async function sessionCookie(actor: SecurityActor): Promise<string> {
  const payload: SessionPayload = {
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
    status: "APPROVED",
    brandName: actor.brandName,
  };
  const token = await createSessionToken(payload);
  return `${SESSION_COOKIE}=${token}`;
}
