import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AppError, errorResponse } from "@/lib/appError";
import { prisma } from "@/lib/prisma";
import { adminHasFeature, getSession } from "@/lib/session";
import { SYSTEM_ERROR_CATALOG } from "@/lib/systemErrorCatalog";

const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED"];
async function authorize(required: "READ" | "EDIT") {
  const session = await getSession();
  if (!session) throw new AppError("登录状态已失效，请重新登录", 401, "AUTH_REQUIRED");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, status: true } });
  if (session.role !== "ADMIN" || user?.role !== "ADMIN" || user.status !== "APPROVED"
    || !await adminHasFeature(session, "admin.system_errors", required)) {
    throw new AppError("仅有对应权限的管理员可访问系统错误记录", 403, "PERMISSION_DENIED");
  }
  return session;
}

function respond(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
    return NextResponse.json({ error: "系统错误日志表尚未就绪，请管理员完成数据库迁移后再试", code: "SYSTEM_ERROR_LOG_NOT_READY" }, { status: 503 });
  }
  return errorResponse(error, "admin.system-errors");
}

function dateValue(value: string | null, end: boolean): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError("日期格式应为 YYYY-MM-DD", 400);
  const result = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`);
  if (!Number.isFinite(result.getTime()) || new Date(result.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value) throw new AppError("无效日期", 400);
  return result;
}

export async function GET(request: NextRequest) {
  try {
    await authorize("READ");
    const params = request.nextUrl.searchParams;
    const code = (params.get("code") ?? "").trim().slice(0, 120);
    const moduleName = (params.get("module") ?? "").trim().slice(0, 120);
    const status = params.get("status") ?? "";
    if (status && !statuses.includes(status)) throw new AppError("无效的处理状态", 400);
    const page = Number(params.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new AppError("无效页码", 400);
    const from = dateValue(params.get("from"), false);
    const to = dateValue(params.get("to"), true);
    if (from && to && from > to) throw new AppError("开始日期不能晚于结束日期", 400);
    const where: Prisma.SystemErrorLogWhereInput = {
      ...(code ? { OR: [{ traceCode: { contains: code } }, { category: { contains: code } }] } : {}),
      ...(moduleName ? { module: moduleName } : {}),
      ...(status ? { status } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const pageSize = 20;
    const [items, total, moduleRows] = await Promise.all([
      prisma.systemErrorLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.systemErrorLog.count({ where }),
      prisma.systemErrorLog.findMany({ distinct: ["module"], select: { module: true }, orderBy: { module: "asc" } }),
    ]);
    return NextResponse.json({ items, total, page, pageSize, catalog: SYSTEM_ERROR_CATALOG, modules: moduleRows.map(row => row.module) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respond(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await authorize("EDIT");
    let body: unknown;
    try { body = await request.json(); } catch { throw new AppError("请求内容不是有效 JSON", 400); }
    if (!body || typeof body !== "object") throw new AppError("请求内容无效", 400);
    const { id, status, resolutionNote } = body as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 120 || typeof status !== "string" || !statuses.includes(status)) throw new AppError("记录或处理状态无效", 400);
    if (resolutionNote !== undefined && typeof resolutionNote !== "string") throw new AppError("处理备注必须为文本", 400);
    const note = typeof resolutionNote === "string" ? resolutionNote.trim() : "";
    if (note.length > 2000) throw new AppError("处理备注不能超过2000字", 400);
    if (status === "RESOLVED" && !note) throw new AppError("标记已解决时请填写处理备注", 400);
    const exists = await prisma.systemErrorLog.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new AppError("错误记录不存在", 404);
    const item = await prisma.systemErrorLog.update({ where: { id }, data: {
      status, resolutionNote: note || null,
      resolvedById: status === "RESOLVED" ? session.userId : null,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    } });
    return NextResponse.json({ item });
  } catch (error) { return respond(error); }
}
