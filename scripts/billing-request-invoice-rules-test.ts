import assert from "node:assert/strict";
import { billingRequestLinkIssue } from "../src/lib/billingRequestInvoiceRules";

assert.equal(billingRequestLinkIssue({
  sourceType: "MANUAL", contractId: "contract-a", lines: [], manualItemCount: 2,
  selectedContractIds: ["contract-a"], selectedReconciliationIds: [],
}), null, "approved manual requests do not require a reconciliation");

assert.match(billingRequestLinkIssue({
  sourceType: "MANUAL", contractId: "contract-a", lines: [], manualItemCount: 2,
  selectedContractIds: ["contract-b"], selectedReconciliationIds: [],
}) ?? "", /合同/, "the request's contract remains mandatory");

assert.equal(billingRequestLinkIssue({
  sourceType: "RECONCILIATION", contractId: null, manualItemCount: 0,
  lines: [
    { reconciliationId: "rec-1", contractId: "contract-a" },
    { reconciliationId: "rec-2", contractId: "contract-b" },
  ],
  selectedContractIds: ["contract-b", "contract-a"], selectedReconciliationIds: ["rec-1", "rec-2"],
}), null, "reconciliation requests retain their original links");

assert.match(billingRequestLinkIssue({
  sourceType: "RECONCILIATION", contractId: null, manualItemCount: 0,
  lines: [{ reconciliationId: "rec-1", contractId: "contract-a" }],
  selectedContractIds: ["contract-a"], selectedReconciliationIds: [],
}) ?? "", /对账记录/, "reconciliation links cannot be removed from a reconciliation request");

console.log("Billing request Invoice source checks passed.");
