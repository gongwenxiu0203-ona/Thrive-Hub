import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import {
  resolveCompanySealPath,
  resolveSealCompany,
} from "@/lib/contractSeal";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ company: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isStaff(session.role)) {
    return NextResponse.json({ error: "无权查看公章" }, { status: 403 });
  }
  try {
    await requireFeaturePermission(session, "contracts.signing", "MANAGE");
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权查看公章" }, { status: 403 });
    }
    throw error;
  }

  const company = resolveSealCompany((await params).company);
  if (!company) return NextResponse.json({ error: "公章不存在" }, { status: 404 });
  const filePath = await resolveCompanySealPath(company);
  if (!filePath) return NextResponse.json({ error: "公章不存在" }, { status: 404 });

  const bytes = await readFile(filePath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
