// Constants for the contract template commission-mechanism taxonomy.
// Kept OUT of any "use server" file because Next.js 15 forbids non-function
// exports from server-action modules.

export const TEMPLATE_KEY_LABELS: Record<string, string> = {
  FIXED: "全量·固佣",
  SPECIAL: "特殊佣金",
  TIERED: "全量·阶梯式佣金",
  THRESHOLD: "全量·门槛佣金",
  INCREMENTAL: "增量·佣金",
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_KEY_LABELS);
