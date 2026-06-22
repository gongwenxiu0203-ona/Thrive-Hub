import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { buildPlaceholderMap } from "@/lib/contractPlaceholders";
import {
  fillContractTemplate,
  templateUrlToAbsPath,
} from "@/lib/contractTemplateFill";
import { contractFileBaseName } from "@/lib/contractFileName";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { template: true, customer: { select: { brandName: true } } },
  });

  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }
  if (!contract.templateId || !contract.template || contract.template.deletedAt) {
    return NextResponse.json(
      { error: "请先在合同信息中选择有效合同模板" },
      { status: 400 },
    );
  }

  try {
    const templateAbs = templateUrlToAbsPath(contract.template.fileUrl);
    const templateBuffer = await fs.readFile(templateAbs);
    const docxBuffer = await fillContractTemplate(
      templateBuffer,
      {
        ...buildPlaceholderMap(contract),
        templateKey: contract.template.templateKey,
      },
    );

    const filename = encodeURIComponent(`${contractFileBaseName(contract)}.docx`);
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
