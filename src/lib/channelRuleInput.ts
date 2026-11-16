export type ChannelRuleValues = { ruleType: 'A' | 'B'; commissionThresholdAmount: number; commissionThresholdCurrency: string; commissionBelowRate: number; commissionAtOrAboveRate: number; commissionRate: number | null; tieredRules: string };
export function parseChannelRuleForm(fd: FormData): ChannelRuleValues {
  const ruleType = String(fd.get('splitRuleType') || 'A');
  if (ruleType !== 'A' && ruleType !== 'B') throw new Error('请选择有效分账规则');
  const number = (key: string, fallback: number) => { const raw = fd.get(key); const value = raw === null ? fallback : String(raw).trim() ? Number(raw) : NaN; if (!Number.isFinite(value) || value < 0) throw new Error('分账金额和比例必须填写有效非负数'); return value; };
  const threshold = number('commissionThresholdAmount', 4400);
  const below = number('commissionBelowPercent', 15) / 100;
  const above = number('commissionAtOrAbovePercent', 25) / 100;
  if (below > 1 || above > 1) throw new Error('佣金比例需在0%至100%之间');
  let tiers: {gmvMin:number;gmvMax:number|null;rate:number}[] = [];
  if (ruleType === 'B') {
    let raw: unknown; try { raw = JSON.parse(String(fd.get('tieredRules') || '[]')); } catch { throw new Error('阶梯规则格式无效'); }
    if (!Array.isArray(raw) || !raw.length) throw new Error('请至少填写一档阶梯规则');
    tiers = raw.map(row => { if (!row || typeof row !== 'object') throw new Error('阶梯规则无效'); const {gmvMin,gmvMax,rate} = row; if (![gmvMin,rate].every(n => typeof n === 'number' && Number.isFinite(n)) || gmvMin < 0 || rate < 0 || rate > 1 || (gmvMax !== null && (typeof gmvMax !== 'number' || !Number.isFinite(gmvMax) || gmvMax <= gmvMin))) throw new Error('阶梯上下限或比例无效'); return {gmvMin,gmvMax,rate}; });
    if (tiers[0].gmvMin !== 0 || tiers[tiers.length-1].gmvMax !== null || tiers.some((t,i) => i>0 && tiers[i-1].gmvMax !== t.gmvMin)) throw new Error('阶梯须从0开始连续覆盖，最后一档上限留空');
  }
  return {ruleType,commissionThresholdAmount:threshold,commissionThresholdCurrency:'USD',commissionBelowRate:below,commissionAtOrAboveRate:above,commissionRate:ruleType==='A'?below:null,tieredRules:JSON.stringify(tiers)};
}
export function describeChannelRule(rule: ChannelRuleValues): string {
  return rule.ruleType === 'A' ? `低于 USD ${rule.commissionThresholdAmount} 按 ${rule.commissionBelowRate*100}%；达到或超过按 ${rule.commissionAtOrAboveRate*100}%（整档）` : `按累计GMV分段阶梯：${JSON.parse(rule.tieredRules).map((t:{gmvMin:number;gmvMax:number|null;rate:number})=>`${t.gmvMin}~${t.gmvMax??'∞'}按${t.rate*100}%`).join('；')}`;
}
