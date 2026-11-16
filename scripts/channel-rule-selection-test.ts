import assert from 'node:assert/strict';
import { selectApplicableChannelRule, type ChannelRuleCandidate } from '../src/lib/channelRuleSelection';
import { selectBasicCommissionRate, calculateShareAmount, calcTieredCommission } from '../src/lib/channelSplit';
const date = (s: string) => new Date(s);
const input = { businessContractId: 'brand', periodStart: date('2026-09-01'), periodEnd: date('2026-09-30') };
function rule(id: string, contractId: string | null, type = 'CHANNEL'): ChannelRuleCandidate {
  return { id, contractId, splitEndDate: date('2026-12-31'), contract: contractId ? { id: contractId, contractNo: contractId, type, status: 'COMPLETED', deletedAt: null, startDate: date('2026-01-01'), endDate: date('2026-12-31') } : null } as ChannelRuleCandidate;
}
const customer = rule('default', null), channel = rule('channel-rule', 'channel'), direct = rule('direct', 'brand', 'BRAND');
assert.equal(selectApplicableChannelRule([customer, channel], input)?.id, channel.id);
assert.equal(selectApplicableChannelRule([customer, channel, direct], input)?.id, direct.id);
assert.equal(selectApplicableChannelRule([customer], input)?.id, customer.id);
assert.equal(selectApplicableChannelRule([], input), null);
assert.throws(() => selectApplicableChannelRule([channel, rule('other', 'second'), customer], input), /多份/);
assert.throws(() => selectApplicableChannelRule([customer, rule('default2', null)], input), /多条/);
assert.equal(selectApplicableChannelRule([channel, customer, rule('default2', null)], input)?.id, channel.id);
for (const change of [
  (r: ChannelRuleCandidate) => { r.contract!.status = 'TERMINATED'; },
  (r: ChannelRuleCandidate) => { r.contract!.deletedAt = new Date(); },
  (r: ChannelRuleCandidate) => { r.contract!.startDate = date('2026-09-15'); },
  (r: ChannelRuleCandidate) => { r.splitEndDate = date('2026-09-15'); },
  (r: ChannelRuleCandidate) => { r.contract!.endDate = date('2026-09-15'); },
]) { const candidate = rule('invalid', 'channel'); change(candidate); assert.equal(selectApplicableChannelRule([candidate, customer], input)?.id, customer.id); }
assert.equal(selectApplicableChannelRule([channel], { ...input, periodEnd: date('2026-12-31T15:59:59Z') })?.id, channel.id);
assert.equal(selectBasicCommissionRate(4399), .15);
assert.equal(selectBasicCommissionRate(4400), .25);
assert.equal(selectBasicCommissionRate(4999, 5000, .12, .3), .12);
assert.equal(calculateShareAmount(5000, selectBasicCommissionRate(5000, 5000, .12, .3)), 1500);
assert.equal(calcTieredCommission(300000, [{gmvMin:0,gmvMax:100000,rate:.15},{gmvMin:100000,gmvMax:null,rate:.2}]), 55000);
console.log('PASS: direct contract / unique effective channel contract / customer fallback, conflict and period validity; pure fixtures, no DB writes.');
