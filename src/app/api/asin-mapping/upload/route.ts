import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseSheet, pick } from "@/lib/excel";

// Upload an ASIN mapping table.
// Unique key: brand + store + region + asin → upsert; also back-fills
// matching SalesRecord rows with parentAsin / storeProductLabel.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseSheet(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "无法解析该文件，请确认是有效的 Excel/CSV 文件" },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "文件中没有数据行" }, { status: 400 });
  }

  let upserted = 0;
  let backfilled = 0;
  const skipped: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const brand = pick(row, "品牌", "Brand", "brand");
    const store = pick(row, "店铺", "Store", "store");
    const region = pick(row, "地区", "Region", "region");
    const asin = pick(row, "ASIN", "asin", "子ASIN");
    if (!brand || !store || !region || !asin) {
      skipped.push(i + 2);
      continue;
    }
    const parentAsin =
      pick(row, "父ASIN", "Parent ASIN", "父asin", "parentAsin") || null;
    const storeProductLabel =
      pick(
        row,
        "链接标签名字/项目名称",
        "链接标签",
        "链接标签名字",
        "项目名称",
        "Store-Product Label",
      ) || null;

    await prisma.asinMapping.upsert({
      where: {
        brand_store_region_asin: { brand, store, region, asin },
      },
      create: { brand, store, region, asin, parentAsin, storeProductLabel },
      update: { parentAsin, storeProductLabel },
    });
    upserted++;

    // Back-fill matching SalesRecords (case-insensitive trim).
    const updated = await prisma.salesRecord.updateMany({
      where: { brand, store, region, asin },
      data: { parentAsin, storeProductLabel },
    });
    backfilled += updated.count;
  }

  return NextResponse.json({ upserted, backfilled, skipped });
}
