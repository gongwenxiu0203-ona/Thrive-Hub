import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archivedFixedFeePercent, archivedSplitTerms, canActivateArchivedSplit, shouldUpdateArchivedSplit } from "../src/lib/channelArchiveRules";
for (const role of ["ADMIN","USER"]) {
  assert.equal(canActivateArchivedSplit(role,"READ"),false);
  assert.equal(canActivateArchivedSplit(role,"NONE"),false);
  assert.equal(canActivateArchivedSplit(role,"EDIT"),true);
  assert.equal(canActivateArchivedSplit(role,"MANAGE"),true);
}
for (const role of ["CHANNEL","BRAND","LYNQ_STAFF","UNKNOWN"]) assert.equal(canActivateArchivedSplit(role,"MANAGE"),false);
assert.equal(shouldUpdateArchivedSplit(true,false),false,"Editing contacts/original cannot approve a pending rule");
assert.equal(shouldUpdateArchivedSplit(false,false),false);
assert.equal(shouldUpdateArchivedSplit(false,true),false);
assert.equal(shouldUpdateArchivedSplit(true,true),true);
for (const n of [0,30,99.99,100]) {
  assert.equal(archivedFixedFeePercent(archivedSplitTerms(n,false)),n);
  assert.match(archivedSplitTerms(n,false),/非生效分账规则/);
}
assert.equal(archivedFixedFeePercent("旧合同文本"),null);
assert.throws(()=>archivedSplitTerms(NaN,false));
assert.throws(()=>archivedSplitTerms(101,false));
const source=readFileSync("src/actions/contracts.ts","utf8");
const upload=source.slice(source.indexOf("export async function uploadChannelContract"),source.indexOf("export async function updateArchiveContract"));
assert.ok(!upload.includes('await requireFeaturePermission(session, "finance.channel_split_rules", "EDIT")'));
assert.ok(upload.includes('if (canActivateSplit) await tx.channelSplitRule.create'));
const edit=source.slice(source.indexOf("export async function updateArchiveContract"),source.indexOf("export async function",source.indexOf("export async function updateArchiveContract")+25));
assert.ok(edit.includes('shouldUpdateArchivedSplit(canActivateSplit, !!current.splitRule)'));
assert.ok(!edit.includes('tx.channelSplitRule.create'));
assert.ok(edit.includes('archivedSplitTerms(fixedFeePercent, false)'));
assert.ok(edit.includes('!canActivateSplit && current.splitRule'));
const detail=readFileSync("src/app/(app)/contracts/[id]/page.tsx","utf8");
assert.ok(detail.includes('(!isSimpleArchive || contract.type === "CHANNEL") && canConfigureSplitRule && contract.customerId'));
console.log("Channel archive permission/record separation and edit guard tests passed; no database or file upload performed.");
