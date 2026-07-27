import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";
import { getPlatform } from "@/lib/platformMappings";
import { hasBiPermission } from "@/lib/biAuthorization";

// Download an upload template.
// Query: ?platform=<name>  → platform-specific template with platform's raw headers
//        (no platform)     → universal template with fixed Chinese headers
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await hasBiPermission(session.userId, "bi.import", "READ"))) {
    return NextResponse.json({ error: "无权下载 BI 模板" }, { status: 403 });
  }

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") ?? "";

  if (!platform) {
    // Universal template — fixed headers matching the required fields
    const universalHeaders: Record<string, string> = {
      "联盟平台": "",
      "店铺": "",
      "ASIN": "",
      "品牌": "",
      "平台联盟商名称": "",
      "订单日期": "",
      "销售数量": "",
      "销售金额": "",
      "联盟商佣金": "",
      "联盟商佣金比例": "",
      "地区": "",
    };
    const buffer = buildSheet([universalHeaders], "通用上传模板");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sales-template-universal-${Date.now()}.xlsx"`,
      },
    });
  }

  const p = getPlatform(platform);
  if (!p) {
    return NextResponse.json(
      { error: `未识别的联盟平台「${platform}」` },
      { status: 400 },
    );
  }

  // Platform-specific template: prefer the platform's raw column header;
  // fall back to system field label.
  const { getMappableFields } = await import("@/lib/salesImport");
  const headers: Record<string, string> = {};
  for (const field of getMappableFields()) {
    const alias = p.fields[field.key]?.[0];
    headers[alias ?? field.label] = "";
  }

  const buffer = buildSheet([headers], `${p.name} 上传模板`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sales-template-${encodeURIComponent(
        p.name,
      )}-${Date.now()}.xlsx"`,
    },
  });
}
