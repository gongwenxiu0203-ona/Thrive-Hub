import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FilePlus2, Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ContractV4Form } from "./ContractV4Form";
import { UploadExistingForm } from "./UploadExistingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建合同 · Thraive联盟营销系统" };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (session.role === "BRAND" || session.role === "CHANNEL") redirect("/dashboard");

  const sp = await searchParams;
  const customerId = sp.customerId;
  const contractId = sp.contractId; // 编辑模式
  const mode = sp.mode === "upload" ? "upload" : sp.mode === "new" ? "new" : null;

  let customer: { id: string; brandName: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existingContract: any = null;

  if (customerId) {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, brandName: true },
    });
    if (!customer) notFound();
  }

  if (contractId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingContract = await (prisma.contract.findUnique as any)({
      where: { id: contractId },
    });
    if (!existingContract) notFound();
    if (!customer) {
      customer = await prisma.customer.findUnique({
        where: { id: existingContract.customerId },
        select: { id: true, brandName: true },
      });
    }
  }

  const [customers, users, templates] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, brandName: true }, orderBy: { brandName: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractTemplate.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, templateKey: true },
      orderBy: [{ templateKey: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  // 编辑模式：直接进入老表单
  if (existingContract) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">编辑合同</h1>
          <p className="mt-1 text-sm text-slate-500">合同编号：{existingContract.contractNo}</p>
        </div>
        <ContractV4Form
          customers={customers}
          users={users}
          templates={templates}
          presetCustomerId={customer?.id}
          presetCustomerName={customer?.brandName}
          currentUserId={session.userId}
          existingContract={existingContract}
        />
      </div>
    );
  }

  // 第一步：让用户选择「新建」还是「上传已有」
  if (!mode) {
    const qs = customer?.id ? `&customerId=${customer.id}` : "";
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">新建合同</h1>
          <p className="mt-1 text-sm text-slate-500">请选择创建方式</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href={`/contracts/new?mode=new${qs}`}
            className="card flex flex-col gap-2 p-6 transition-colors hover:border-brand-400 hover:bg-brand-50/30"
          >
            <FilePlus2 className="h-6 w-6 text-brand-600" />
            <p className="text-base font-semibold text-slate-800">新建合同</p>
            <p className="text-sm text-slate-500">手动填写或 AI 识别字段、生成外部填写链接，基于模板生成合同 DOCX。</p>
          </Link>
          <Link
            href={`/contracts/new?mode=upload${qs}`}
            className="card flex flex-col gap-2 p-6 transition-colors hover:border-brand-400 hover:bg-brand-50/30"
          >
            <Upload className="h-6 w-6 text-brand-600" />
            <p className="text-base font-semibold text-slate-800">上传已有合同</p>
            <p className="text-sm text-slate-500">直接上传 .docx，系统自动识别甲方与合作信息；字段齐全则一键推送审核。</p>
          </Link>
        </div>
      </div>
    );
  }

  // 上传已有合同流程
  if (mode === "upload") {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">上传已有合同</h1>
            <p className="mt-1 text-sm text-slate-500">上传 .docx 后自动识别关键字段，缺失字段会标红提示</p>
          </div>
          <Link
            href={`/contracts/new${customer?.id ? `?customerId=${customer.id}` : ""}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← 返回选择创建方式
          </Link>
        </div>
        <UploadExistingForm
          customers={customers}
          users={users}
          templates={templates}
          presetCustomerId={customer?.id}
        />
      </div>
    );
  }

  // 新建合同流程
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">新建合同</h1>
          <p className="mt-1 text-sm text-slate-500">基于《平台联盟营销服务合同+项目确认书》模板创建</p>
        </div>
        <Link
          href={`/contracts/new${customer?.id ? `?customerId=${customer.id}` : ""}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 返回选择创建方式
        </Link>
      </div>

      <ContractV4Form
        customers={customers}
        users={users}
        templates={templates}
        presetCustomerId={customer?.id}
        presetCustomerName={customer?.brandName}
        currentUserId={session.userId}
        existingContract={existingContract}
      />
    </div>
  );
}
