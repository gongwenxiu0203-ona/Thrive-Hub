import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGmvDueDates,
  buildMonthlyFeeDueDates,
} from "../src/lib/receivableTaskAutomation";

const isoDates = (dates: Date[]) => dates.map((date) => date.toISOString().slice(0, 10));

test("monthly fee starts after 28 days and stops at the contract end", () => {
  assert.deepEqual(
    isoDates(buildMonthlyFeeDueDates(
      new Date("2026-01-31T00:00:00.000Z"),
      new Date("2026-04-25T00:00:00.000Z"),
    )),
    ["2026-02-28", "2026-03-28", "2026-04-25"],
  );
});

test("monthly fee includes a due date exactly on the contract end", () => {
  assert.deepEqual(
    isoDates(buildMonthlyFeeDueDates(
      new Date("2024-02-01T00:00:00.000Z"),
      new Date("2024-02-29T00:00:00.000Z"),
    )),
    ["2024-02-29"],
  );
});

test("monthly fee produces no period when the first due date is after the end", () => {
  assert.deepEqual(
    buildMonthlyFeeDueDates(
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-28T00:00:00.000Z"),
    ),
    [],
  );
});

test("GMV starts on next month's fifth and includes the fifth after contract end", () => {
  assert.deepEqual(
    isoDates(buildGmvDueDates(
      new Date("2026-01-31T00:00:00.000Z"),
      new Date("2026-04-01T00:00:00.000Z"),
    )),
    ["2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05"],
  );
});

test("a one-day contract still has one GMV collection date next month", () => {
  assert.deepEqual(
    isoDates(buildGmvDueDates(
      new Date("2026-12-31T00:00:00.000Z"),
      new Date("2026-12-31T00:00:00.000Z"),
    )),
    ["2027-01-05"],
  );
});
