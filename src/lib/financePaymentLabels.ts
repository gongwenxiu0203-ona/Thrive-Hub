export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  SUPPLIER: "公司采购付款", CHANNEL: "渠道商付款", AFFILIATE: "联盟商固费付款",
  TAX: "税费", PAYROLL: "薪酬", OTHER: "其他", REIMBURSEMENT: "费用报销",
};
export function paymentTypeLabel(value: string) {
  return PAYMENT_TYPE_LABELS[value.toUpperCase()] ?? "其他";
}
