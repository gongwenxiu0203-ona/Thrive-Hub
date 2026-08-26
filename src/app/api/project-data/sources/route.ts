import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { projectDataPrisma as db } from "@/lib/projectDataPrisma";
import { prisma } from "@/lib/prisma";
import { projectScope, type ViewScope } from "@/lib/dataScope";
import { requireProjectDataAccess } from "@/lib/projectDataAccess";
import { requireFeaturePermission, resolveSafeViewScope } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";
import { parseProjectSourceSnapshot, processProjectSourceFile } from "@/lib/projectSourceProcessing";

const EXCHANGE_RATES: Record<string, number> = { GBP_TO_EUR: 1.18, CAD_TO_USD: 0.73 };
const MAX_BYTES = 30 * 1024 * 1024;
const EXTENSIONS = new Set([".csv", ".xlsx", ".xls"]);

function uploadRoot() {
  const configured = process.env.PROJECT_DATA_UPLOAD_DIR;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("生产环境必须配置独立的 PROJECT_DATA_UPLOAD_DIR。");
  if (configured && process.env.NODE_ENV === "production" && !path.isAbsolute(configured)) throw new Error("PROJECT_DATA_UPLOAD_DIR 必须使用绝对路径。");
  const root = path.resolve(configured || path.join(process.cwd(), "project-storage"));
  if (process.env.NODE_ENV === "production") {
    const relative = path.relative(path.resolve(process.cwd()), root);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("PROJECT_DATA_UPLOAD_DIR 必须位于发布目录之外。");
  }
  return root;
}

function storedFilePath(storageKey: string) {
  const root = uploadRoot();
  const target = path.resolve(root, storageKey);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("项目源文件路径无效。");
  return target;
}

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999)) };
}

async function projectCurrency(projectId: string, dataMonth: string) {
  const { start, end } = monthRange(dataMonth);
  const kpi = await db.projectKpi.findFirst({ where: { projectId, metricKey: "MONTHLY_GMV", periodStart: start, periodEnd: end }, orderBy: { updatedAt: "desc" } });
  return kpi?.currency || "USD";
}

async function recalculate(projectId: string, dataMonth: string) {
  const targetCurrency = await projectCurrency(projectId, dataMonth);
  const files = await db.projectSourceFile.findMany({ where: { projectId, dataMonth, status: "COMPLETED" }, orderBy: { uploadedAt: "asc" } });
  const platformBreakdown: Record<string, number> = {};
  const exchangeRates: Record<string, number> = {};
  const sourceRows = new Map<string, { amount: number; currency: string; ids: string[] }>();
  for (const file of files) {
    const snapshot = parseProjectSourceSnapshot(file.importSummary);
    if (!snapshot) continue;
    const currency = file.detectedCurrency || snapshot.currency || targetCurrency;
    const key = `${file.sourceType}:${currency}`;
    const row = sourceRows.get(key) ?? { amount: 0, currency, ids: [] };
    row.amount += file.originalAmount;
    row.ids.push(file.id);
    sourceRows.set(key, row);
  }
  let totalAmount = 0;
  const { start, end } = monthRange(dataMonth);
  await db.$transaction(async (tx) => {
    await tx.projectSalesSummary.deleteMany({ where: { projectId, periodStart: start, periodEnd: end } });
    for (const [key, row] of sourceRows) {
      const platform = key.split(":")[0];
      const rateKey = `${row.currency}_TO_${targetCurrency}`;
      const rate = row.currency === targetCurrency ? 1 : EXCHANGE_RATES[rateKey];
      if (!rate) throw new Error(`缺少 ${row.currency} → ${targetCurrency} 汇率，已停止汇总，请先确认或配置汇率。`);
      const converted = row.amount * rate;
      if (rate && rate !== 1) exchangeRates[rateKey] = rate;
      platformBreakdown[platform] = (platformBreakdown[platform] ?? 0) + converted;
      totalAmount += converted;
      await tx.projectSalesSummary.create({ data: { projectId, sourceFileId: row.ids.at(-1), periodStart: start, periodEnd: end, marketplace: platform, currency: row.currency, grossSales: row.amount, netSales: row.amount, rawSummary: JSON.stringify({ fileIds: row.ids, convertedAmount: converted, targetCurrency }) } });
    }
    if (!files.length) await tx.projectMonthlySalesSummary.deleteMany({ where: { projectId, dataMonth } });
    else await tx.projectMonthlySalesSummary.upsert({ where: { projectId_dataMonth: { projectId, dataMonth } }, update: { currency: targetCurrency, totalAmount, platformBreakdown: JSON.stringify(platformBreakdown), exchangeRates: JSON.stringify(exchangeRates), calculationDate: new Date() }, create: { projectId, dataMonth, currency: targetCurrency, totalAmount, platformBreakdown: JSON.stringify(platformBreakdown), exchangeRates: JSON.stringify(exchangeRates) } });
  });
  return { totalAmount, currency: targetCurrency, platformBreakdown, exchangeRates };
}

