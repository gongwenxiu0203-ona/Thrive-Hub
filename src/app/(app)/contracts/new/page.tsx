import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Building2, FilePlus2, FileUp, HandCoins, Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ContractV4Form } from "./ContractV4Form";
import { UploadExistingForm } from "./UploadExistingForm";
import { TransactionalUploadForm } from "./TransactionalUploadForm";
import { ChannelUploadForm } from "./ChannelUploadForm";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { contractScope, creationReferenceCustomerScope } from "@/lib/dataScope";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建合同 · Thraive联盟营销系统" };

type Mode = "brand" | "new" | "upload" | "channel" | "transactional" | null;

export default async function NewContractPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  if (session.role === "BRAND" || session.role === "CHANNEL") redirect("/dashboard");

  const sp = await searchParams;
  const customerId = sp.customerId;
  const contractId = sp.contractId;
  const mode: Mode = ["brand", "new", "upload", "channel", "transactional"].includes(sp.mode ?? "") ? sp.mode as Mode : null;
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
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    prisma.contractTemplate.findMany({
      where: { deletedAt: null }, select: { id: true, name: true, templateKey: true },
      orderBy: [{ templateKey: "asc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { status: "APPROVED", role: "CHANNEL" },
      select: { id: true, name: true, email: true }, orderBy: { name: "asc" },
    }),
  ]);
  const channelUserById = new Map(channelUsers.map((item) => [item.id, item]));
  const customers = customerRows.map((item) => ({
    id: item.id,
    brandName: item.brandName,
    channelAccount: item.channelUserId ? channelUserById.get(item.channelUserId) ?? null : null,
  }));

  if (existingContract) {
    return <div className="mx-auto max-w-4xl space-y-6"><div><h1 className="text-xl font-bold text-slate-900">编辑合同</h1><p className="mt-1 text-sm text-slate-500">合同编号：{existingContract.contractNo}</p></div><ContractV4Form customers={customers} users={users} templates={templates} presetCustomerId={customer?.id} presetCustomerName={customer?.brandName} currentUserId={session.userId} existingContract={existingContract} /></div>;
  }

  const customerQuery = customer?.id ? `&customerId=${customer.id}` : "";
  if (!mode) {
    return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-xl font-bold text-slate-900">新建合同</h1><p className="mt-1 text-sm text-slate-500">请选择合同类型</p></div><div className="grid gap-4 sm:grid-cols-3">
      <EntryCard href={`/contracts/new?mode=brand${customerQuery}`} icon={<Building2 className="h-6 w-6" />} title="品牌方合同" description="新建或上传已有品牌方合同" />
      <EntryCard href={`/contracts/new?mode=channel${customerQuery}`} icon={<HandCoins className="h-6 w-6" />} title="渠道商返佣合同" description="关联客户及渠道商账户后上传归档" />
      <EntryCard href="/contracts/new?mode=transactional" icon={<FileUp className="h-6 w-6" />} title="事务性合同" description="上传源文件并直接归档" />
    </div></div>;
  }

  if (mode === "brand") {
    return <div className="mx-auto max-w-3xl space-y-6"><PageHeader title="品牌方合同" description="请选择创建方式" backHref="/contracts/new" backLabel="返回合同类型" /><div className="grid gap-4 sm:grid-cols-2">
      <EntryCard href={`/contracts/new?mode=new${customerQuery}`} icon={<FilePlus2 className="h-6 w-6" />} title="新建合同" description="创建新的品牌方合同" />
      <EntryCard href={`/contracts/new?mode=upload${customerQuery}`} icon={<Upload className="h-6 w-6" />} title="上传已有合同" description="上传已签署合同并沿用字段识别流程" />
    </div></div>;
  }

  if (mode === "transactional") return <div className="mx-auto max-w-3xl space-y-6"><PageHeader title="事务性合同" description="填写负责人并上传源文件" backHref="/contracts/new" backLabel="返回合同类型" /><TransactionalUploadForm users={users} currentUserId={session.userId} /></div>;
  if (mode === "channel") return <div className="mx-auto max-w-4xl space-y-6"><PageHeader title="渠道商返佣合同" description="关联客户、核对渠道商账户并上传合同原件" backHref="/contracts/new" backLabel="返回合同类型" /><ChannelUploadForm customers={customers} users={users} currentUserId={session.userId} presetCustomerId={customer?.id} /></div>;
  if (mode === "upload") return <div className="mx-auto max-w-4xl space-y-6"><PageHeader title="上传已有品牌方合同" description="缺失字段须补齐后创建" backHref={`/contracts/new?mode=brand${customerQuery}`} backLabel="返回品牌方合同" /><UploadExistingForm customers={customers} users={users} templates={templates} presetCustomerId={customer?.id} /></div>;
  return <div className="mx-auto max-w-4xl space-y-6"><PageHeader title="新建品牌方合同" description="基于合同模板创建" backHref={`/contracts/new?mode=brand${customerQuery}`} backLabel="返回品牌方合同" /><ContractV4Form customers={customers} users={users} templates={templates} presetCustomerId={customer?.id} presetCustomerName={customer?.brandName} currentUserId={session.userId} existingContract={existingContract} /></div>;
}

function EntryCard({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return <Link href={href} className="card flex min-h-40 flex-col gap-3 p-6 text-brand-600 transition-colors hover:border-brand-400 hover:bg-brand-50/30"><span>{icon}</span><p className="text-base font-semibold text-slate-800">{title}</p><p className="text-sm text-slate-500">{description}</p></Link>;
}

function PageHeader({ title, description, backHref, backLabel }: { title: string; description: string; backHref: string; backLabel: string }) {
  return <div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-bold text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div><Link href={backHref} className="shrink-0 text-sm text-slate-500 hover:text-slate-700">← {backLabel}</Link></div>;
}
