import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createContractFillToken } from "@/lib/contractFillToken";

export async function POST(req: NextRequest) {
  await requireSession();
  const { contractId } = await req.json();
  if (!contractId) return NextResponse.json({ error: "缺少合同ID" }, { status: 400 });

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, customerId: true, status: true },
  });
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
    console.error("[contract-fill-token] generation failed", error);
    return NextResponse.json({ error: "合同填写链接服务尚未正确配置" }, { status: 500 });
  }
}
