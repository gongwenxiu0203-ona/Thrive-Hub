import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { extractFileText } from "@/lib/contractFile";
import { extractContract } from "@/lib/contractExtract";

// Extracts contract review fields. Accepts either:
//  - multipart form-data with `file`  → extract text from file, then fields
//  - JSON { text }                    → extract fields from provided text
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let text = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "缺少文件" }, { status: 400 });
      }
      text = await extractFileText(file);
      if (!text.trim()) {
        return NextResponse.json(
          {
            error:
              "未能从该文件中读取到文本（可能是扫描件或加密 PDF）。请将合同正文粘贴到下方文本框后点击「智能提取」。",
            text: "",
          },
          { status: 422 },
        );
      }
    } else {
      const body = await req.json();
      text = String(body.text ?? "");
      if (!text.trim()) {
        return NextResponse.json(
          { error: "请粘贴合同正文后再提取" },
          { status: 400 },
        );
      }
    }
  } catch {
    return NextResponse.json({ error: "文件解析失败" }, { status: 400 });
  }

  const { data, method } = await extractContract(text);
  return NextResponse.json({ text, data, method });
}
