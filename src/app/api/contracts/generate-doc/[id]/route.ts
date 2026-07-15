import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildPlaceholderMap } from "@/lib/contractPlaceholders";
import { fillContractTemplate } from "@/lib/contractTemplateFill";
import { contractFileBaseName } from "@/lib/contractFileName";
import { resolveContractTemplateBuffer } from "@/lib/contractTemplateResolve";
import { convertDocxToPdf } from "@/lib/docxToPdf";
import { contractScope } from "@/lib/dataScope";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get("format") ?? "docx").toLowerCase();

  try {
    await requireFeaturePermission(session, "contracts", "READ");
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权访问合同" }, { status: 403 });
    }
    throw error;
  }

  const contract = await prisma.contract.findFirst({
    where: {
      id,
      ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"),
      deletedAt: null,
    },
    include: { template: true, customer: { select: { brandName: true } } },
  });

  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }
  if (!contract.templateId || !contract.template) {
    return NextResponse.json(
      { error: "请先在合同信息中选择有效合同模板" },
      { status: 400 },
    );
  }

  try {
    const resolvedTemplate = await resolveContractTemplateBuffer(contract.template);
    if ("error" in resolvedTemplate) {
      return NextResponse.json({ error: resolvedTemplate.error }, { status: 400 });
    }
    const docxBuffer = await fillContractTemplate(
      resolvedTemplate.buffer,
      {
        ...buildPlaceholderMap(contract),
        templateKey: resolvedTemplate.templateKey,
      },
    );

    const baseName = contractFileBaseName(contract);
    if (format === "pdf") {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "thraive-contract-download-"));
      try {
        const docxPath = path.join(tmpDir, `${baseName}.docx`);
        await fs.writeFile(docxPath, docxBuffer);
        let pdfPath: string;
        try {
          pdfPath = await convertDocxToPdf(docxPath, tmpDir);
        } catch (convertError) {
          console.error("[generate-doc] pdf conversion error:", convertError);
          const detail = convertError instanceof Error ? convertError.message : "未知错误";
          return NextResponse.json(
            {
              error: "PDF 生成失败：当前环境未正确配置 LibreOffice / SOFFICE_PATH。请先下载 Word，或在服务器/本机安装 LibreOffice 后重试。",
              detail,
            },
            { status: 503 },
          );
        }
        const pdfBuffer = await fs.readFile(pdfPath);
        const filename = encodeURIComponent(`${baseName}.pdf`);
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const filename = encodeURIComponent(`${baseName}.docx`);
    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[generate-doc] error:", err);
    return NextResponse.json({ error: "合同生成失败，请重试" }, { status: 500 });
  }
}
