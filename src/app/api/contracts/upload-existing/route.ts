import { NextResponse } from "next/server";
import { uploadExistingContract } from "@/actions/contractUpload";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/appError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    return errorResponse(error, "contracts.upload-existing");
  }
}
