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
      partyAAddress: body.partyAAddress || null,
      partyAContact: body.partyAContact || null,
      partyAPhone: body.partyAPhone || null,
      partyAEmail: body.partyAEmail || null,
      fillMethod: "EXTERNAL_LINK",
    },
  });

  // Auto-generate the docx if a template is selected. Errors here MUST NOT
  // block the client submission — they'll show up in version history later.
  try {
    const fresh = await prisma.contract.findUnique({
      where: { id: contract.id },
      select: { templateId: true, createdById: true },
    });
    if (fresh?.templateId && fresh?.createdById) {
      // Inline (avoid importing server action — this is a public API route)
      const tpl = await prisma.contractTemplate.findUnique({
        where: { id: fresh.templateId },
        select: { fileUrl: true, deletedAt: true },
      });
      if (tpl && !tpl.deletedAt) {
        const { fillContractTemplate, templateUrlToAbsPath } = await import("@/lib/contractTemplateFill");
        const { buildPlaceholderMap } = await import("@/lib/contractPlaceholders");
        const path = await import("path");
        const fsp = (await import("fs")).promises;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const full = await prisma.contract.findUnique({ where: { id: contract.id } }) as any;
        const fields = buildPlaceholderMap(full);
        const abs = templateUrlToAbsPath(tpl.fileUrl);
        const buf = await fsp.readFile(abs);
        const filled = await fillContractTemplate(buf, fields);
        const OUT = path.join(process.cwd(), "public", "contracts-generated");
        await fsp.mkdir(OUT, { recursive: true });
        const last = await prisma.contractVersion.findFirst({
          where: { contractId: contract.id },
          orderBy: { versionNo: "desc" },
          select: { versionNo: true },
        });
        const versionNo = (last?.versionNo ?? 0) + 1;
        const fileName = `${contract.id}-v${versionNo}.docx`;
        await fsp.writeFile(path.join(OUT, fileName), filled);
        const fileUrl = `/contracts-generated/${fileName}`;
        await prisma.contractVersion.create({
          data: {
            contractId: contract.id,
            versionNo,
            fileUrl,
            fileType: "docx",
            reason: "客户填写链接后自动生成",
            createdById: fresh.createdById,
          },
        });
        await prisma.contract.update({
          where: { id: contract.id },
          data: { generatedDocUrl: fileUrl },
        });
      }
    }
  } catch (err) {
    console.error("[contract-fill] auto-generate failed", err);
  }

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
