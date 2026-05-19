import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";
import {
  CUSTOMER_STATUS_LABELS,
  RATING_LABELS,
  labelOf,
} from "@/lib/constants";
import { parseStringArray } from "@/lib/customer";

// GET /api/customers/export          → export all customers
// GET /api/customers/export?template=1 → empty file usable as an import template
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isTemplate = new URL(req.url).searchParams.get("template") === "1";

  const toRow = (c: {
    brandName: string;
    category: string | null;
    mainSites: string;
    competitor: string | null;
    targetPlatforms: string;
    amazonAcos: string | null;
    socialMediaInfo: string | null;
    affiliateHistory: string | null;
    affiliatePlatforms: string | null;
    promotionGoals: string;
    targetGmv: string | null;
    channelBudget: string | null;
    affiliateTeam: string | null;
    rating: string;
    status?: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  }) => ({
    "品牌/店铺名称": c.brandName,
    品类: c.category ?? "",
    主营站点: parseStringArray(c.mainSites).join("、"),
    品牌竞品: c.competitor ?? "",
    目标推广平台: parseStringArray(c.targetPlatforms).join("、"),
    亚马逊站内广告ACOS: c.amazonAcos ?? "",
    社媒推广情况: c.socialMediaInfo ?? "",
    是否做过联盟营销及相关情况: c.affiliateHistory ?? "",
    具体用的联盟平台: c.affiliatePlatforms ?? "",
    推广目标: parseStringArray(c.promotionGoals).join("、"),
    目标GMV或单量: c.targetGmv ?? "",
    优质渠道固定费用预算: c.channelBudget ?? "",
    是否有联盟团队: c.affiliateTeam ?? "",
    客户评估定级: labelOf(RATING_LABELS, c.rating),
    当前进度: c.status ? labelOf(CUSTOMER_STATUS_LABELS, c.status) : "",
    联系人姓名: c.contactName ?? "",
    联系邮箱: c.contactEmail ?? "",
    联系电话: c.contactPhone ?? "",
  });

  let rows;
  if (isTemplate) {
    rows = [
      toRow({
        brandName: "示例品牌（可删除此行）",
        category: "消费电子",
        mainSites: JSON.stringify(["US", "UK"]),
        competitor: "竞品A / 竞品B",
        targetPlatforms: JSON.stringify(["Amazon", "独立站"]),
        amazonAcos: "25%",
        socialMediaInfo: "IG 1 万粉丝",
        affiliateHistory: "做过，月度联盟 GMV $30k",
        affiliatePlatforms: "Levanta、ACC",
        promotionGoals: JSON.stringify(["新品推广"]),
        targetGmv: "月 GMV $100k",
        channelBudget: "单渠道 $1000-$3000",
        affiliateTeam: "有 1 人兼职",
        rating: "A",
        contactName: "张三",
        contactEmail: "zhangsan@example.com",
        contactPhone: "13800000000",
      }),
    ];
  } else {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
    });
    rows = customers.map(toRow);
  }

  const buffer = buildSheet(rows, isTemplate ? "客户导入模板" : "客户列表");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${
        isTemplate ? "customer-import-template" : "customers"
      }-${Date.now()}.xlsx"`,
    },
  });
}
