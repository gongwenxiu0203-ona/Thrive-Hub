import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { convertRow, getMappableFields } from "@/lib/salesImport";
import { getPlatform } from "@/lib/platformMappings";

type Row = Record<string, unknown>;

// Step 2 of the BI import flow.
//
// Body: { rows, mapping, platform, customerId?, fileName? }
// Server matches:
//   - 联盟商类型 / 内部联盟商名称 from 联盟资源库 (by affiliate name)
//   - Parent Asin / 链接标签 from AsinMapping (品牌+店铺+地区+ASIN)
// Brand is system-matched from the selected customer when source has none.
export async function POST(req: Request) {
  try {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: {
    rows?: Row[];
    mapping?: Record<string, string>;
    platform?: string;
    customerId?: string;
    fileName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const rows = body.rows ?? [];
  const mapping = body.mapping ?? {};
  const platform = (body.platform ?? "").trim();
  const customerId = body.customerId || null;

  if (!platform) {
    return NextResponse.json(
      { error: "请先选择联盟平台 (Affiiate Network Platform)" },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "没有可导入的数据行" }, { status: 400 });
  }
  if (!getPlatform(platform)) {
    return NextResponse.json(
      { error: `未识别的联盟平台「${platform}」` },
      { status: 400 },
    );
  }

  // Required user-mapped fields.
  const required = getMappableFields().filter((f) => f.required);
  const missing = required.filter((f) => !mapping[f.key]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `以下必填字段尚未映射：${missing
          .map((f) => `「${f.label}」`)
          .join("、")}`,
      },
      { status: 400 },
    );
  }

  // Load look-up tables once.
  const [customer, affiliates, asinMappings] = await Promise.all([
    customerId
      ? prisma.customer.findUnique({ where: { id: customerId } })
      : Promise.resolve(null),
    prisma.affiliate.findMany({
      select: {
        platformAffiliateName: true,
        internalAffiliateName: true,
        affiliateType: true,
      },
    }),
    prisma.asinMapping.findMany({
      select: {
        brand: true,
        store: true,
        region: true,
        asin: true,
        parentAsin: true,
        storeProductLabel: true,
      },
    }),
  ]);

  const affMap = new Map<string, { type: string; internalName: string | null }>();
  for (const a of affiliates) {
    affMap.set(a.platformAffiliateName.toLowerCase().trim(), {
      type: a.affiliateType ?? "",
      internalName: a.internalAffiliateName,
    });
  }
  const asinMap = new Map<string, { parentAsin: string | null; storeProductLabel: string | null }>();
  for (const m of asinMappings) {
    const key = [m.brand, m.store, m.region, m.asin]
      .map((x) => (x ?? "").toString().trim().toLowerCase())
      .join("||");
    asinMap.set(key, {
      parentAsin: m.parentAsin,
      storeProductLabel: m.storeProductLabel,
    });
  }

  const batch = await prisma.salesBatch.create({
    data: {
      fileName: body.fileName || `${platform}-导入数据.xlsx`,
      affiliatePlatform: platform,
      customerId,
      uploaderId: session.userId,
      recordCount: 0,
    },
  });

  const records = [];
  const skipped: number[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = convertRow(rows[i], mapping, platform, customerId);
    if (!result) {
      skipped.push(i + 2);
      continue;
    }
    const r = result.record;

    // Brand fallback to customer.
    if (!r.brand && customer) r.brand = customer.brandName ?? "";

    // Affiliate type / internal name lookup.
    const key = (r.affiliateName ?? "").toLowerCase().trim();
    if (key) {
      const a = affMap.get(key);
      if (a) {
        r.affiliateType = a.type;
        r.internalAffiliateName = a.internalName;
      }
    }

    // Parent Asin / Store-Product Label lookup.
    const asinKey = [r.brand, r.store, r.region, r.asin]
      .map((x) => (x ?? "").toString().trim().toLowerCase())
      .join("||");
    const am = asinMap.get(asinKey);
    if (am) {
      r.parentAsin = am.parentAsin;
      r.storeProductLabel = am.storeProductLabel;
    }

    records.push({ ...r, batchId: batch.id });
  }

  if (records.length === 0) {
    await prisma.salesBatch.delete({ where: { id: batch.id } });
    return NextResponse.json(
      {
        error:
          "未能识别任何有效数据行。请确认「订单日期 / 联盟商名称 / 销售金额」列已正确映射且数据非空。",
        skipped,
      },
      { status: 400 },
    );
  }

  await prisma.salesRecord.createMany({ data: records });
  await prisma.salesBatch.update({
    where: { id: batch.id },
    data: { recordCount: records.length },
  });

  return NextResponse.json({
    imported: records.length,
    skipped,
    errors,
    batchId: batch.id,
  });
  } catch (err) {
    console.error("[sales/upload] unhandled error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `服务器错误：${msg}` }, { status: 500 });
  }
}
