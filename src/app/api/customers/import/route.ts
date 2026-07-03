import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  MAIN_SITES,
  PROMO_PLATFORMS,
  PROMOTION_GOALS,
  RATING_LABELS,
} from "@/lib/constants";
import { CUSTOMER_IMPORT_FIELDS } from "@/lib/customerImport";
import { capitalizeBrandName } from "@/lib/customer";

type Row = Record<string, unknown>;

function cell(row: Row, col: string | undefined): string {
  if (!col) return "";
  const v = row[col];
  return v == null ? "" : String(v).trim();
}

function pickMulti(value: string, allowed: string[]): string[] {
  if (!value) return [];
  return allowed.filter((a) => value.includes(a));
}

function reverseRating(value: string): string {
  if (RATING_LABELS[value]) return value;
  const hit = Object.entries(RATING_LABELS).find(([, l]) => l === value);
  if (hit) return hit[0];
  // accept bare "S"/"A"/"B"/"C"
  if (["S", "A", "B", "C"].includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return "PENDING";
}

// Step 2 of the import flow: create customers from confirmed rows + mapping.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { rows?: Row[]; mapping?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const rows = body.rows ?? [];
  const mapping = body.mapping ?? {};
  if (rows.length === 0) {
    return NextResponse.json({ error: "没有可导入的数据行" }, { status: 400 });
  }

  // brandName must be mapped.
  const brandField = CUSTOMER_IMPORT_FIELDS.find((f) => f.key === "brandName")!;
  if (!mapping.brandName) {
    return NextResponse.json(
      { error: `必填字段「${brandField.label}」尚未映射，请在映射步骤中选择对应列` },
      { status: 400 },
    );
  }

  let imported = 0;
  const skipped: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const brandName = capitalizeBrandName(cell(row, mapping.brandName));
    if (!brandName) {
      skipped.push(i + 2); // +2: header row + 1-based
      continue;
    }

    await prisma.customer.create({
      data: {
        brandName,
        category: cell(row, mapping.category) || null,
        mainSites: JSON.stringify(
          pickMulti(cell(row, mapping.mainSites), MAIN_SITES),
        ),
        competitor: cell(row, mapping.competitor) || null,
        targetPlatforms: JSON.stringify(
          pickMulti(cell(row, mapping.targetPlatforms), PROMO_PLATFORMS),
        ),
        platformGmv: (() => {
          // If the value looks like a JSON object/array keep it; otherwise wrap
          // it as { raw: "..." } so the field remains valid JSON.
          const v = cell(row, mapping.platformGmv);
          if (!v) return "{}";
          if (v.startsWith("{") || v.startsWith("[")) return v;
          return JSON.stringify({ raw: v });
        })(),
        amazonAcos: cell(row, mapping.amazonAcos) || null,
        socialMediaInfo: cell(row, mapping.socialMediaInfo) || null,
        affiliateHistory: cell(row, mapping.affiliateHistory) || null,
        affiliatePlatforms: cell(row, mapping.affiliatePlatforms) || null,
        promotionGoals: JSON.stringify(
          pickMulti(cell(row, mapping.promotionGoals), PROMOTION_GOALS),
        ),
        targetGmv: cell(row, mapping.targetGmv) || null,
        channelBudget: cell(row, mapping.channelBudget) || null,
        affiliateTeam: cell(row, mapping.affiliateTeam) || null,
        rating: reverseRating(cell(row, mapping.rating)),
        contactName: cell(row, mapping.contactName) || null,
        contactEmail: cell(row, mapping.contactEmail) || null,
        contactPhone: cell(row, mapping.contactPhone) || null,
        source: "INTERNAL",
      },
    });
    imported++;
  }

  return NextResponse.json({ imported, skipped });
}
