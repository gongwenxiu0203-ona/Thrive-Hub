import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const saved = await saveUploadedFile(file);

  await prisma.affiliateReconciliation.update({
    where: { id },
    data: { proofUrl: saved.fileUrl },
  });

  return NextResponse.json({ proofUrl: saved.fileUrl });
}
