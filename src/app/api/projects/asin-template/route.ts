import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/** 下载 ASIN 库存提交模板（CSV）*/
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const bom = "﻿";
  const header = "父ASIN,可售子ASIN,颜色,尺码,库存数量\n";
  const sample = ",,,,\n,,,,\n,,,,\n";
  const csv = bom + header + sample;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="asin-inventory-template.csv"',
    },
  });
}
