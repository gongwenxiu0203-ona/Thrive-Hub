import Link from "next/link";
import { FilePlus } from "lucide-react";
import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar, SearchFilter } from "@/components/ui/Filters";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { ScopeToggle } from "@/components/ScopeToggle";
import { isStaff } from "@/lib/dataScope";
import { frameworkMissingFields } from "@/lib/frameworkCompleteness";
import { decodeConfirmation } from "@/lib/contractConfirmationStore";
import { parseEffectiveConfirmation } from "@/lib/contractConfirmationDraft";

export const metadata = { title: "合同管理 · Thraive联盟营销系统" };

function csv(sp: Record<string, string | undefined>, key: string): string[] {
  return (sp[key] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function isMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  return false;
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function commissionConfigValue(ct: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = readJsonRecord(ct.commissionConfig);
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function confirmationFieldIssues(draft: ReturnType<typeof decodeConfirmation>["draft"]): string[] {
  try {
    parseEffectiveConfirmation(draft);
    return [];
  } catch (error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    return issues?.map((issue) => issue.message).filter((message): message is string => Boolean(message)) ?? ["字段不完整"];
  }
}

const confirmationStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  EFFECTIVE: "已签署生效",
  TERMINATED: "已终止",
  VOID: "已作废",
};

const contractColumnWidths = [152, 140, 180, 86, 104, 104, 90, 90, 108, 82, 120, 132, 82, 104, 112];

function ContractColumnLayout() {
  return <colgroup>{contractColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>;
}

function missingContractFields(ct: Record<string, unknown>): string[] {
  if (ct.type === "TRANSACTIONAL" || ct.uploadType === "TRANSACTIONAL") return [];
  const required: Array<[string, unknown]> = [
    ["甲方公司名称", ct.partyA],
    ["销售平台 / 推广平台", ct.promoPlatform],
    ["目标站点", ct.targetSite],
    ["合作开始日期", ct.startDate],
    ["合作结束日期", ct.endDate],
    ["固定服务费货币", ct.feeCurrency],
    ["月度服务费金额", ct.feeAmount],
    ["固费支付周期", ct.feeCycle],
    ["GMV佣金结算方式", ct.commissionType],
    ["GMV结算周期", ct.gmvSettlementCycle],
  ];
  const commissionType = String(ct.commissionType || "FIXED").toUpperCase();
  if (commissionType === "THRESHOLD") {
    required.push(
      ["门槛佣金币种", ct.thresholdCurrency],
      ["GMV门槛金额", ct.thresholdAmount],
      ["达标后抽佣比例", commissionConfigValue(ct, ["threshold", "reachedRate"])],
      ["未达标抽佣比例", commissionConfigValue(ct, ["threshold", "unreachedRate"])],
    );
  } else if (commissionType === "TIERED") {
    required.push(["阶梯佣金规则", ct.tieredRules]);
  } else if (commissionType === "SPECIAL") {
    required.push(["特殊佣金条款", ct.specialCommissionTerms]);
  } else if (commissionType === "INCREMENTAL" || commissionType === "EXCESS") {
    required.push(
      ["基准月数", ct.excessBaseMonths],
      ["超额增长部分佣金比例", ct.excessCommissionRate],
    );
  } else {
    required.push(["GMV抽佣比例", ct.commissionRate]);
  }
  return required.filter(([, value]) => isMissing(value)).map(([label]) => label);
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const requestedCategory = sp.category;
  const category = requestedCategory === "channel" || requestedCategory === "transactional" || requestedCategory === "brand"
    ? requestedCategory
    : session.role === "CHANNEL" ? "channel" : "brand";
  const categoryTypes = category === "channel" ? ["CHANNEL", "REBATE"] : category === "transactional" ? ["TRANSACTIONAL"] : ["BRAND"];

  const statusFilter = csv(sp, "status");
  const customerFilter = csv(sp, "customer");
  const q = sp.q?.trim() ?? "";

  // 行级权限
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { contractScope, customerScope, parseViewScope } = await import(
    "@/lib/dataScope"
  );
  const sess = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  const view = parseViewScope(sp);

  const [allContracts, customers, users] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.contract.findMany({
      where: { ...contractScope(sess, view), deletedAt: null, type: { in: categoryTypes } } as any,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true, owner: true, reviewer: true, createdBy: true,
        splitRule: true,
        projectConfirmations: {
          orderBy: [{ number: "asc" }, { createdAt: "asc" }],
          include: { versions: { orderBy: { createdAt: "asc" }, select: { snapshot: true, createdAt: true } } },
        },
        _count: { select: { receivingAccounts: true, projectConfirmations: true } },
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customer.findMany({
      where: { ...customerScope(sess, view), deletedAt: null } as any,
      orderBy: { brandName: "asc" },
    }),
    prisma.user.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" } }),
  ]);

  // Client-side filtering for multi-select support
  const contracts = allContracts.filter((ct) => {
    if (statusFilter.length && !statusFilter.includes(ct.status)) return false;
    if (customerFilter.length && (!ct.customerId || !customerFilter.includes(ct.customerId))) return false;
    if (q) {
      const ql = q.toLowerCase();
      if (
        !ct.contractNo.toLowerCase().includes(ql) &&
        !(ct.customer?.brandName ?? "").toLowerCase().includes(ql)
      )
        return false;
    }
    return true;
  });

  const customerOptions = customers.map((c) => ({ id: c.id, brandName: c.brandName }));
  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  const statusOptions = Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  const customerFilterOptions = customers.map((c) => ({ value: c.id, label: c.brandName }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="合同管理"
        description={
          isStaff(session.role)
            ? view === "all"
              ? "全部合同视图"
              : "默认仅显示与你相关的合同，可切换到「全部」"
            : "合同管理"
        }
        actions={
          <div className="flex items-center gap-2">
            {isStaff(session.role) && <ScopeToggle />}
            {isStaff(session.role) && <Link href="/contracts/new" className="btn-primary flex items-center gap-1.5 text-sm"><FilePlus className="h-4 w-4" /> 新建合同</Link>}
          </div>
        }
      />

      <nav className="flex flex-wrap gap-2 border-b border-slate-200" aria-label="合同分类">
        {[
          { value: "brand", label: "品牌方合同" },
          { value: "channel", label: "渠道商合同" },
          { value: "transactional", label: "事务性合同" },
        ].map((item) => (
          <Link
            key={item.value}
            href={`/contracts?category=${item.value}${view === "all" ? "&scope=all" : ""}`}
            aria-current={category === item.value ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${category === item.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <FilterBar>
        <SearchFilter placeholder="搜索合同编号 / 客户名称" />
        <MultiSelectFilter paramKey="status" placeholder="合同状态" options={statusOptions} />
        <MultiSelectFilter paramKey="customer" placeholder="关联客户" options={customerFilterOptions} />
      </FilterBar>

      {contracts.length === 0 ? (
        <EmptyState title="暂无合同" description="点击右上角新建合同" />
      ) : category === "brand" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1706px] table-fixed text-sm">
            <ContractColumnLayout />
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">合同编号</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">关联客户</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">甲方公司</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">类型</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">开始时间</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">结束时间</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">负责人</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">审核人</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">固费</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">抽佣</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">字段状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">创建人</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">创建方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {contracts.map((ct) => {
                const framework = ct.contractMode === "FRAMEWORK";
                const decodedConfirmations = framework
                  ? ct.projectConfirmations.flatMap((row) => {
                      try {
                        const draft = decodeConfirmation(row).draft;
                        return [{ row, draft, issues: confirmationFieldIssues(draft) }];
                      }
                      catch { return []; }
                    })
                  : [];
                const hasMultipleConfirmations = decodedConfirmations.length > 1;
                const primaryConfirmation = decodedConfirmations.find(({ row }) => row.number === `${ct.contractNo}-001`)
                  ?? decodedConfirmations.find(({ row }) => !["VOID", "VOIDED"].includes(row.status));
                const latestConfirmation = decodedConfirmations
                  .slice()
                  .sort((a, b) => (b.draft.startDate ?? "").localeCompare(a.draft.startDate ?? "") || b.row.createdAt.getTime() - a.row.createdAt.getTime())[0];
                const confirmationIssues = decodedConfirmations.flatMap(({ row, issues }) => [
                  ...issues.map((issue) => `${row.number}：${issue}`),
                  ...(row.signedFileUrl ? [] : [`${row.number}：缺少签署原件`]),
                ]);
                const masterMissingFields = framework ? frameworkMissingFields(ct, ct._count.receivingAccounts) : [];
                const missingFields = framework
                  ? [...masterMissingFields, ...(hasMultipleConfirmations ? [] : confirmationIssues)]
                  : missingContractFields(ct as unknown as Record<string, unknown>);
                const displayStart = framework ? hasMultipleConfirmations ? null : latestConfirmation?.draft.startDate : ct.startDate;
                const displayEnd = framework ? hasMultipleConfirmations ? null : latestConfirmation?.draft.endDate : ct.endDate;
                const monthlyFee = latestConfirmation?.draft.monthlyFee;
                const commission = latestConfirmation?.draft.commission;
                const compositeStatus = !framework || ct.status !== "COMPLETED"
                  ? labelOf(CONTRACT_STATUS_LABELS, ct.status)
                  : !primaryConfirmation
                    ? "主合同已签署·待确认书"
                    : primaryConfirmation.row.signedFileUrl && ["EFFECTIVE", "TERMINATED"].includes(primaryConfirmation.row.status)
                      ? "合同签署完成"
                      : primaryConfirmation.row.signedFileUrl
                        ? "已归档·待确认书生效"
                        : "主合同已签署·确认书待签署";
                const compositeStatusClass = framework && ct.status === "COMPLETED" && compositeStatus !== "合同签署完成"
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : CONTRACT_STATUS_COLORS[ct.status];
                return (
                <Fragment key={ct.id}>
                <tr className="group hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contracts/${ct.id}`}
                      className="font-semibold text-brand-700 hover:text-brand-500 hover:underline"
                    >
                      {ct.contractNo}
                    </Link>
                    {framework && <p className="mt-1 text-xs text-slate-500">主格式合同 · {ct._count.projectConfirmations} 份确认书</p>}
                  </td>
                  <td className="px-4 py-3">
                    {ct.customer ? (
                      <Link
                        href={`/customers/${ct.customerId}`}
                        className="text-slate-700 hover:text-brand-600 hover:underline"
                      >
                        {ct.customer.brandName}
                      </Link>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ct.partyA || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {labelOf(CONTRACT_TYPE_LABELS, ct.type)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {displayStart ? formatDate(displayStart) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {displayEnd ? formatDate(displayEnd) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ct.owner?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ct.reviewer?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{framework ? hasMultipleConfirmations ? "按确认书" : monthlyFee ? `${monthlyFee.currency} ${monthlyFee.amount}` : "0" : ct.feeAmount ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{framework ? hasMultipleConfirmations ? "按确认书" : commission ? commission.mode === "PACKAGE" ? `总包 ${commission.currency} ${commission.packageValue ?? "—"}` : `${commission.serviceRatePercent ?? 0}%` : "0%" : ct.commissionRate ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3" title={missingFields.join("；")}>
                    <Badge className={compositeStatusClass}>
                      {framework && ct.status === "DRAFT" ? "草稿·待上传盖章版" : compositeStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {missingFields.length > 0 ? (
                      <Badge className="border border-rose-200 bg-rose-50 text-rose-700">
                        字段不全（{missingFields.length}）
                      </Badge>
                    ) : (
                      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                        {framework ? hasMultipleConfirmations ? "主合同完整" : decodedConfirmations.length ? "主合同及确认书完整" : ct.status === "DRAFT" ? "资料完整·待签署" : "主合同完整·待确认书" : "完整"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ct.createdBy?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDate(ct.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{{
                    WEBSITE_CREATE: "网站创建",
                    EXISTING: "上传已有",
                    TRANSACTIONAL: "事务性合同",
                    CHANNEL_ARCHIVE: "渠道合同归档",
                  }[ct.uploadType || ""] || "历史记录"}</td>
                </tr>
                {framework && hasMultipleConfirmations && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={15} className="p-0">
                      <details className="group/confirmations">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-300">
                          <span className="inline-flex items-center gap-2">项目确认书明细 <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">{decodedConfirmations.length} 份</span><span className="text-xs font-normal text-slate-500 group-open/confirmations:hidden">展开查看</span></span>
                        </summary>
                        <div className="overflow-hidden border-t border-slate-200 bg-white">
                          <table className="w-full table-fixed text-xs">
                            <ContractColumnLayout />
                            <tbody className="divide-y divide-slate-100">
                              {decodedConfirmations.map(({ row, draft, issues }) => {
                                const complete = issues.length === 0;
                                const signedVersion = row.signedFileUrl ? row.versions.find((version) => { try { return JSON.parse(version.snapshot).signedFileUrl === row.signedFileUrl; } catch { return false; } }) : null;
                                const uploadTime = signedVersion ? formatDate(signedVersion.createdAt) : row.signedFileUrl && row.effectiveAt ? formatDate(row.effectiveAt) : null;
                                return <tr key={row.id} className="align-top hover:bg-slate-50">
                                  <td className="px-4 py-3"><Link className="font-medium text-purple-700 hover:underline" href={`/contracts/${ct.id}/confirmations?focus=${row.id}#confirmation-${row.id}`}>{row.number}</Link><span className="mt-1 block text-[11px] text-slate-500">项目确认书</span></td>
                                  <td className="px-4 py-3 text-slate-300">—</td>
                                  <td className="px-4 py-3 text-slate-300">—</td>
                                  <td className="px-4 py-3 text-slate-600">项目确认书</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{draft.startDate || "—"}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{draft.endDate || "—"}</td>
                                  <td className="px-4 py-3 text-slate-300">—</td>
                                  <td className="px-4 py-3 text-slate-300">—</td>
                                  <td className="px-4 py-3 text-slate-700">{draft.monthlyFee ? `${draft.monthlyFee.currency} ${draft.monthlyFee.amount}` : "0"}</td>
                                  <td className="px-4 py-3 text-slate-700">{draft.commission ? draft.commission.mode === "PACKAGE" ? `总包 ${draft.commission.currency} ${draft.commission.packageValue || "待填写"}` : `${draft.commission.serviceRatePercent ?? 0}%` : "0%"}</td>
                                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 font-medium ${row.status === "EFFECTIVE" ? "bg-emerald-50 text-emerald-700" : row.status === "DRAFT" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{confirmationStatusLabels[row.status] || row.status}</span>{!row.signedFileUrl && <span className="mt-1 block text-slate-500">未上传签署原件</span>}</td>
                                  <td className="px-4 py-3">{complete ? <span className="text-emerald-700">完整</span> : <Link title={issues.join("；")} className="font-medium text-rose-700 underline decoration-rose-300 underline-offset-2" href={`/contracts/${ct.id}/confirmations?focus=${row.id}&highlight=missing#confirmation-${row.id}`}>字段不全（{issues.length}）</Link>}</td>
                                  <td className="px-4 py-3 text-slate-300">—</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                                  <td className="px-4 py-3 text-slate-700">{draft.workflowMode === "SIGNED_UPLOAD" ? "上传已签署确认书" : "网站创建确认书"}{uploadTime && <span className="mt-1 block whitespace-nowrap text-[11px] text-slate-500">上传 {uploadTime}</span>}</td>
                                </tr>;
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : category === "channel" ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[1120px] text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              {['合同编号','关联客户','乙方公司','合同起止时间','固费乙方比例','联盟运营佣金规则','状态','原件'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{contracts.map((ct) => {
              const rule = ct.splitRule;
              return <tr key={ct.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><Link href={`/contracts/${ct.id}`} className="font-semibold text-brand-700 hover:underline">{ct.contractNo}</Link></td>
                <td className="px-4 py-3 text-slate-700">{ct.customer?.brandName ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{ct.partyBCompany ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{ct.startDate ? formatDate(ct.startDate) : '—'} ~ {ct.endDate ? formatDate(ct.endDate) : '—'}</td>
                <td className="px-4 py-3 text-slate-700">{rule ? `${(rule.fixedFeeRate * 100).toFixed(2).replace(/\.00$/, '')}%` : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{rule ? <>低于 USD {rule.commissionThresholdAmount.toLocaleString()}：{(rule.commissionBelowRate * 100).toFixed(0)}%；达到或超过：{(rule.commissionAtOrAboveRate * 100).toFixed(0)}%</> : '—'}</td>
                <td className="px-4 py-3"><Badge className={CONTRACT_STATUS_COLORS[ct.status]}>{labelOf(CONTRACT_STATUS_LABELS, ct.status)}</Badge></td>
                <td className="px-4 py-3">{ct.fileUrl ? <a href={ct.fileUrl} download className="font-medium text-brand-700 hover:underline">下载原件</a> : <span className="text-slate-400">未上传</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              {['合同编号','合同开始时间','合同截止时间','负责人','状态','原件'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{contracts.map((ct) => <tr key={ct.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><Link href={`/contracts/${ct.id}`} className="font-semibold text-brand-700 hover:underline">{ct.contractNo}</Link></td>
              <td className="px-4 py-3 text-slate-700">{ct.startDate ? formatDate(ct.startDate) : '—'}</td>
              <td className="px-4 py-3 text-slate-700">{ct.endDate ? formatDate(ct.endDate) : '—'}</td>
              <td className="px-4 py-3 text-slate-700">{ct.owner?.name ?? '—'}</td>
              <td className="px-4 py-3"><Badge className={CONTRACT_STATUS_COLORS[ct.status]}>{labelOf(CONTRACT_STATUS_LABELS, ct.status)}</Badge></td>
              <td className="px-4 py-3">{ct.fileUrl ? <a href={ct.fileUrl} download className="font-medium text-brand-700 hover:underline">下载原件</a> : <span className="text-slate-400">未上传</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        共 {contracts.length} / {allContracts.length} 份合同
      </p>
    </div>
  );
}
