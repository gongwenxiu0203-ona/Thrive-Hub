type RequestLine = { reconciliationId: string; contractId: string };

export function billingRequestLinkIssue(input: {
  sourceType: string;
  contractId: string | null;
  lines: RequestLine[];
  manualItemCount: number;
  selectedContractIds: string[];
  selectedReconciliationIds: string[];
}): string | null {
  const { sourceType, contractId, lines, manualItemCount, selectedContractIds, selectedReconciliationIds } = input;
  if (sourceType === "MANUAL") {
    if (lines.length || !manualItemCount || selectedReconciliationIds.length) return "开票申请明细不完整，请返回财务工作台核对申请。";
    return selectedContractIds.length === 1 && selectedContractIds[0] === contractId
      ? null
      : "所选合同与开票申请不一致。";
  }
  if (sourceType !== "RECONCILIATION") return "开票申请来源无效，请返回财务工作台核对申请。";
  if (!lines.length || manualItemCount) return "开票申请的对账明细不完整，请返回财务工作台核对申请。";
  const requestReconciliationIds = [...new Set(lines.map((line) => line.reconciliationId))];
  const requestContractIds = [...new Set(lines.map((line) => line.contractId))];
  return requestReconciliationIds.length === selectedReconciliationIds.length &&
    requestReconciliationIds.every((id) => selectedReconciliationIds.includes(id)) &&
    requestContractIds.length === selectedContractIds.length &&
    requestContractIds.every((id) => selectedContractIds.includes(id))
    ? null
    : "所选对账记录或合同与开票申请不一致。";
}
