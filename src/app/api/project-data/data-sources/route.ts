import { NextResponse } from "next/server";
import { projectDataPrisma as db } from "@/lib/projectDataPrisma";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";
import { PROJECT_SOURCE_PLATFORMS } from "@/lib/projectSourceProcessing";

async function ensureDefaults() {
  await Promise.all(PROJECT_SOURCE_PLATFORMS.map((platform) => db.projectDataSource.upsert({
    where: { code: platform.code }, update: {}, create: { code: platform.code, name: platform.name, description: `金额列：${platform.amountColumns.join(" / ")}` },
  })));
}

export async function GET() {
  try { const session = await requireSession(); await requireFeaturePermission(session, "projects.source_data", "READ"); await ensureDefaults(); return NextResponse.json({ data: await db.projectDataSource.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取数据来源失败。" }, { status: 403 }); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(); await requireFeaturePermission(session, "projects.source_data", "EDIT"); const body = await request.json();
    const name = String(body.name ?? "").trim(); const code = String(body.code ?? "").trim().toLowerCase();
    if (!name || !/^[a-z0-9-]{2,50}$/.test(code)) throw new Error("平台名称必填，平台代码只能使用小写字母、数字和连字符。");
    const data = await db.projectDataSource.create({ data: { name, code, description: String(body.description ?? "").trim() || null, sourceUrl: String(body.sourceUrl ?? "").trim() || null } });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "新增数据来源失败。" }, { status: 400 }); }
}