async function authorize(projectId: string | null, mode: "READ" | "EDIT") {
  if (projectId) return requireProjectDataAccess(projectId, mode, "projects.source_data");
  const session = await requireSession();
  await requireFeaturePermission(session, "projects.records", mode);
  return { session };
}

async function accessibleProjectIds(mode: "READ" | "EDIT") {
  const session = await requireSession();
  const permission = await requireFeaturePermission(session, "projects.records", mode);
  const view = await resolveSafeViewScope(session, "projects.records", "all", permission) as ViewScope;
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, ...projectScope(session, view) },
    select: { id: true },
  });
  return projects.map((project) => project.id);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = String(url.searchParams.get("projectId") ?? "").trim() || null;
    const month = String(url.searchParams.get("month") ?? "").trim();
    const platform = String(url.searchParams.get("platform") ?? "").trim();
    const view = url.searchParams.get("view") || "raw";
    const visibleProjectIds = projectId
      ? (await authorize(projectId, "READ"), [projectId])
      : await accessibleProjectIds("READ");
    if (view === "processed") {
      const summaries = await db.projectMonthlySalesSummary.findMany({ where: { projectId: { in: visibleProjectIds }, ...(month ? { dataMonth: month } : {}) }, orderBy: [{ dataMonth: "desc" }, { projectId: "asc" }], take: 200 });
      const ids = summaries.map((item) => item.projectId);
      const files = await db.projectSourceFile.findMany({ where: { projectId: { in: ids }, status: "COMPLETED", ...(month ? { dataMonth: month } : {}), ...(platform ? { sourceType: platform } : {}) }, orderBy: { uploadedAt: "asc" } });
      return NextResponse.json({ data: summaries.map((item) => ({ ...item, platformBreakdown: JSON.parse(item.platformBreakdown || "{}"), exchangeRates: JSON.parse(item.exchangeRates || "{}"), files: files.filter((file) => file.projectId === item.projectId && file.dataMonth === item.dataMonth) })) });
    }
    const data = await db.projectSourceFile.findMany({ where: { projectId: { in: visibleProjectIds }, status: { not: "DELETED" }, ...(month ? { dataMonth: month } : {}), ...(platform ? { sourceType: platform } : {}) }, orderBy: { uploadedAt: "desc" }, take: 200 });
    return NextResponse.json({ data, total: data.length });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取源数据失败。" }, { status: 403 }); }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const action = String(body.action || "");
      const projectId = String(body.projectId || "");
      await authorize(projectId, "EDIT");
      if (action === "recalculate") return NextResponse.json({ data: await recalculate(projectId, String(body.dataMonth || "")) });
      const file = await db.projectSourceFile.findFirst({ where: { id: String(body.id || ""), projectId, status: { not: "DELETED" } } });
      if (!file) return NextResponse.json({ error: "源文件不存在。" }, { status: 404 });
      if (action === "process" || action === "confirmCurrency") {
        const target = storedFilePath(file.storageKey);
        const bytes = await fs.readFile(target);
        const forced = action === "confirmCurrency" ? String(body.currency || "") : undefined;
        const snapshot = processProjectSourceFile(bytes, file.sourceType, file.dataMonth, forced);
        const targetCurrency = file.projectCurrency || await projectCurrency(projectId, file.dataMonth);
        const conflict = !forced && snapshot.currency !== targetCurrency;
        const rateKey = `${snapshot.currency}_TO_${targetCurrency}`;
        if (!conflict && snapshot.currency !== targetCurrency && !EXCHANGE_RATES[rateKey]) {
          return NextResponse.json({ error: `缺少 ${snapshot.currency} → ${targetCurrency} 汇率，不能按 1:1 汇总。` }, { status: 422 });
        }
        await db.projectSourceFile.update({ where: { id: file.id }, data: { status: conflict ? "CURRENCY_PENDING" : "COMPLETED", originalAmount: snapshot.amount, detectedCurrency: snapshot.currency, projectCurrency: targetCurrency, importSummary: JSON.stringify(snapshot) } });
        if (!conflict) await recalculate(projectId, file.dataMonth);
        return NextResponse.json({ data: { ...file, status: conflict ? "CURRENCY_PENDING" : "COMPLETED" }, snapshot, currencyConflict: conflict, detectedCurrency: snapshot.currency, projectCurrency: targetCurrency });
      }
      return NextResponse.json({ error: "无效操作。" }, { status: 400 });
    }

    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "").trim();
    const sourceType = String(form.get("sourceType") ?? "").trim();
    const dataMonth = String(form.get("dataMonth") ?? "").trim();
    const file = form.get("file");
    if (!(file instanceof File) || !projectId || !sourceType || !dataMonth) return NextResponse.json({ error: "月份、项目、来源平台和文件必填。" }, { status: 400 });
    const source = await db.projectDataSource.findFirst({ where: { code: sourceType, status: "ACTIVE" } });
    if (!source) return NextResponse.json({ error: "数据来源平台无效。" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "源文件必须小于 30MB。" }, { status: 400 });
    const extension = path.extname(file.name).toLowerCase();
    if (!EXTENSIONS.has(extension)) return NextResponse.json({ error: "仅支持 .xlsx、.xls 和 .csv 文件。" }, { status: 400 });
    const { session } = await requireProjectDataAccess(projectId, "EDIT", "projects.source_data");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const duplicate = await db.projectSourceFile.findFirst({ where: { projectId, sourceType, dataMonth, sha256, status: { not: "DELETED" } } });
    if (duplicate) return NextResponse.json({ data: duplicate, duplicate: true });
    const storageKey = `${projectId}/${randomUUID()}${extension}`;
    const root = uploadRoot(); const target = path.resolve(root, storageKey);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("非法存储路径。");
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes, { flag: "wx" });
    try {
      const targetCurrency = await projectCurrency(projectId, dataMonth);
      let snapshot; let status = "COMPLETED"; let warning: string | undefined;
      try { snapshot = processProjectSourceFile(bytes, sourceType, dataMonth); if (snapshot.currency !== targetCurrency) status = "CURRENCY_PENDING"; }
      catch (error) { status = "FAILED"; warning = error instanceof Error ? error.message : "解析失败"; }
      const data = await db.projectSourceFile.create({ data: { projectId, sourceType, dataMonth, projectCurrency: targetCurrency, originalAmount: snapshot?.amount || 0, detectedCurrency: snapshot?.currency || null, originalName: path.basename(file.name).slice(0, 255), storageKey, mimeType: file.type || null, sizeBytes: file.size, sha256, status, importSummary: JSON.stringify(snapshot || { dataMonth, error: warning }), uploadedById: session.userId } });
      if (status === "COMPLETED") await recalculate(projectId, dataMonth);
      return NextResponse.json({ data, snapshot, warning, currencyConflict: status === "CURRENCY_PENDING", projectCurrency: targetCurrency }, { status: 201 });
    } catch (error) { await fs.unlink(target).catch(() => {}); throw error; }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "处理源文件失败。" }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [String(body.id || "")];
    const files = await db.projectSourceFile.findMany({ where: { id: { in: ids }, status: { not: "DELETED" } } });
    const groups = new Set<string>();
    for (const file of files) { await authorize(file.projectId, "EDIT"); groups.add(`${file.projectId}|${file.dataMonth}`); }
    await db.projectSourceFile.updateMany({ where: { id: { in: files.map((file) => file.id) } }, data: { status: "DELETED" } });
    for (const key of groups) { const [projectId, month] = key.split("|"); await recalculate(projectId, month); }
    for (const file of files) await fs.unlink(storedFilePath(file.storageKey)).catch(() => {});
    return NextResponse.json({ deletedCount: files.length, recalcProjectMonths: [...groups] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "删除源文件失败。" }, { status: 400 }); }
}
