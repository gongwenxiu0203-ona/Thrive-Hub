import { NextResponse } from "next/server";
import { projectDataPrisma as db } from "@/lib/projectDataPrisma";
import { prisma } from "@/lib/prisma";
import { requireProjectDataAccess, safeJson } from "@/lib/projectDataAccess";
import {
  inspectFeishuDiscountSource,
  syncFeishuDiscountSource,
} from "@/lib/feishuDiscountSync";

const TARGET_FIELDS = [
  "brand",
  "platform",
  "store",
  "dealType",
  "productCategory",
  "asin",
  "productLink",
  "originalPrice",
  "discountPrice",
  "discountRate",
  "startDate",
  "endDate",
  "promoCode",
  "accCampaignId",
  "accGoldRatio",
  "lastUpdated",
];
const ids = (value: unknown) =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const json = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return JSON.parse(value || "") as T;
  } catch {
    return fallback;
  }
};
const text = (value: unknown, label: string, max = 300) => {
  const result = String(value ?? "").trim();
  if (!result || result.length > max)
    throw new Error(`${label}不能为空或过长。`);
  return result;
};
function parseSourceUrl(raw: unknown) {
  const sourceUrl = text(raw, "飞书数据源链接", 2000);
  const url = new URL(sourceUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.includes("share"))
    throw new Error(
      "不支持飞书分享链接，请使用原始多维表格、飞书表格或 Wiki 链接。",
    );
  const base = parts.indexOf("base"),
    sheets = parts.indexOf("sheets"),
    wiki = parts.indexOf("wiki");
  const table = url.searchParams.get("table") || "",
    sheet = url.searchParams.get("sheet") || "";
  const tokenIndex = base >= 0 ? base : sheets >= 0 ? sheets : wiki;
  const appToken = tokenIndex >= 0 ? String(parts[tokenIndex + 1] || "") : "";
  if (!appToken || appToken === "view")
    throw new Error("无法识别飞书 App Token，请检查链接格式。");
  const sourceType =
    base >= 0 || !!table
      ? "feishu_bitable"
      : sheets >= 0 || !!sheet
        ? "feishu_sheets"
        : "other";
  const tableId = table || sheet;
  if (!tableId) throw new Error("链接中缺少 table 或 sheet 参数。");
  return {
    sourceUrl,
    sourceType,
    appToken,
    tableId,
    viewId: url.searchParams.get("view") || null,
  };
}
async function assertProjects(
  projectIds: string[],
  level: "READ" | "EDIT" | "MANAGE" = "READ",
) {
  if (!projectIds.length) throw new Error("请选择项目。");
  for (const id of projectIds) await requireProjectDataAccess(id, level);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "records";
    const projectIds = ids(
      url.searchParams.get("projectIds") || url.searchParams.get("projectId"),
    );
    await assertProjects(projectIds);
    if (action === "records" || action === "summary") {
      const rows = await db.projectDiscountRecord.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 5000,
      });
      const asins = [
        ...new Set(rows.map((r) => r.asin).filter((v): v is string => !!v)),
      ];
      const products = asins.length
        ? await db.projectProduct.findMany({
            where: {
              projectId: { in: projectIds },
              asin: { in: asins },
              status: "ACTIVE",
            },
            orderBy: { rating: "desc" },
          })
        : [];
      const now = new Date();
      const mapped = rows.map((row) => {
        const product =
          products.find(
            (p) => p.projectId === row.projectId && p.asin === row.asin,
          ) ?? products.find((p) => p.asin === row.asin);
        return {
          ...row,
          productLink: row.productLink || product?.productLink || null,
          store: row.store || product?.store || null,
          rating: product?.rating ?? null,
          reviewCount: product?.reviewCount ?? null,
          bsrRank: product?.bsrRank ?? null,
          linkPosition: product?.linkPosition ?? null,
          validityStatus: row.endDate
            ? row.endDate < now
              ? "expired"
              : "valid"
            : row.startDate
              ? "longTerm"
              : "unknown",
        };
      });
      if (action === "summary")
        return NextResponse.json({
          data: {
            projectCount: new Set(rows.map((r) => r.projectId)).size,
            recordCount: rows.length,
            ongoingCount: mapped.filter(
              (r) =>
                r.validityStatus === "valid" || r.validityStatus === "longTerm",
            ).length,
          },
        });
      return NextResponse.json({ data: mapped });
    }
    if (action === "products" || action === "product-summary") {
      const rows = await db.projectProduct.findMany({
        where: { projectId: { in: projectIds }, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      });
      if (action === "products") return NextResponse.json({ data: rows });
      const data = projectIds.map((projectId) => {
        const list = rows.filter((r) => r.projectId === projectId);
        return {
          projectId,
          productCount: list.length,
          storeCount: new Set(list.map((r) => r.store).filter(Boolean)).size,
          asinCount: new Set(list.map((r) => r.asin).filter(Boolean)).size,
          lastUploadedAt: list[0]?.updatedAt ?? null,
        };
      });
      return NextResponse.json({ data });
    }
    if (action === "sources") {
      const rows = await db.projectDiscountSource.findMany({
        where: { projectId: { in: projectIds }, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const sourceIds = rows.map((r) => r.id);
      const [counts, mappings] = await Promise.all([
        db.projectDiscountRecord.groupBy({
          by: ["sourceId"],
          where: { sourceId: { in: sourceIds } },
          _count: true,
        }),
        db.projectDiscountFieldMapping.groupBy({
          by: ["sourceId"],
          where: { sourceId: { in: sourceIds } },
          _count: true,
        }),
      ]);
      return NextResponse.json({
        data: rows.map((r) => ({
          ...r,
          recordCount: counts.find((c) => c.sourceId === r.id)?._count ?? 0,
          mappingCount: mappings.find((m) => m.sourceId === r.id)?._count ?? 0,
        })),
      });
    }
    if (action === "reminder-users") {
      const data = await prisma.user.findMany({
        where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ data });
    }
    if (action === "reminder-setting") {
      const sourceId = text(url.searchParams.get("sourceId"), "数据源");
      const source = await db.projectDiscountSource.findFirst({
        where: { id: sourceId, projectId: { in: projectIds } },
      });
      if (!source) throw new Error("数据源不存在。");
      const data = await db.projectDiscountReminderSetting.findUnique({
        where: {
          projectId_sourceId: { projectId: source.projectId, sourceId },
        },
      });
      return NextResponse.json({ data });
    }
    if (action === "reminder-runs") {
      const sourceId = text(url.searchParams.get("sourceId"), "数据源");
      const source = await db.projectDiscountSource.findFirst({
        where: { id: sourceId, projectId: { in: projectIds } },
      });
      if (!source) throw new Error("数据源不存在。");
      const data = await db.projectDiscountReminderRun.findMany({
        where: { sourceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ data });
    }
    if (action === "mappings") {
      const sourceId = text(url.searchParams.get("sourceId"), "数据源");
      const source = await db.projectDiscountSource.findFirst({
        where: { id: sourceId, projectId: { in: projectIds } },
      });
      if (!source) throw new Error("数据源不存在。");
      const data = await db.projectDiscountFieldMapping.findMany({
        where: { sourceId },
        orderBy: { targetField: "asc" },
      });
      return NextResponse.json({ data });
    }
    if (action === "source-fields") {
      const sourceId = text(url.searchParams.get("sourceId"), "数据源");
      const source = await db.projectDiscountSource.findFirst({
        where: { id: sourceId, projectId: { in: projectIds } },
      });
      if (!source) throw new Error("数据源不存在。");
      const inspected = await inspectFeishuDiscountSource(source);
      const headers = inspected.headers;
      const sample = inspected.sample;
      return NextResponse.json({
        data: headers.map((name) => ({
          name,
          type: "text",
          sample: String(sample[name] ?? ""),
        })),
        sample,
      });
    }
    throw new Error("未知操作。");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取失败。" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const projectId = text(body.projectId, "项目", 80);
    const { session } = await requireProjectDataAccess(projectId, "EDIT");
    if (action === "save-source") {
      const parsed = parseSourceUrl(body.sourceUrl);
      const id = body.id ? String(body.id) : null;
      if (id) {
        const owned = await db.projectDiscountSource.findFirst({
          where: { id, projectId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!owned) throw new Error("数据源不存在或无权修改。");
      }
      const duplicate = await db.projectDiscountSource.findFirst({
        where: {
          projectId,
          status: "ACTIVE",
          sourceType: parsed.sourceType,
          appToken: parsed.appToken,
          tableId: parsed.tableId,
          viewId: parsed.viewId,
          ...(id ? { id: { not: id } } : {}),
        },
        select: { id: true, name: true },
      });
      if (duplicate)
        throw new Error(
          `同一项目已存在相同数据源「${duplicate.name}」，请勿重复创建。`,
        );
      const data = {
        projectId,
        name: text(body.name, "数据源名称"),
        ...parsed,
        headerRowIndex: Math.max(
          1,
          Math.min(5, Number(body.headerRowIndex) || 1),
        ),
        platform: String(body.platform || "") || null,
        configuration: safeJson(body.configuration || {}),
        lastOperatedById: session.userId,
        lastOperatedAt: new Date(),
        createdById: session.userId,
      };
      const result = body.id
        ? await db.projectDiscountSource.update({
            where: { id: String(body.id) },
            data,
          })
        : await db.projectDiscountSource.create({ data });
      return NextResponse.json({ data: result });
    }
    if (action === "save-reminder-setting") {
      const sourceId = text(body.sourceId, "数据源");
      const source = await db.projectDiscountSource.findFirst({
        where: { id: sourceId, projectId, status: "ACTIVE" },
      });
      if (!source) throw new Error("数据源不存在。");
      const targetUserIds: string[] = [
        ...new Set<string>(
          (Array.isArray(body.targetUserIds) ? body.targetUserIds : [])
            .map((value: unknown) => String(value))
            .filter((value: string) => Boolean(value)),
        ),
      ];
      const validUsers = targetUserIds.length
        ? await prisma.user.findMany({
            where: {
              id: { in: targetUserIds },
              status: "APPROVED",
              role: { in: ["ADMIN", "USER"] },
            },
            select: { id: true },
          })
        : [];
      if (
        body.enabled !== false &&
        (!targetUserIds.length || validUsers.length !== targetUserIds.length)
      )
        throw new Error("请选择至少一位有效的系统站内信接收人。");
      const remindBeforeEndDays = Math.max(
        0,
        Math.min(90, Number(body.remindBeforeEndDays) || 0),
      );
      const scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(
        String(body.scheduleTime || ""),
      )
        ? String(body.scheduleTime)
        : "09:00";
      const existing = await db.projectDiscountReminderSetting.findUnique({
        where: { projectId_sourceId: { projectId, sourceId } },
      });
      const data = {
        enabled: body.enabled !== false,
        targetUserIds: JSON.stringify(targetUserIds),
        remindBeforeEndDays,
        notifySyncFailure: body.notifySyncFailure !== false,
        scheduleTime,
        timezone: "Asia/Shanghai",
        updatedById: session.userId,
        planVersion: (existing?.planVersion ?? 0) + 1,
      };
      const result = existing
        ? await db.projectDiscountReminderSetting.update({
            where: { id: existing.id },
            data,
          })
        : await db.projectDiscountReminderSetting.create({
            data: { ...data, projectId, sourceId, createdById: session.userId },
          });
      return NextResponse.json({ data: result });
    }
    if (action === "delete-source") {
      const source = await db.projectDiscountSource.findFirst({
        where: { id: String(body.id), projectId },
      });
      if (!source) throw new Error("数据源不存在。");
      await db.$transaction([
        db.projectDiscountRecord.deleteMany({ where: { sourceId: source.id } }),
        db.projectDiscountFieldMapping.deleteMany({
          where: { sourceId: source.id },
        }),
        db.projectDiscountSource.update({
          where: { id: source.id },
          data: {
            status: "DELETED",
            lastOperatedById: session.userId,
            lastOperatedAt: new Date(),
          },
        }),
      ]);
      return NextResponse.json({ data: true });
    }
    if (action === "sync-source") {
      const source = await db.projectDiscountSource.findFirst({
        where: { id: String(body.id), projectId },
      });
      if (!source) throw new Error("数据源不存在。");
      await db.projectDiscountSource.update({
        where: { id: source.id },
        data: {
          syncStatus: "SYNCING",
          syncError: null,
          lastOperatedById: session.userId,
          lastOperatedAt: new Date(),
        },
      });
      try {
        const result = await syncFeishuDiscountSource(source, session.userId);
        return NextResponse.json({ data: result });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "飞书数据同步失败。";
        await db.projectDiscountSource.update({
          where: { id: source.id },
          data: {
            syncStatus: "FAILED",
            syncError: message,
            lastSyncAt: new Date(),
            lastOperatedById: session.userId,
            lastOperatedAt: new Date(),
          },
        });
        throw error;
      }
    }
    if (action === "save-mappings") {
      const sourceId = text(body.sourceId, "数据源");
      const source = await db.projectDiscountSource.findFirst({
        where: { id: sourceId, projectId },
      });
      if (!source) throw new Error("数据源不存在。");
      const mappings: Array<{ targetField: string; sourceField: string }> = (
        Array.isArray(body.mappings) ? body.mappings : []
      )
        .filter(
          (m: { targetField?: unknown; sourceField?: unknown }) =>
            TARGET_FIELDS.includes(String(m.targetField)) &&
            String(m.sourceField || "").trim(),
        )
        .map((m: { targetField: unknown; sourceField: unknown }) => ({
          targetField: String(m.targetField),
          sourceField: String(m.sourceField).trim(),
        }));
      await db.$transaction([
        db.projectDiscountFieldMapping.deleteMany({ where: { sourceId } }),
        ...mappings.map((m) =>
          db.projectDiscountFieldMapping.create({
            data: {
              sourceId,
              targetField: m.targetField,
              sourceField: m.sourceField,
            },
          }),
        ),
      ]);
      return NextResponse.json({ data: mappings.length });
    }
    if (action === "import-products") {
      const items = Array.isArray(body.items) ? body.items : [];
      let count = 0;
      for (const item of items) {
        const asin = String(item.asin || "").trim();
        if (!asin) continue;
        await db.projectProduct.upsert({
          where: {
            projectId_sku_marketplace: {
              projectId,
              sku: String(item.sku || asin),
              marketplace: String(item.platform || ""),
            },
          },
          update: {
            asin,
            name: String(item.category || asin),
            brand: String(item.brand || "") || null,
            sequence: String(item.sequence || "") || null,
            store: String(item.store || "") || null,
            category: String(item.category || "") || null,
            platform: String(item.platform || "") || null,
            bsrRank: String(item.bsrRank || "") || null,
            rating: item.rating == null ? null : Number(item.rating),
            linkPosition: String(item.linkPosition || "") || null,
            productLink: String(item.productLink || "") || null,
            reviewCount:
              item.reviewCount == null ? null : Number(item.reviewCount),
            status: "ACTIVE",
            attributes: safeJson(item),
          },
          create: {
            projectId,
            sku: String(item.sku || asin),
            marketplace: String(item.platform || ""),
            asin,
            name: String(item.category || asin),
            brand: String(item.brand || "") || null,
            sequence: String(item.sequence || "") || null,
            store: String(item.store || "") || null,
            category: String(item.category || "") || null,
            platform: String(item.platform || "") || null,
            bsrRank: String(item.bsrRank || "") || null,
            rating: item.rating == null ? null : Number(item.rating),
            linkPosition: String(item.linkPosition || "") || null,
            productLink: String(item.productLink || "") || null,
            reviewCount:
              item.reviewCount == null ? null : Number(item.reviewCount),
            attributes: safeJson(item),
          },
        });
        count++;
      }
      return NextResponse.json({ data: { upsertedCount: count } });
    }
    if (action === "delete-product") {
      await db.projectProduct.updateMany({
        where: { id: String(body.id), projectId },
        data: { status: "DELETED" },
      });
      return NextResponse.json({ data: true });
    }
    if (action === "clear-products") {
      const result = await db.projectProduct.updateMany({
        where: { projectId },
        data: { status: "DELETED" },
      });
      return NextResponse.json({ data: result.count });
    }
    throw new Error("未知操作。");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败。" },
      { status: 400 },
    );
  }
}
