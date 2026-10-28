import assert from "node:assert/strict";
import { convertRow, getMappableFields, SalesImportValidationError } from "../src/lib/salesImport";
import { getPlatform, PLATFORM_NAMES, suggestPlatformMapping } from "../src/lib/platformMappings";

const cases = [
  { platform: "Impact", name: "Partner", id: "Partner Id", url: "Referring URL", date: "Action Date", revenue: "Revenue", commission: "Action Cost", lock: "Locking Date", clicks: "Click to Action", status: false },
  { platform: "Rakuten", name: "Publisher Name", id: "Publisher ID", url: "Publisher URL", date: "Transaction Date", revenue: "Sales", commission: "Total Commission", lock: "Lock Status", clicks: "# of Clicks", status: true },
  { platform: "Webgains", name: "Publisher", id: "Publisher ID", url: "Publisher Site", date: "Date", revenue: "Sale Value", commission: "Commission", lock: "Lock Date", status: false },
  { platform: "AWIN", name: "site_name", id: "publisher_id", url: "URL", date: "Transaction Date", revenue: "sale_amount", commission: "commission", lock: "commission_status", status: true },
  { platform: "Tradedoubler", name: "publisherOrganizationName", id: "publisherOrganizationId", date: "Period", revenue: "orderValue", commission: "publisherCommission", clicks: "clicks" },
  { platform: "CJ", name: "Publisher Name", id: "Publisher CID", date: "Posting Date", revenue: "Sale Amount (USD)", commission: "Publisher Commission (USD)", clicks: "Clicks" },
];

assert.equal(PLATFORM_NAMES.length, 18, "keep the existing 12 platforms and add 6");
for (const field of ["store", "asin", "unitsSold"]) assert.equal(getMappableFields().find((item) => item.key === field)?.required, false);
for (const field of ["publisherId", "publisherUrl", "lockDate", "lockStatus"]) assert.equal(getMappableFields().find((item) => item.key === field)?.required, false);

for (const source of cases) {
  const row: Record<string, unknown> = {
    [source.name]: "Publisher sample", [source.id]: "001234", [source.date]: "2026-10-28",
    [source.revenue]: 200, [source.commission]: 20, Region: "Canada",
  };
  if (source.url) row[source.url] = "https://publisher.example/path";
  if (source.lock) row[source.lock] = source.status ? "pending" : "2026-11-15";
  if (source.clicks) row[source.clicks] = 100;
  const mapping = suggestPlatformMapping(source.platform, Object.keys(row));
  assert.equal(mapping.orderDate, source.date);
  assert.equal(mapping.region, "Region");
  if (source.clicks) assert.equal(mapping.clicks, source.clicks);
  const record = convertRow(row, mapping, source.platform, "customer-test", "test brand")!.record;
  assert.equal(record.store, null);
  assert.equal(record.asin, null);
  assert.equal(record.unitsSold, null);
  assert.equal(record.conversionRate, null);
  assert.equal(record.revenue, 200);
  assert.equal(record.commission, 20);
  assert.equal(record.publisherId, "001234");
  assert.equal(record.region, "CA");
  if (source.url) {
    assert.equal(record.publisherUrl, "https://publisher.example/path");
    assert.equal(record.promotionLink, null, "publisher URL is not a promotion link");
  }
  if (source.lock) {
    if (source.status) {
      assert.equal(record.lockStatus, "pending");
      assert.equal(record.lockDate, null);
    } else {
      assert.equal((record.lockDate as Date).toISOString().slice(0, 10), "2026-11-15");
      assert.equal(record.lockStatus, null);
    }
  }
  assert.throws(() => convertRow({ ...row, Region: "" }, mapping, source.platform, "customer-test", "test brand"), /地区 Region/);
}

const row = { Date: "2026-10-28", Publisher: "P", Revenue: "100", Commission: "5", Region: "US", Qty: "0", Clicks: 10 };
const mapping = { orderDate: "Date", affiliateName: "Publisher", revenue: "Revenue", commission: "Commission", region: "Region", unitsSold: "Qty", clicks: "Clicks" };
assert.equal(convertRow(row, mapping, "Impact", "c", "B")!.record.unitsSold, 0);
assert.equal(convertRow(row, mapping, "Impact", "c", "B")!.record.conversionRate, 0);
assert.equal(convertRow({ ...row, Qty: " " }, mapping, "Impact", "c", "B")!.record.unitsSold, null);
assert.throws(() => convertRow({ ...row, Qty: "unknown" }, mapping, "Impact", "c", "B"), SalesImportValidationError);
assert.throws(() => convertRow({ ...row, Qty: "1.5" }, mapping, "Impact", "c", "B"), /有效整数/);
assert.throws(() => convertRow({ ...row, Lock: "pending" }, { ...mapping, lockDate: "Lock" }, "Impact", "c", "B"), /锁定日期/);
assert.throws(() => convertRow({ ...row, Lock: "2026-02-31" }, { ...mapping, lockDate: "Lock" }, "Impact", "c", "B"), /锁定日期/);
assert.equal(convertRow({ ...row, Lock: "" }, { ...mapping, lockDate: "Lock" }, "Impact", "c", "B")!.record.lockDate, null);
assert.equal(convertRow(row, mapping, "Impact", "c", "B")!.record.commissionRate, 0.05);

// Existing platform fallbacks and mappings remain intact.
assert.equal(getPlatform("PartnerBoost")?.defaultRegion, "US");
assert.equal(suggestPlatformMapping("PartnerBoost", ["publisher name", "quantity", "ori amount"]).unitsSold, "quantity");
assert.equal(convertRow(row, { ...mapping, region: "" }, "PartnerBoost", "c", "B")!.record.region, "US");
assert.equal(getPlatform("awin")?.name, "AWIN");
const universal = suggestPlatformMapping("CJ", ["平台联盟商名称", "订单日期", "销售金额", "联盟商佣金", "地区", "销售数量", "Publisher ID"]);
assert.equal(universal.unitsSold, "销售数量");
assert.equal(universal.region, "地区");
assert.equal(universal.publisherId, "Publisher ID");
console.log("BI optional import: six platform mappings, strict Region, nullable quantity, publisher identity and lock date/status checks passed (no database writes).");
