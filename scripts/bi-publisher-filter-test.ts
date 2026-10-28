import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  exportSalesFilterQueryString,
  SALES_RECORD_FILTER_KEYS,
} from "../src/lib/salesRecordFilters";

const params = { publisherIds: "00017,00120", platforms: "Impact", brands: "Example", from: "2026-10-01", to: "2026-10-31" };
assert.deepEqual(csvFilterValues(params, "publisherIds"), ["00017", "00120"], "Publisher IDs remain strings with leading zeroes");
const where = buildSalesRecordWhereFromParams(params);
const clauses = where.AND as object[];
assert(clauses.some((value) => JSON.stringify(value) === JSON.stringify({ publisherId: { in: ["00017", "00120"] } })));
assert(clauses.some((value) => JSON.stringify(value) === JSON.stringify({ affiliatePlatform: { in: ["Impact"] } })), "network scope and Publisher ID are combined, not treated as a global identity");
assert(SALES_RECORD_FILTER_KEYS.includes("publisherIds"));
const exported = new URLSearchParams(exportSalesFilterQueryString(params));
assert.equal(exported.get("publisherIds"), "00017,00120");
assert.equal(exported.get("platforms"), "Impact");
assert.equal(exported.get("from"), "2026-10-01");
assert.deepEqual(buildSalesRecordWhereFromParams({ publisherIds: "" }), {});
assert.deepEqual(buildSalesRecordWhereFromParams({ publisherIds: EMPTY_FILTER_VALUE }), {
  AND: [{ OR: [{ publisherId: null }, { publisherId: "" }] }],
});

const page = readFileSync("src/app/(app)/bi/page.tsx", "utf8");
assert(page.includes('prisma.salesRecord.groupBy({ where: baseWhere, by: ["publisherId"] })'), "ID choices retain role-based baseWhere");
assert(page.includes("AND: [baseWhere, userWhere]"), "Publisher ID filtering cannot replace role scope");
const filters = readFileSync("src/app/(app)/bi/BIFilters.tsx", "utf8");
assert(filters.includes('paramKey="publisherIds"') && filters.includes("MultiSelectFilter"), "ID filter uses the existing searchable multi-select");
assert(filters.includes('"publisherIds"'), "clear-all includes Publisher IDs");
const detail = readFileSync("src/app/(app)/bi/SalesDetailTable.tsx", "utf8");
assert(detail.includes('r.unitsSold ?? "—"'), "unknown units display unavailable, not zero");
assert(detail.includes('url.protocol === "https:" || url.protocol === "http:"'), "Publisher URL links only allow HTTP(S)");
console.log("BI Publisher ID: string identity, combined filters, export propagation, role scope and nullable-detail guards passed.");
