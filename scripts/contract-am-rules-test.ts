import assert from "node:assert/strict";
import { contractAMClock } from "../src/lib/contractAMReminderRules";
assert.equal(contractAMClock(new Date("2026-12-05T00:59:59Z")).due,false);
assert.equal(contractAMClock(new Date("2026-12-05T01:00:00Z")).due,true);
assert.equal(contractAMClock(new Date("2026-12-05T15:59:59Z")).due,true);
assert.equal(contractAMClock(new Date("2026-12-05T16:00:00Z")).due,false);
assert.equal(contractAMClock(new Date("2026-12-04T16:00:00Z")).yearMonth,"2026-12");
assert.equal(contractAMClock(new Date("2026-12-06T01:00:00Z")).due,false);
console.log("PASS: Shanghai monthly fifth-day 09:00 window; no DB writes or messages.");
