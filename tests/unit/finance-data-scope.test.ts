import assert from "node:assert/strict";
import test from "node:test";
import {
  channelReconciliationScope,
  financeDataView,
  kpiScope,
  reconciliationScope,
} from "../../src/lib/dataScope";

const admin = { userId: "admin-1", role: "ADMIN", brandName: null };
const employee = { userId: "user-1", role: "USER", brandName: null };
const brand = { userId: "brand-1", role: "BRAND", brandName: "Brand A" };
const channel = { userId: "channel-1", role: "CHANNEL", brandName: null };

test("ADMIN and USER share the complete finance data domain", () => {
  assert.equal(financeDataView(admin), "all");
  assert.equal(financeDataView(employee), "all");
  assert.deepEqual(reconciliationScope(employee, financeDataView(employee)), {});
  assert.deepEqual(channelReconciliationScope(employee, financeDataView(employee)), {});
  assert.deepEqual(kpiScope(employee, financeDataView(employee)), {});
});

test("BRAND and CHANNEL retain tenant-isolated finance scopes", () => {
  assert.equal(financeDataView(brand), "mine");
  assert.equal(financeDataView(channel), "mine");
  assert.deepEqual(reconciliationScope(brand, financeDataView(brand)), {
    customer: { brandName: "Brand A" },
  });
  assert.deepEqual(channelReconciliationScope(channel, financeDataView(channel)), {
    channelUserId: "channel-1",
  });
  assert.deepEqual(kpiScope(channel, financeDataView(channel)), {
    id: "__NO_ACCESS__",
  });
});
