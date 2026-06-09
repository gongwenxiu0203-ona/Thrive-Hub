import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { requireSession } from "@/lib/session";

const SIG_PATH = path.join(process.cwd(), "public", "signature-party-b.png");

/** 上传乙方签名图片（全局，所有合同通用） */
export async function POST(req: NextRequest) {
  await requireSession();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少图片文件" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "请上传图片文件（PNG/JPG）" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(SIG_PATH, buf);

  return NextResponse.json({ ok: true });
}

/** 查询是否已上传乙方签名 */
export async function GET() {
  await requireSession();
  return NextResponse.json({ exists: existsSync(SIG_PATH) });
}
