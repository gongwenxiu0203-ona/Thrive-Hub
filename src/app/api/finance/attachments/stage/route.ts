import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/appError";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "请求格式错误，请重新选择文件" }, { status: 400 }); }

  const scope = String(form.get("scope") || "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择需要上传的文件" }, { status: 400 });
  if (scope !== "PAYMENT" && scope !== "EXPENSE") return NextResponse.json({ error: "附件用途无效" }, { status: 400 });

  try { await requireFeaturePermission(session, scope === "PAYMENT" ? "finance.payment_requests" : "finance.expenses", "EDIT"); }
  catch (error) {
    return errorResponse(error, `finance.attachment.stage.${scope.toLowerCase()}`);
  }
  try { return NextResponse.json(await saveUploadedFile(file)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文件上传失败" }, { status: 400 }); }
}
