import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import {
  resolvePartyBSignaturePath,
  writePartyBSignature,
} from "@/lib/contractSeal";

async function authorize() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isStaff(session.role)) {
    return NextResponse.json({ error: "无权管理乙方签名" }, { status: 403 });
  }
  try {
    await requireFeaturePermission(session, "contracts", "MANAGE");
    return null;
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权管理乙方签名" }, { status: 403 });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少图片文件" }, { status: 400 });
  }
  if (file.type !== "image/png") {
    return NextResponse.json({ error: "请上传 PNG 图片" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 400 });
  }

  await writePartyBSignature(Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;

  const filePath = await resolvePartyBSignaturePath();
  if (req.nextUrl.searchParams.get("preview") !== "1") {
    return NextResponse.json({ exists: Boolean(filePath) });
  }
  if (!filePath) return NextResponse.json({ error: "乙方签名不存在" }, { status: 404 });

  const bytes = await readFile(filePath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
