import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Building2, FilePlus2, FileUp, FolderOpen, HandCoins, Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ContractV4Form } from "./ContractV4Form";
import { UploadExistingForm } from "./UploadExistingForm";
import { TransactionalUploadForm } from "./TransactionalUploadForm";
import { ChannelUploadForm } from "./ChannelUploadForm";
import { FrameworkContractForm } from "./FrameworkContractForm";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { contractScope, creationReferenceCustomerScope } from "@/lib/dataScope";
import { PARTY_B_COMPANIES } from "@/lib/partyB";
import { REVIEWER_EMAIL } from "@/lib/contractReviewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建合同 · Thraive联盟营销系统" };

type Mode = "brand" | "framework" | "new" | "upload" | "channel" | "transactional" | null;

export default async function NewContractPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  if (session.role === "BRAND" || session.role === "CHANNEL") redirect("/dashboard");

  const sp = await searchParams;
  const customerId = sp.customerId;
  const contractId = sp.contractId;
  const mode: Mode = ["brand", "framework", "new", "upload", "channel", "transactional"].includes(sp.mode ?? "") ? sp.mode as Mode : null;
  const frameworkFlow = sp.flow === "upload" ? "upload" : "create";
  let customer: { id: string; brandName: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existingContract: any = null;

  if (customerId && !contractId) {
    customer = await prisma.customer.findFirst({
      where: { id: customerId, ...creationReferenceCustomerScope(session), deletedAt: null },
      select: { id: true, brandName: true },
    });
    if (!customer) notFound();
  }
  if (contractId) {
    await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
    existingContract = await prisma.contract.findFirst({
      where: { id: contractId, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"), deletedAt: null },
    });
    if (!existingContract) notFound();
    if (existingContract.status === "COMPLETED" && session.role !== "ADMIN") redirect(`/contracts/${existingContract.id}`);
    if (existingContract.customerId) {
      customer = await prisma.customer.findFirst({
        where: { id: existingContract.customerId, ...creationReferenceCustomerScope(session), deletedAt: null },
        select: { id: true, brandName: true },
      });
    }
  }

  const [customerRows, users, templates, channelUsers] = await Promise.all([
    prisma.customer.findMany({
      where: { ...creationReferenceCustomerScope(session), deletedAt: null },
      select: { id: true, brandName: true, channelUserId: true },
      orderBy: { brandName: "asc" },
    }),
    prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER", "LYNQ_STAFF"] } },
      select: { id: true, name: true, role: true, email: true, phone: true }, orderBy: { name: "asc" },
    }),
    prisma.contractTemplate.findMany({
      where: { deletedAt: null, documentType: "BRAND_LEGACY" }, select: { id: true, name: true, templateKey: true },
      orderBy: [{ templateKey: "asc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { status: "APPROVED", role: "CHANNEL" },
      select: { id: true, name: true, email: true }, orderBy: { name: "asc" },
    }),
  ]);
  const channelUserById = new Map(channelUsers.map((item) => [item.id, item]));
  const defaultReviewerId = users.find((item) => item.email.toLowerCase() === REVIEWER_EMAIL)?.id
    ?? users.find((item) => item.name.toLowerCase().includes("shallow"))?.id;
  const customers = customerRows.map((item) => ({
    id: item.id,
    brandName: item.brandName,
    channelAccount: item.channelUserId ? channelUserById.get(item.channelUserId) ?? null : null,
  }));

  if (existingContract) {
    if (existingContract.contractMode === "FRAMEWORK") {
      const selectedAccounts = await prisma.contractReceivingAccount.findMany({ where: { contractId: existingContract.id }, select: { financeProfileId: true } });
      const retainedIds = selectedAccounts.flatMap(row => row.financeProfileId ? [row.financeProfileId] : []);
      const [frameworkTemplates, accounts] = await Promise.all([
        prisma.contractTemplate.findMany({ where: { documentType: "FRAMEWORK_MASTER", deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
        prisma.financeAccountProfile.findMany({ where: { OR: [{ status: "ACTIVE", accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] } }, { id: { in: retainedIds } }] }, select: { id: true, name: true, legalEntity: true, legalEntityKey: true, accountName: true, accountNumber: true, currency: true, status: true }, orderBy: { name: "asc" } }),
      ]);
      const initial = {
        id: existingContract.id, updatedAt: existingContract.updatedAt.toISOString(), customerId: existingContract.customerId,
        ownerId: existingContract.ownerId, reviewerId: existingContract.reviewerId, templateId: existingContract.templateId, partyBCompany: existingContract.partyBCompany,
        receivingAccountIds: selectedAccounts.flatMap(row => row.financeProfileId ? [row.financeProfileId] : []),
        partyA: existingContract.partyA, partyACreditCode: existingContract.partyACreditCode, partyAAddress: existingContract.partyAAddress,
        partyAContact: existingContract.partyAContact, partyAPhone: existingContract.partyAPhone, partyAEmail: existingContract.partyAEmail,
        partyBContact: existingContract.partyBContact, partyBEmail: existingContract.partyBEmail, partyBPhone: existingContract.partyBPhone, remark: existingContract.remark,
      };
      return <div className="mx-auto max-w-5xl space-y-6"><PageHeader title="编辑主格式合同" description={`合同编号：${existingContract.contractNo}；签署完成前可修改，保存时必须填写修改原因。`} backHref={`/contracts/${existingContract.id}`} backLabel="返回合同" /><FrameworkContractForm mode="create" existing={initial} templates={frameworkTemplates} customers={customers} users={users.filter(user => ["ADMIN", "USER"].includes(user.role))} accounts={accounts} currentUserId={session.userId} defaultReviewerId={defaultReviewerId} partyBOptions={Object.values(PARTY_B_COMPANIES).map(({ key, label, name }) => ({ key, label, name }))} /></div>;
    }
    return <div className="mx-auto max-w-4xl space-y-6"><div><h1 className="text-xl font-bold text-slate-900">编辑合同</h1><p className="mt-1 text-sm text-slate-500">合同编号：{existingContract.contractNo}</p></div><ContractV4Form customers={customers} users={users} templates={templates} presetCustomerId={customer?.id} presetCustomerName={customer?.brandName} currentUserId={session.userId} existingContract={existingContract} /></div>;
  }

  const customerQuery = customer?.id ? `&customerId=${customer.id}` : "";
  if (mode === "new" || mode === "upload") redirect(`/contracts/new?mode=framework&flow=${mode === "upload" ? "upload" : "create"}${customerQuery}`);
  if (!mode) {
    return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-xl font-bold text-slate-900">新建合同</h1><p className="mt-1 text-sm text-slate-500">请选择合同类型</p></div><div className="grid gap-4 sm:grid-cols-3">
      <EntryCard href={`/contracts/new?mode=brand${customerQuery}`} icon={<Building2 className="h-6 w-6" />} title="品牌方合同" description="新建或上传已有品牌方合同" />
      <EntryCard href={`/contracts/new?mode=channel${customerQuery}`} icon={<HandCoins className="h-6 w-6" />} title="渠道商返佣合同" description="填写双方资料与返佣规则，上传签署原件归档" />
      <EntryCard href="/contracts/new?mode=transactional" icon={<FileUp className="h-6 w-6" />} title="事务性合同" description="填写合同起止时间，上传签署原件归档" />
    </div></div>;
  }

  if (mode === "brand") {
    return <div className="mx-auto max-w-3xl space-y-6"><PageHeader title="品牌方合同" description="主格式合同管理双方基础信息；每份项目确认书独立计费和生成对账" backHref="/contracts/new" backLabel="返回合同类型" /><div className="flex flex-wrap justify-end gap-2"><Link href="/contracts/templates?scope=brand" className="btn-secondary inline-flex items-center gap-1.5 text-sm"><FolderOpen className="h-4 w-4" />品牌方合同模板</Link></div><div className="grid gap-4 sm:grid-cols-2">
      <EntryCard href={`/contracts/new?mode=framework&flow=create${customerQuery}`} icon={<FilePlus2 className="h-6 w-6" />} title="新建主格式合同" description="按统一字段录入主合同，完成签署后进入项目确认书" />
      <EntryCard href={`/contracts/new?mode=framework&flow=upload${customerQuery}`} icon={<Upload className="h-6 w-6" />} title="上传已有主格式合同" description="上传已签署原件，并按与新建完全相同的字段补齐资料" />
    </div><p className="text-xs text-slate-500">已存在的历史合同保留原字段；新建和上传已有品牌方合同均使用主格式合同＋项目确认书。</p></div>;
  }

  if (mode === "framework") {
    await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
    const frameworkTemplates = await prisma.contractTemplate.findMany({ where: { deletedAt: null, documentType: "FRAMEWORK_MASTER" }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
    const accounts = await prisma.financeAccountProfile.findMany({
      where: { accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] }, status: "ACTIVE" },
      select: { id: true, name: true, legalEntity: true, legalEntityKey: true, accountName: true, accountNumber: true, currency: true },
      orderBy: [{ legalEntity: "asc" }, { name: "asc" }],
    });
    const partyBOptions = Object.values(PARTY_B_COMPANIES).map(({ key, label, name }) => ({ key, label, name }));
    return <div className="mx-auto max-w-5xl space-y-6"><PageHeader title={frameworkFlow === "upload" ? "上传已有主格式合同" : "新建主格式合同"} description="新建与上传已有使用同一套双方资料、联系人和收款账户字段；项目合作与计费规则在确认书维护" backHref={`/contracts/new?mode=brand${customerQuery}`} backLabel="返回品牌方合同" /><FrameworkContractForm mode={frameworkFlow} presetCustomerId={customer?.id} templates={frameworkTemplates} customers={customers} users={users.filter((item) => ["ADMIN", "USER"].includes(item.role))} accounts={accounts} currentUserId={session.userId} defaultReviewerId={defaultReviewerId} partyBOptions={partyBOptions} /></div>;
  }

  if (mode === "transactional") return <div className="mx-auto max-w-3xl space-y-6"><PageHeader title="事务性合同" description="填写合同起止时间并上传已签署原件；保存后直接标记签署完成" backHref="/contracts/new" backLabel="返回合同类型" /><TransactionalUploadForm currentUserId={session.userId} /></div>;
  if (mode === "channel") return <div className="mx-auto max-w-5xl space-y-6"><PageHeader title="渠道商返佣合同" description="填写合同专属字段与返佣规则，上传已签署原件后直接归档" backHref="/contracts/new" backLabel="返回合同类型" /><ChannelUploadForm customers={customers} users={users} currentUserId={session.userId} presetCustomerId={customer?.id} /></div>;
  return <div className="mx-auto max-w-4xl space-y-6"><PageHeader title="新建品牌方合同" description="基于合同模板创建" backHref={`/contracts/new?mode=brand${customerQuery}`} backLabel="返回品牌方合同" /><ContractV4Form customers={customers} users={users} templates={templates} presetCustomerId={customer?.id} presetCustomerName={customer?.brandName} currentUserId={session.userId} existingContract={existingContract} /></div>;
}

function EntryCard({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return <Link href={href} className="card flex min-h-40 flex-col gap-3 p-6 text-brand-600 transition-colors hover:border-brand-400 hover:bg-brand-50/30"><span>{icon}</span><p className="text-base font-semibold text-slate-800">{title}</p><p className="text-sm text-slate-500">{description}</p></Link>;
}

function PageHeader({ title, description, backHref, backLabel }: { title: string; description: string; backHref: string; backLabel: string }) {
  return <div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-bold text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div><Link href={backHref} className="shrink-0 text-sm text-slate-500 hover:text-slate-700">← {backLabel}</Link></div>;
}
