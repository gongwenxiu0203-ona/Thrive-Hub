// Contract transcription is not payment authorization.
export function canActivateArchivedSplit(role: string, permission: string): boolean {
  return (role === "ADMIN" || role === "USER") && (permission === "EDIT" || permission === "MANAGE");
}
export function shouldUpdateArchivedSplit(canConfigure: boolean, hasExistingRule: boolean): boolean {
  // Ordinary archive edits are never an implicit approval of a pending rule.
  return canConfigure && hasExistingRule;
}
export function archivedSplitTerms(percent: number, active: boolean): string {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("乙方比例无效");
  return `合同归档记录（${active ? "分账已授权设置" : "待有分账权限的人员确认，非生效分账规则"}）；固定月度服务费渠道合作费：乙方 ${percent}%；联盟运营佣金渠道合作费：低于 USD 4,400 按 15%；达到或超过 USD 4,400 按 25%`;
}
export function archivedFixedFeePercent(terms: string | null | undefined): number | null {
  if (!terms?.startsWith("合同归档记录（")) return null;
  const value = terms.match(/固定月度服务费渠道合作费：乙方 ([\d.]+)%/)?.[1];
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
