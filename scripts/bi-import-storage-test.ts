import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { convertRow } from "../src/lib/salesImport";
import { buildSalesRecordWhereFromParams } from "../src/lib/salesRecordFilters";

if (!process.env.DATABASE_URL?.includes("thrive-bi-optional-")) {
  throw new Error("此测试只能在 BI 专用临时数据库副本运行");
}
const prisma = new PrismaClient();
class RollbackFixture extends Error {}

async function main() {
  const baseline = await prisma.salesRecord.aggregate({ _count: true, _sum: { revenue: true, commission: true } });
  let verified = false;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: {
        name: "BI isolated test", email: `bi-isolated-${Date.now()}@example.test`, passwordHash: "test-only", role: "ADMIN",
      } });
      const batch = await tx.salesBatch.create({ data: { fileName: "TEST-BI-OPTIONAL.csv", uploaderId: user.id } });
      const mapping = { affiliateName: "Name", publisherId: "ID", publisherUrl: "URL", region: "Region", orderDate: "Date", unitsSold: "Units", clicks: "Clicks", revenue: "Revenue", commission: "Commission", lockDate: "Lock", lockStatus: "Status" };
      const raw = { Name: "Isolated publisher", ID: "000123", URL: "https://publisher.example", Region: "US", Date: "2026-10-28", Clicks: 10, Revenue: 200, Commission: 20, Lock: "2026-11-01", Status: "pending" };
      const fixtures = [
        { ...raw, Units: "", platform: "Impact" },
        { ...raw, Units: 0, Revenue: 100, Commission: 10, platform: "CJ" },
        { ...raw, Units: 3, ID: "000456", Revenue: 100, Commission: 10, platform: "Impact" },
      ];
      for (const fixture of fixtures) {
        const record = convertRow(fixture, mapping, fixture.platform, null, "Isolated BI")!.record;
        await tx.salesRecord.create({ data: { ...record, batchId: batch.id } });
      }
      const scoped = { batchId: batch.id };
      const rows = await tx.salesRecord.findMany({ where: scoped });
      assert.equal(rows.length, 3);
      const absent = rows.find((row) => row.publisherId === "000123" && row.affiliatePlatform === "Impact")!;
      assert.equal(absent.unitsSold, null);
      assert.equal(absent.conversionRate, null);
      assert.equal(absent.asin, null);
      assert.equal(absent.store, null);
      assert.equal(absent.publisherUrl, raw.URL);
      assert.equal(absent.lockDate?.toISOString().slice(0, 10), "2026-11-01");
      assert.equal(absent.lockStatus, "pending");
      assert.equal(rows.find((row) => row.affiliatePlatform === "CJ")!.unitsSold, 0);
      const totals = await tx.salesRecord.aggregate({ where: scoped, _count: { _all: true, unitsSold: true }, _sum: { unitsSold: true, revenue: true, commission: true } });
      assert.deepEqual(totals._count, { _all: 3, unitsSold: 2 });
      assert.deepEqual(totals._sum, { unitsSold: 3, revenue: 400, commission: 40 });
      const publisherRows = await tx.salesRecord.findMany({ where: { AND: [scoped, buildSalesRecordWhereFromParams({ publisherIds: "000123" })] } });
      assert.equal(publisherRows.length, 2, "same ID across networks filters both records; never merges rows");
      const impact = await tx.salesRecord.findMany({ where: { AND: [scoped, buildSalesRecordWhereFromParams({ publisherIds: "000123", platforms: "Impact" })] } });
      assert.equal(impact.length, 1);
      const unknown = await tx.salesRecord.aggregate({ where: { id: absent.id }, _sum: { unitsSold: true } });
      assert.equal(unknown._sum.unitsSold, null);
      verified = true;
      throw new RollbackFixture();
    }, { timeout: 30000 });
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error;
  }
  assert(verified);
  const after = await prisma.salesRecord.aggregate({ _count: true, _sum: { revenue: true, commission: true } });
  assert.deepEqual(after, baseline, "temporary fixtures must leave historical BI untouched");
  console.log("BI storage: nullable quantity/ratios, publisher IDs, lock fields, scoped filters and rollback of test fixtures passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
