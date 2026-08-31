import { confirmationDraftSchema, type ContractConfirmationDraft } from "./contractConfirmationDraft";

export type ConfirmationReconciliation = {
  projectConfirmationId?: string | null;
  ruleSnapshot?: string | null;
  reconcileType?: string;
  confirmedCommissionRate?: number | null;
};

export function readReconciliationConfirmation(rec: ConfirmationReconciliation): ContractConfirmationDraft | null {
  if (!rec.projectConfirmationId) return null;
  try {
    const snapshot = JSON.parse(rec.ruleSnapshot || "{}");
    if (snapshot.schemaVersion !== 1 || snapshot.confirmationId !== rec.projectConfirmationId) return null;
    return confirmationDraftSchema.parse(snapshot.data);
  } catch { return null; }
}

export function confirmationSubmissionIssue(rec: ConfirmationReconciliation): string | null {
  if (!rec.projectConfirmationId) return null;
  const draft = readReconciliationConfirmation(rec);
  if (!draft) return "项目确认书计费快照缺失或版本不支持，请联系管理员核对";
  if (rec.reconcileType === "FEE_ONLY") return null;
  if (!draft.commission) return "本确认书没有启用销售佣金";
  if (draft.commission.mode === "PACKAGE" && (rec.confirmedCommissionRate == null || !Number.isFinite(rec.confirmedCommissionRate) || rec.confirmedCommissionRate < 0 || rec.confirmedCommissionRate > 1)) return "总包佣金：请先在本期记录填写并保存实际抽佣比例";
  if (["CAMPAIGN", "PUBLISHER"].includes(draft.commission.basis)) return "本确认书须先核定订单唯一归属及可计佣GMV；当前不能按客户总GMV提交";
  return null;
}
