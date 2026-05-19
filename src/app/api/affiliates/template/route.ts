import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { TEMPLATE_AFFILIATE_FIELDS } from "@/lib/affiliateFields";

export async function GET() {
  // Build header row with exact Excel labels
  const headers = TEMPLATE_AFFILIATE_FIELDS.map((f) => f.label);

  // Build a second row with format hints
  const hints = TEMPLATE_AFFILIATE_FIELDS.map((f) => {
    if (f.type === "single_select" && f.options)
      return `单选: ${f.options.join(" | ")}`;
    if (f.type === "multi_select" && f.options)
      return `多选(逗号分隔): ${f.options.join(" | ")}`;
    if (f.type === "number_k") return "数字 (单位K，填写数字即可)";
    if (f.type === "currency") return "金额 ($)";
    if (f.type === "url") return "链接 URL";
    if (f.type === "email") return "邮箱";
    return "文本";
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, hints]);

  // Column widths
  ws["!cols"] = headers.map(() => ({ wch: 28 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "联盟资源库模板");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("联盟资源库导入模板")}.xlsx`,
    },
  });
}
