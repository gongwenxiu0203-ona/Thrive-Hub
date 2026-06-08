import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/** 公开接口：客户通过外部链接提交填写的合同信息 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = await (prisma.contract.findUnique as any)({
    where: { externalFillToken: token },
    select: { id: true, externalFillExpiry: true, status: true },
  });

  if (!contract) {
    return NextResponse.json({ error: "链接无效" }, { status: 404 });
  }
  if (contract.externalFillExpiry && new Date(contract.externalFillExpiry) < new Date()) {
    return NextResponse.json({ error: "链接已过期" }, { status: 410 });
  }
  if (contract.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "合同已不可修改" }, { status: 409 });
  }

  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.contract.update as any)({
    where: { id: contract.id },
    data: {
      partyA: body.partyAName || undefined,
      partyACreditCode: body.partyACreditCode || null,
      partyALegalRep: body.partyALegalRep || null,
      partyAAddress: body.partyAAddress || null,
      partyAContact: body.partyAContact || null,
      partyAPhone: body.partyAPhone || null,
      partyAEmail: body.partyAEmail || null,
      fillMethod: "EXTERNAL_LINK",
    },
  });

  revalidatePath(`/contracts/${contract.id}`);
  return NextResponse.json({ ok: true });
}

/** 公开接口：根据 token 获取合同基本信息（用于填写页面展示） */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = await (prisma.contract.findUnique as any)({
    where: { externalFillToken: token },
    select: {
      id: true,
      contractNo: true,
      externalFillExpiry: true,
      status: true,
      partyA: true,
      customer: { select: { brandName: true } },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "链接无效" }, { status: 404 });
  }
  if (contract.externalFillExpiry && new Date(contract.externalFillExpiry) < new Date()) {
    return NextResponse.json({ error: "链接已过期" }, { status: 410 });
  }

  return NextResponse.json({
    contractNo: contract.contractNo,
    brandName: contract.customer?.brandName ?? "",
    partyAName: contract.partyA ?? "",
    expiry: contract.externalFillExpiry,
  });
}
