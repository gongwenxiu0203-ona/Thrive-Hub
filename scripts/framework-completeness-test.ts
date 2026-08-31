import assert from "node:assert/strict";
import { frameworkMissingFields } from "../src/lib/frameworkCompleteness";

const complete = {
  partyA: "Customer Limited", partyACreditCode: "N/A", partyAAddress: "Address A", partyAContact: "A", partyAEmail: "a@example.com", partyAPhone: "1",
  partyBCompany: "THRAIVE", partyBContact: "B", partyBEmail: "b@example.com", partyBPhone: "2",
};
assert.deepEqual(frameworkMissingFields(complete, 2), []);
assert.ok(frameworkMissingFields({ ...complete, partyAEmail: "bad" }, 2).includes("甲方邮箱格式"));
assert.ok(frameworkMissingFields({ ...complete, partyBCompany: "INVALID" }, 2).includes("乙方签约主体"));
assert.ok(frameworkMissingFields(complete, 0).includes("乙方收款账户"));
console.log("PASS: framework completeness isolates master identity/contact/account requirements");
