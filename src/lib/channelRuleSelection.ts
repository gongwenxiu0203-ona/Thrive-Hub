import type { ChannelSplitRule, Prisma } from '@prisma/client';

export type ChannelRuleCandidate = ChannelSplitRule & {
  contract: { id: string; contractNo: string; status: string; deletedAt: Date | null; startDate: Date | null; endDate: Date | null; type: string } | null;
};
type SelectionInput = { businessContractId: string; periodStart: Date; periodEnd?: Date };
const day = (date: Date) => date.toISOString().slice(0, 10);

/** Resolve new records only. Historical records must retain their bound splitRuleId. */
export function selectApplicableChannelRule(rules: ChannelRuleCandidate[], input: SelectionInput): ChannelRuleCandidate | null {
  const start = day(input.periodStart), end = day(input.periodEnd ?? input.periodStart);
  const valid = (rule: ChannelRuleCandidate) => day(rule.splitEndDate) >= end && (!rule.contract || (
    !rule.contract.deletedAt && rule.contract.status === 'COMPLETED' &&
    !!rule.contract.startDate && day(rule.contract.startDate) <= start &&
    (!rule.contract.endDate || day(rule.contract.endDate) >= end)
  ));
  const direct = rules.find(rule => rule.contractId === input.businessContractId && valid(rule));
  if (direct) return direct;
  const channel = rules.filter(rule => rule.contract?.type === 'CHANNEL' && valid(rule));
  if (channel.length > 1) throw new Error('同一客户在该周期存在多份有效渠道返佣合同规则，请人工核对；系统不会猜选或退回客户默认规则。');
  if (channel.length === 1) return channel[0];
  const defaults = rules.filter(rule => !rule.contractId && valid(rule));
  if (defaults.length > 1) throw new Error('客户存在多条有效默认分账规则，请先核对。');
  return defaults[0] ?? null;
}

export async function resolveApplicableChannelRule(db: Pick<Prisma.TransactionClient, 'channelSplitRule'>, input: SelectionInput & { customerId: string }) {
  const rules = await db.channelSplitRule.findMany({
    where: { customerId: input.customerId },
    include: { contract: { select: { id: true, contractNo: true, status: true, deletedAt: true, startDate: true, endDate: true, type: true } } },
  });
  return selectApplicableChannelRule(rules, input);
}
