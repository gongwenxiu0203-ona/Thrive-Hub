import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyContractFillToken } from "@/lib/contractFillToken";

const EDITABLE_STATUSES = new Set(["DRAFT", "IN_PROGRESS"]);
const MAX_FIELD_LENGTH = 500;

const PARTY_A_FIELDS = [
  "partyAName",
  "partyACreditCode",
  "partyAAddress",
  "partyAContact",
  "partyAPhone",
  "partyAEmail",
] as const;

type PartyAField = (typeof PARTY_A_FIELDS)[number];

async function resolveContract(token: string) {
  const claims = await verifyContractFillToken(token);
  const contract = await prisma.contract.findFirst({
    where: {
      id: claims.contractId,
      customerId: claims.customerId,
      externalFillToken: token,
    },
    select: {
      id: true,
      customerId: true,
      status: true,
      externalFillExpiry: true,
      partyA: true,
    },
  });
  if (!contract) throw new Error("NOT_FOUND");
  if (contract.externalFillExpiry && contract.externalFillExpiry.getTime() < Date.now()) {
    throw new Error("EXPIRED");
  }
  if (!EDITABLE_STATUSES.has(contract.status)) throw new Error("LOCKED");
  return contract;
}

function tokenError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "EXPIRED" || message.includes("exp")) {
    return NextResponse.json({ error: "填写链接已过期" }, { status: 410 });
  }
  if (message === "LOCKED") {
    return NextResponse.json({ error: "合同已进入审核或签署流程，不能继续修改" }, { status: 409 });
  }
  return NextResponse.json({ error: "填写链接无效" }, { status: 404 });
}

function readPartyAFields(body: unknown): Record<PartyAField, string> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const source = body as Record<string, unknown>;
  const result = {} as Record<PartyAField, string>;
  for (const field of PARTY_A_FIELDS) {
    if (typeof source[field] !== "string") return null;
    const value = source[field].trim();
    if (!value || value.length > MAX_FIELD_LENGTH) return null;
    result[field] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.partyAEmail)) return null;
  return result;
}

async function generateContractVersion(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { templateId: true, createdById: true },
  });
  if (!contract?.templateId || !contract.createdById) return;

  const template = await prisma.contractTemplate.findUnique({
    where: { id: contract.templateId },
    select: { fileUrl: true, deletedAt: true },
  });
  if (!template || template.deletedAt) return;

  const [{ fillContractTemplate, templateUrlToAbsPath }, { buildPlaceholderMap }, path, fs] =
    await Promise.all([
      import("@/lib/contractTemplateFill"),
      import("@/lib/contractPlaceholders"),
      import("path"),
      import("fs/promises"),
    ]);
  const fullContract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!fullContract) return;
  const templateBuffer = await fs.readFile(templateUrlToAbsPath(template.fileUrl));
  const filled = await fillContractTemplate(templateBuffer, buildPlaceholderMap(fullContract));
  const outputDir = path.join(process.cwd(), "public", "contracts-generated");
  await fs.mkdir(outputDir, { recursive: true });

  await prisma.$transaction(async (tx) => {
    const latest = await tx.contractVersion.findFirst({
      where: { contractId },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true },
    });
    const versionNo = (latest?.versionNo ?? 0) + 1;
    const fileName = `${contractId}-v${versionNo}.docx`;
    const fileUrl = `/contracts-generated/${fileName}`;
    await fs.writeFile(path.join(outputDir, fileName), filled);
    await tx.contractVersion.create({
      data: {
        contractId,
        versionNo,
        fileUrl,
        fileType: "docx",
        reason: "客户填写链接后自动生成",
        createdById: contract.createdById,
      },
    });
    await tx.contract.update({ where: { id: contractId }, data: { generatedDocUrl: fileUrl } });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let contract;
  try {
    contract = await resolveContract(token);
  } catch (error) {
    return tokenError(error);
  }

  const fields = readPartyAFields(await req.json().catch(() => null));
  if (!fields) {
    return NextResponse.json({ error: "请完整填写有效的甲方信息" }, { status: 400 });
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      partyA: fields.partyAName,
      partyACreditCode: fields.partyACreditCode,
      partyAAddress: fields.partyAAddress,
      partyAContact: fields.partyAContact,
      partyAPhone: fields.partyAPhone,
      partyAEmail: fields.partyAEmail,
      fillMethod: "EXTERNAL_LINK",
    },
  });

  try {
    await generateContractVersion(contract.id);
  } catch (error) {
    console.error("[contract-fill] auto-generate failed", error);
  }

  revalidatePath(`/contracts/${contract.id}`);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const contract = await resolveContract(token);
    return NextResponse.json({
      partyAName: contract.partyA ?? "",
      expiry: contract.externalFillExpiry?.toISOString() ?? null,
    });
  } catch (error) {
    return tokenError(error);
  }
}
