import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/** 下载推广商品清单表头模板（CSV） */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // BOM + CSV header so Excel opens correctly with UTF-8
  const bom = "﻿";
  const header = "商品名称,ASIN,零售价（参考）,专属优惠码/追踪链接\n";
  // 提供两行空行示例
  const rows = ",,, \n,,, \n";
  const csv = bom + header + rows;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product-list-template.csv"',
    },
  });
}
