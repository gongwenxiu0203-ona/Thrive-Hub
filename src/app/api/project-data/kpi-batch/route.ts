import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectDataPrisma as projectDb } from "@/lib/projectDataPrisma";
import { projectScope } from "@/lib/dataScope";
import { requireFeaturePermission, resolveSafeViewScope } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const currencies = new Set(["USD", "GBP", "EUR", "RMB", "CNY"]);
const monthRange = (month: string) => { const [year, value] = month.split("-").map(Number); return { start: new Date(Date.UTC(year, value - 1, 1)), end: new Date(Date.UTC(year, value, 0, 23, 59, 59, 999)) }; };
const ownerFromTarget = (item: { amOwnerId: string | null; source: string }) => item.amOwnerId || (item.source.startsWith("MANUAL:") ? item.source.slice(7) : "");

async function access(level: "READ" | "EDIT", requested = "all") {
  const session = await requireSession();
  const permission = await requireFeaturePermission(session, "projects.records", level);
  const view = await resolveSafeViewScope(session, "projects.records", requested, permission);
  return { session, scope: projectScope(session, view) };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!monthPattern.test(month)) return NextResponse.json({ error: "月份格式无效" }, { status: 400 });
    const { scope } = await access("READ", url.searchParams.get("scope") || "all"); const range = monthRange(month);
    const visible = await prisma.project.findMany({ where: { deletedAt: null, ...scope }, select: { id: true, name: true } });
    const ids = visible.map((item) => item.id); const names = new Map(visible.map((item) => [item.id, item.name]));
    const targets = await projectDb.projectKpi.findMany({ where: { projectId: { in: ids }, metricKey: "MONTHLY_GMV", periodStart: range.start, periodEnd: range.end }, orderBy: { projectId: "asc" } });
    const ownerIds = [...new Set(targets.map(ownerFromTarget).filter(Boolean))];
    const owners = await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }); const ownerMap = new Map(owners.map((item) => [item.id, item]));
    return NextResponse.json({ data: targets.map((item) => ({ id: item.id, projectId: item.projectId, month, monthlyTarget: item.targetValue || 0, currency: item.currency || "USD", project: { id: item.projectId, name: names.get(item.projectId) || "未知项目" }, amOwner: ownerMap.get(ownerFromTarget(item)) || null })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 403 }); }
}

export async function POST(request: Request) {
  const createdProjectIds: string[] = [];
  let actorId = "";
  try {
    const { session, scope } = await access("EDIT"); actorId = session.userId; const body = await request.json(); const month = String(body.month || ""); const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!monthPattern.test(month) || !rows.length || rows.length > 100) throw new Error("请提供有效月份及 1-100 条记录");
    const range = monthRange(month); const normalized = [];
    for (const raw of rows) {
      let projectId = String(raw.projectId || "").trim(); const ownerId = String(raw.ownerId || "").trim(); const currency = String(raw.currency || "USD").toUpperCase(); const monthlyTarget = Number(raw.monthlyTarget);
      if (!ownerId || !currencies.has(currency) || !Number.isFinite(monthlyTarget) || monthlyTarget < 0) throw new Error("负责人、币种或目标金额无效");
      const owner = await prisma.user.findFirst({ where: { id: ownerId, status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } }); if (!owner) throw new Error("负责人无效");
      if (!projectId) {
        const name = String(raw.newProjectName || "").trim().slice(0, 120); if (!name) throw new Error("手动新增项目必须填写项目名");
        const created = await prisma.$transaction(async (tx) => { const project = await tx.project.create({ data: { name, type: "INTEGRATED", ownerId, createdById: session.userId } }); await tx.projectEntry.create({ data: { projectId: project.id, kind: "NODE", content: `KPI配置中创建整合项目；负责人：${ownerId}`, authorId: session.userId } }); return project; });
        projectId = created.id; createdProjectIds.push(projectId);
      } else { const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null, ...scope }, select: { id: true } }); if (!project) throw new Error("项目不存在或无权操作"); }
      normalized.push({ projectId, ownerId, currency: currency === "CNY" ? "RMB" : currency, monthlyTarget });
    }
    const saved = await projectDb.$transaction(normalized.map((row) => projectDb.projectKpi.upsert({ where: { projectId_metricKey_periodStart_periodEnd: { projectId: row.projectId, metricKey: "MONTHLY_GMV", periodStart: range.start, periodEnd: range.end } }, update: { metricName: "月度 GMV 目标", targetValue: row.monthlyTarget, currency: row.currency, unit: "GMV", source: "MANUAL", amOwnerId: row.ownerId || null }, create: { projectId: row.projectId, metricKey: "MONTHLY_GMV", metricName: "月度 GMV 目标", periodStart: range.start, periodEnd: range.end, targetValue: row.monthlyTarget, currency: row.currency, unit: "GMV", source: "MANUAL", amOwnerId: row.ownerId || null, createdById: session.userId } })));
    return NextResponse.json({ data: saved }, { status: 201 });
  } catch (error) {
    if (createdProjectIds.length) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "未知异常";
      await prisma.$transaction(async (tx) => { for (const id of createdProjectIds) { await tx.projectEntry.create({ data: { projectId: id, kind: "NODE", content: `独立项目库 KPI 写入失败，已补偿取消项目：${message}`, authorId: actorId || null } }); await tx.project.update({ where: { id }, data: { deletedAt: new Date(), status: "CANCELLED" } }); } }).catch(() => undefined);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { scope } = await access("EDIT"); const id = String((await request.json()).id || ""); const target = await projectDb.projectKpi.findUnique({ where: { id } }); if (!target || target.metricKey !== "MONTHLY_GMV") return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    const project = await prisma.project.findFirst({ where: { id: target.projectId, deletedAt: null, ...scope }, select: { id: true } }); if (!project) return NextResponse.json({ error: "无权删除" }, { status: 403 });
    await projectDb.projectKpi.delete({ where: { id } }); return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 403 }); }
}
