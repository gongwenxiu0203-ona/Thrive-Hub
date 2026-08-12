import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createContractFillToken } from "@/lib/contractFillToken";
import { contractScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try { await requireFeaturePermission(session, "contracts.create_upload", "EDIT"); }
  catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权生成填写链接" }, { status: 403 });
    return errorResponse(error, "contracts.fill-token.authorization");
  }
  const body = await req.json().catch(() => null) as { contractId?: string } | null;
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  const { contractId } = body;
  if (!contractId) return NextResponse.json({ error: "缺少合同ID" }, { status: 400 });

  let contract;
  try {
    contract = await prisma.contract.findFirst({
      where: { id: contractId, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"), deletedAt: null },
      select: { id: true, customerId: true, status: true },
    });
  } catch (error) {
    return errorResponse(error, "contracts.fill-token.lookup");
  }
  if (!contract) return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  if (!contract.customerId) return NextResponse.json({ error: "合同未关联客户，无法生成外部填写链接" }, { status: 409 });
  if (!['DRAFT', 'IN_PROGRESS'].includes(contract.status)) {
    return NextResponse.json({ error: "合同已进入审核或签署流程，不能生成填写链接" }, { status: 409 });
  }

  try {
    const result = await createContractFillToken({
      contractId: contract.id,
      customerId: contract.customerId,
    });
    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        externalFillToken: result.token,
        externalFillExpiry: result.expiresAt,
        fillMethod: "EXTERNAL_LINK",
      },
    });
    return NextResponse.json({ token: result.token, expiry: result.expiresAt.toISOString() });
  } catch (error) {
    return errorResponse(error, "contracts.fill-token.create");
  }
}
