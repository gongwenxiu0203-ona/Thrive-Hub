import { after } from "next/server";
import { classifySystemError, sanitizeTechnicalDetails, SYSTEM_ERROR_CATALOG } from "./systemErrorCatalog";

export { classifySystemError, sanitizeTechnicalDetails } from "./systemErrorCatalog";

export function recordSystemError(error: unknown, context: string, traceCode: string, statusCode: number): void {
  if (context.startsWith("admin.system-errors")) return;
  try {
    if (!/^ERR-[A-Z0-9]{1,16}-[A-F0-9]{6}$/.test(traceCode)) return;
    // Contexts are code-defined labels, not URLs or request content.
    const safeContext = /^[a-zA-Z][a-zA-Z0-9._-]{0,119}$/.test(context) ? context : "unknown";
    const category = classifySystemError(error);
    const data = {
      traceCode, category, context: safeContext, module: safeContext.split(/[._-]/)[0], statusCode,
      message: SYSTEM_ERROR_CATALOG.find(item => item.code === category)!.description,
      technicalDetails: sanitizeTechnicalDetails(error),
    };
    const write = async () => {
      try {
        const { prisma } = await import("./prisma");
        await prisma.systemErrorLog.create({ data });
      } catch {
        // Do not recurse via errorResponse or emit raw Prisma errors containing arguments.
        console.warn(`[system-error-log] ${traceCode} diagnostic persistence unavailable`);
      }
    };
    try { after(write); }
    catch { void write(); } // CLI/background jobs have no Next request lifecycle.
  } catch {
    // Diagnostics must never replace or interrupt the original business response.
  }
}
