export const SYSTEM_ERROR_CATALOG = [
  { code: "RECONCILIATION_INVALID_AMOUNT", title: "对账金额无效", description: "对账金额不是有效的非负数。", suggestion: "检查固费、销售额和币种，输入有效金额后重试。" },
  { code: "AUTH_REQUIRED", title: "登录失效", description: "需要有效登录状态。", suggestion: "重新登录后再试。" },
  { code: "PERMISSION_DENIED", title: "权限不足", description: "当前账号没有执行此操作的权限。", suggestion: "核对管理员面板中的功能权限；不要用修改数据绕过权限。" },
  { code: "DATABASE_VALIDATION", title: "数据库参数校验失败", description: "提交给数据库的字段或数值不符合要求。", suggestion: "联系维护人员检查字段映射、数值有效性及 Prisma 客户端版本。" },
  { code: "DATABASE_CONFLICT", title: "数据重复或关联冲突", description: "唯一编号重复或关联关系不符合要求。", suggestion: "检查重复编号和关联记录后重试。" },
  { code: "DATABASE_UNAVAILABLE", title: "数据库暂不可用", description: "数据库连接、锁或结构状态异常。", suggestion: "维护人员检查连接、数据库迁移及服务状态。不要重置数据库。" },
  { code: "DATABASE_ERROR", title: "数据库操作异常", description: "数据库操作未完成。", suggestion: "提供追踪码给维护人员检查。" },
  { code: "BUSINESS_ERROR", title: "业务校验未通过", description: "操作未满足业务规则。", suggestion: "根据操作页面提示修正内容后重试。" },
  { code: "UNEXPECTED_ERROR", title: "未预期系统异常", description: "系统处理操作时出现异常。", suggestion: "提供错误追踪码、发生时间和操作步骤给维护人员。" },
] as const;

function field(error: unknown, key: string): unknown {
  try { return error !== null && typeof error === "object" ? Reflect.get(error, key) : undefined; }
  catch { return undefined; }
}

export function classifySystemError(error: unknown): string {
  const name = field(error, "name");
  const code = field(error, "code");
  if (code === "FEATURE_PERMISSION_DENIED" || field(error, "status") === 403) return "PERMISSION_DENIED";
  if (field(error, "status") === 401) return "AUTH_REQUIRED";
  if (name === "AppError") return typeof code === "string" && SYSTEM_ERROR_CATALOG.some(item => item.code === code) ? code : "BUSINESS_ERROR";
  if (name === "PrismaClientValidationError") return "DATABASE_VALIDATION";
  if (code === "P2002" || code === "P2003") return "DATABASE_CONFLICT";
  if (typeof code === "string" && ["P1000", "P1001", "P1002", "P1008", "P1017", "P2021", "P2022", "P2024", "P2034"].includes(code)) return "DATABASE_UNAVAILABLE";
  if (typeof name === "string" && name.startsWith("PrismaClient")) return "DATABASE_ERROR";
  return "UNEXPECTED_ERROR";
}

// Never serialize message, stack, meta, cause, requests, arguments or arbitrary fields.
export function sanitizeTechnicalDetails(error: unknown): string {
  const allowedNames = ["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "AppError", "FeaturePermissionError", "PrismaClientValidationError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientInitializationError", "PrismaClientRustPanicError"];
  const name = field(error, "name");
  const code = field(error, "code");
  const diagnosticFlags: string[] = [];
  if (name === "PrismaClientValidationError") {
    const message = field(error, "message");
    if (typeof message === "string") {
      const diagnosticText = message.slice(0, 20000);
      if (/\bNaN\b/.test(diagnosticText)) diagnosticFlags.push("NON_FINITE_NUMBER");
      if (/Unknown argument/.test(diagnosticText)) diagnosticFlags.push("UNKNOWN_ARGUMENT");
      if (/Argument[^\r\n]*missing/i.test(diagnosticText)) diagnosticFlags.push("MISSING_ARGUMENT");
    }
  }
  return JSON.stringify({
    errorType: typeof name === "string" && allowedNames.includes(name) ? name : "UnknownError",
    ...(typeof code === "string" && /^P\d{4}$/.test(code) ? { prismaCode: code } : {}),
    ...(diagnosticFlags.length ? { diagnosticFlags } : {}),
    detailsPolicy: "原始错误信息、调用参数和堆栈未保存，防止泄露凭证及业务数据",
  });
}
