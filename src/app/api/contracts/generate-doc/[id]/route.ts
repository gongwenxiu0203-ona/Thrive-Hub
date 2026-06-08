import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { generateContractDocx } from "@/lib/contractV4Generate";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = await (prisma.contract.findUnique as any)({
    where: { id },
    select: {
      contractNo: true,
      partyA: true,
      partyACreditCode: true,
      partyALegalRep: true,
      partyAAddress: true,
      partyAContact: true,
      partyAPhone: true,
      partyAEmail: true,
      promoPlatform: true,
      targetSite: true,
      startDate: true,
      endDate: true,
      taxType: true,
      taxBearer: true,
      feeAmount: true,
      feeCurrency: true,
      firstPeriodFee: true,
      feeCycle: true,
      commissionType: true,
      commissionRate: true,
      thresholdAmount: true,
      thresholdCurrency: true,
      tieredRules: true,
      excessBaseMonths: true,
      excessCommissionRate: true,
      gmvSettlementCycle: true,
      productList: true,
      coopChannels: true,
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }

  try {
    const docxBuffer = await generateContractDocx({
      contractNo: contract.contractNo,
      partyAName: contract.partyA ?? "",
      partyACreditCode: contract.partyACreditCode,
      partyALegalRep: contract.partyALegalRep,
      partyAAddress: contract.partyAAddress,
      partyAContact: contract.partyAContact,
      partyAPhone: contract.partyAPhone,
      partyAEmail: contract.partyAEmail,
      promoPlatform: contract.promoPlatform,
      targetSite: contract.targetSite,
      startDate: contract.startDate,
      endDate: contract.endDate,
      taxType: contract.taxType,
      taxBearer: contract.taxBearer,
      feeAmount: contract.feeAmount,
      feeCurrency: contract.feeCurrency,
      firstPeriodFee: contract.firstPeriodFee,
      feeCycle: contract.feeCycle,
      commissionType: contract.commissionType,
      commissionRate: contract.commissionRate,
      thresholdAmount: contract.thresholdAmount,
      thresholdCurrency: contract.thresholdCurrency,
      tieredRules: contract.tieredRules,
      excessBaseMonths: contract.excessBaseMonths,
      excessCommissionRate: contract.excessCommissionRate,
      gmvSettlementCycle: contract.gmvSettlementCycle,
      productList: contract.productList,
      coopChannels: contract.coopChannels,
    });

    const filename = encodeURIComponent(`${contract.contractNo}-联盟营销服务合同.docx`);
    return new NextResponse(docxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (err) {
    console.error("[generate-doc] error:", err);
    return NextResponse.json({ error: "合同生成失败，请重试" }, { status: 500 });
  }
}
