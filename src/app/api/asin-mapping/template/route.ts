import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";

// Download an empty ASIN mapping template.
// Headers: 品牌 / 店铺 / 地区 / 链接标签名字 / 父ASIN / ASIN
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const rows = [
    {
      品牌: "示例品牌",
      店铺: "旗舰店-US",
      地区: "US",
      "链接标签名字/项目名称": "新品-US-主推",
      父ASIN: "B0PARENT001",
      ASIN: "B0CHILD001",
    },
  ];

  const buffer = buildSheet(rows, "ASIN 映射模板");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="asin-mapping-template-${Date.now()}.xlsx"`,
    },
  });
}
