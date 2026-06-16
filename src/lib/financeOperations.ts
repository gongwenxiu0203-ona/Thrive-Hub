// Finance Operations: auto-calculation rules (grades, AR risk, pipeline, month helpers)

/** Monthly total income -> revenue grade S/A/B/C (RMB thresholds) */
export function calcRevenueGrade(monthlyTotalIncome: number): "S" | "A" | "B" | "C" {
  if (monthlyTotalIncome >= 100000) return "S";
  if (monthlyTotalIncome >= 50000) return "A";
  if (monthlyTotalIncome >= 20000) return "B";
  return "C";
}

/** Pipeline stage -> default win probability (percent) */
export function probabilityForStage(stage: string): number {
  switch (stage) {
    case "LEAD": return 10;
    case "CONTACTED": return 20;
    case "MEETING_SCHEDULED": return 30;
    case "PROPOSAL_SENT": return 50;
    case "NEGOTIATION": return 70;
    case "CONTRACT_SENT": return 90;
    case "WON": return 100;
    case "LOST": return 0;
    default: return 10;
  }
}

export interface ARRow {
  invoiceAmount: number;
  receivedAmount: number;
  dueDate: Date;
  actualReceivedDate: Date | null;
}

/** AR status: NOT_DUE | PAID | PARTIAL | OVERDUE */
export function calcArStatus(row: ARRow, today: Date = new Date()): "NOT_DUE" | "PAID" | "PARTIAL" | "OVERDUE" {
  const received = row.receivedAmount ?? 0;
  const invoice = row.invoiceAmount ?? 0;
  if (received >= invoice && invoice > 0) return "PAID";
  if (received > 0 && received < invoice) return "PARTIAL";
  // No payment received: classify by due date
  if (row.dueDate.getTime() < today.getTime()) return "OVERDUE";
  return "NOT_DUE";
}

/** AR risk level (based on status and overdue days) */
export function calcArRiskLevel(row: ARRow, today: Date = new Date()): "GREEN" | "YELLOW" | "ORANGE" | "RED" {
  const status = calcArStatus(row, today);
  if (status === "PAID") return "GREEN";
  if (status === "NOT_DUE") return "GREEN";
  // PARTIAL / OVERDUE: grade by overdue days
  const overdueDays = Math.floor((today.getTime() - row.dueDate.getTime()) / 86400000);
  if (overdueDays <= 0) return "GREEN";
  if (overdueDays <= 7) return "YELLOW";
  if (overdueDays <= 30) return "ORANGE";
  return "RED";
}

/** YYYY-MM key for the given (default current) month */
export function currentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** YYYY-MM -> [start, end] of that month */
export function monthRange(month: string): { start: Date; end: Date } {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999); // last day of month
  return { start, end };
}

// UI-facing labels and colors (intentionally Chinese; rendered in the UI only)

export const STAGE_LABELS: Record<string, string> = {
  LEAD: "Lead 初步线索",
  CONTACTED: "Contacted 已联系",
  MEETING_SCHEDULED: "Meeting Scheduled 会议预约",
  PROPOSAL_SENT: "Proposal Sent 方案已发",
  NEGOTIATION: "Negotiation 商务谈判",
  CONTRACT_SENT: "Contract Sent 合同已发",
  WON: "Won 已成交",
  LOST: "Lost 已流失",
};
export const STAGE_ORDER = [
  "LEAD",
  "CONTACTED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "CONTRACT_SENT",
  "WON",
  "LOST",
];

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  NEW: "新增",
  ACTIVE: "服务中",
  CHURNED: "流失",
  PAUSED: "暂停服务",
};

export const REVENUE_GRADE_COLORS: Record<string, string> = {
  S: "bg-fuchsia-100 text-fuchsia-700",
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-slate-100 text-slate-600",
};

export const AR_STATUS_LABELS: Record<string, string> = {
  NOT_DUE: "未到期",
  PAID: "已收款",
  PARTIAL: "部分收款",
  OVERDUE: "超期",
};

export const AR_STATUS_COLORS: Record<string, string> = {
  NOT_DUE: "bg-slate-100 text-slate-600",
  PAID: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-rose-100 text-rose-700",
};

export const AR_RISK_COLORS: Record<string, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-400",
  ORANGE: "bg-orange-500",
  RED: "bg-rose-600",
};
