import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSheet } from "@/lib/excel";
import { suggestMapping } from "@/lib/salesImport";

// Step 1 of the BI import flow:
//   form fields: file, platform (联盟平台名)
// Returns: columns + rows + auto-suggested mapping for the selected platform.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const platform = String(form.get("platform") ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "请选择要上传的销售数据文件" },
      { status: 400 },
    );
  }
  let rows;
  try {
    rows = parseSheet(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      {
        error:
          "无法解析该文件，请确认是有效的 Excel(.xlsx/.xls) 或 CSV 文件",
      },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "文件中没有数据行，首行应为列名" },
      { status: 400 },
    );
  }
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) {
    return NextResponse.json(
      { error: "未能识别表头列，请确认首行为列名" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    fileName: file.name,
    columns,
    rows,
    rowCount: rows.length,
    suggestedMapping: suggestMapping(platform, columns),
  });
}
