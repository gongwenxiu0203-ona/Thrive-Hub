import { NextResponse } from "next/server";
import { uploadExistingContract } from "@/actions/contractUpload";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "登录状态已失效，请重新登录后再试" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const formData = await request.formData();
    const result = await uploadExistingContract(formData);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[contract-upload-api] unhandled error", { requestId, error });
    return NextResponse.json(
      {
        ok: false,
        error: `上传识别失败，请稍后重试（错误编号：${requestId.slice(0, 8)}）`,
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
