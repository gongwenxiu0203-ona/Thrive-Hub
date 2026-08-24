import assert from "node:assert/strict";
import {
  buildCommissionPeriods,
  buildFixedFeePeriods,
} from "../src/lib/customerReconciliationPlan";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const compact = (periods: { start: Date; end: Date }[]) => periods.map((period) => [
  period.start.toISOString().slice(0, 10),
  period.end.toISOString().slice(0, 10),
]);

assert.deepEqual(
  compact(buildFixedFeePeriods(date("2026-01-15"), date("2026-04-20"))),
  [
    ["2026-01-15", "2026-02-13"],
    ["2026-02-14", "2026-03-15"],
    ["2026-03-16", "2026-04-14"],
    ["2026-04-15", "2026-04-20"],
  ],
  "固定费应按包含首尾日期的连续 30 天切分，并缩短末期",
);

assert.deepEqual(
  compact(buildCommissionPeriods(date("2026-01-15"), date("2026-04-20"))),
  [
    ["2026-01-15", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-31"],
    ["2026-04-01", "2026-04-20"],
  ],
  "佣金首期应到月末、随后按自然月、末期截止合同结束日",
);

assert.deepEqual(
  compact(buildCommissionPeriods(date("2028-02-01"), date("2028-02-29"))),
  [["2028-02-01", "2028-02-29"]],
  "佣金自然月应正确处理闰年",
);

assert.deepEqual(
  compact(buildFixedFeePeriods(date("2026-08-21"), date("2026-08-21"))),
  [["2026-08-21", "2026-08-21"]],
  "单日合同应生成一期",
);

assert.equal(buildFixedFeePeriods(date("2026-08-22"), date("2026-08-21")).length, 0);
assert.equal(buildCommissionPeriods(date("2026-08-22"), date("2026-08-21")).length, 0);

console.log("customer reconciliation plan tests passed");
