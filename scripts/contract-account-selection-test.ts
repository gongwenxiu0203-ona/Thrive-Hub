import assert from "node:assert/strict";
import { defaultContractAccountIds } from "../src/lib/contractAccountSelection";

const accounts = [
  { id: "explicit", legalEntity: "Different payee name", legalEntityKey: "THRAIVE" },
  { id: "legacy", legalEntity: "Hong Kong Thraive Digital Marketing Technology Co., Limited" },
  { id: "other", legalEntity: "佛山市灵跃出海品牌策划有限公司" },
  { id: "key-wins", legalEntity: "THRAIVE", legalEntityKey: "LINGYUE" },
  { id: "unknown", legalEntity: "" },
];
assert.deepEqual(defaultContractAccountIds(accounts, "THRAIVE"), ["explicit", "legacy"]);
assert.deepEqual(defaultContractAccountIds(accounts, "LINGYUE"), ["other", "key-wins"]);
assert.deepEqual(defaultContractAccountIds(accounts, "unknown"), []);
assert.equal(accounts.length, 5, "defaulting must not remove manually selectable accounts");
console.log("PASS: explicit entity link, legacy name matching, entity switch and manual availability");
