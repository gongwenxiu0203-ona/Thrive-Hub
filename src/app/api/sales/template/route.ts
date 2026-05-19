import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";
import { getPlatform } from "@/lib/platformMappings";
import { getMappableFields } from "@/lib/salesImport";

// Download an upload template for a specific platform.
// Query: ?platform=<name>
// The template headers are the **platform's raw column headers** (when
// the mapping spreadsheet specifies them) plus an empty cell for fields
// without a known source column.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") ?? "";
  const p = getPlatform(platform);
  if (!p) {
    return NextResponse.json(
      { error: `未识别的联盟平台「${platform}」` },
      { status: 400 },
    );
  }

  // Build the header row: prefer the platform's raw column header; fall
  // back to system field label so users see *which* system field they
  // need to fill.
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
