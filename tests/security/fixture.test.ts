import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { verifySessionToken } from "../../src/lib/auth";
import {
  actors,
  assertIsolatedSecurityDatabase,
  createSecurityPrisma,
  seedFourRoleFixture,
  sessionCookie,
} from "./fixture";

const prisma = createSecurityPrisma();

before(async () => {
  await seedFourRoleFixture(prisma);
});

after(async () => {
  await prisma.$disconnect();
});

test("fixture is bound to an isolated security-test database", () => {
  const path = assertIsolatedSecurityDatabase();
  assert.match(path, /security-test-/);
});

test("fixture creates ADMIN, USER, BRAND and CHANNEL actors", async () => {
  const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
  assert.deepEqual(new Set(users.map((user) => user.role)), new Set(["ADMIN", "USER", "BRAND", "CHANNEL"]));
  assert.equal(users.length, 4);
});

test("fixture creates owned, brand, channel and unrelated customers", async () => {
  const customers = await prisma.customer.findMany();
  assert.equal(customers.length, 4);
  assert.equal(customers.some((customer) => customer.businessOwnerId === actors.user.id), true);
  assert.equal(customers.some((customer) => customer.brandName === actors.brand.brandName), true);
  assert.equal(customers.some((customer) => customer.channelUserId === actors.channel.id), true);
});

test("each actor can receive a valid authentication cookie", async () => {
  for (const actor of Object.values(actors)) {
    const cookie = await sessionCookie(actor);
    const token = cookie.split("=", 2)[1];
    const session = await verifySessionToken(token);
    assert.equal(session?.userId, actor.id);
    assert.equal(session?.role, actor.role);
  }
});
