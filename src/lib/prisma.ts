import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // Enable WAL mode and busy timeout for better SQLite concurrency.
  // PRAGMA journal_mode returns a result row, so use $queryRawUnsafe.
  client.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
  client.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
