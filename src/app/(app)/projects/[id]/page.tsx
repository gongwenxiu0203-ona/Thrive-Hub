import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, Briefcase, Wrench, FileText, BarChart3, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { projectScope } from "@/lib/dataScope";
import { BackButton } from "@/components/BackButton";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { ProjectHeaderActions } from "./ProjectHeaderActions";
import { ProjectTimeline } from "./ProjectTimeline";
import { OneOffFlow } from "./OneOffFlow";
import { ProjectGmvTargetPanel, type CurrentTargetView } from "./ProjectGmvTargetPanel";
import {
  computeBiGmv,
  computeReconciliationGmv,
  completionRate,
  effectiveKpiActual,
  isAchieved,
  currentMonthKey,
  monthRange,
} from "@/lib/projectKpi";
import type { Currency } from "@/lib/projectChannels";
import { COMMISSION_TYPE_LABELS, CONTRACT_STATUS_COLORS, CONTRACT_STATUS_LABELS, labelOf } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  const targetMonth = sp.targetMonth || currentMonthKey();

  // 行级权限：ADMIN 看全部；USER 仅 owner / 创建人 / 客户负责人匹配项目
  const sessForScope = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  const scope = session.role === "ADMIN" ? {} : projectScope(sessForScope, "mine");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.project.findFirst as any)({
    where: { id, deletedAt: null, ...scope },
    include: {
      customer: {
        select: {
          id: true,
          brandName: true,
          backendOwnerId: true,
          businessOwner: { select: { name: true } },
          backendOwner: { select: { name: true } },
        },
      },
      contract: {
        select: {
          id: true,
          contractNo: true,
          type: true,
          status: true,
          partyA: true,
          startDate: true,
          endDate: true,
          feeAmount: true,
          feeCurrency: true,
          feeCycle: true,
          commissionType: true,
          commissionRate: true,
          thresholdAmount: true,
          thresholdCurrency: true,
          tieredRules: true,
          excessBaseMonths: true,
          excessCommissionRate: true,
          gmvSettlementCycle: true,
          specialCommissionTerms: true,
          promoPlatform: true,
          targetSite: true,
          coopChannels: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      entries: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!project) notFound();

  const isOneOff = project.type === "ONE_OFF";
  const brandName: string = project.customer?.brandName ?? "";

  const [editCustomers, editContracts, editUsers] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true, brandName: true },
      orderBy: { brandName: "asc" },
    }),
    prisma.contract.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: "COMPLETED" },
          project.contractId ? { id: project.contractId } : { id: "__NO_CONTRACT__" },
        ],
      },
      select: { id: true, contractNo: true, customerId: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // 单次合作所需：站内用户（提交对象）+ BI 父ASIN（结算选择）+ 提交对象名
  let users: { id: string; name: string }[] = [];
  let biParentAsins: string[] = [];
  let submittedToName: string | null = null;
  if (isOneOff) {
    users = await prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (project.submittedToId) {
      submittedToName = users.find((u) => u.id === project.submittedToId)?.name ?? null;
    }
    if (brandName) {
      const asinRows = await prisma.salesRecord.findMany({
        where: { brand: brandName, deletedAt: null, parentAsin: { not: null } },
        select: { parentAsin: true },
        distinct: ["parentAsin"],
        take: 200,
      });
      biParentAsins = asinRows.map((r) => r.parentAsin!).filter(Boolean);
    }
  }

  // ── 数据维度：从推广 BI 拉取该客户品牌的所选月份销售数据 ───────────────────────
  const { start: monthStart, endExclusive: monthEnd } = monthRange(targetMonth);
  const monthAgg = brandName
    ? await prisma.salesRecord.aggregate({
        where: {
          brand: brandName,
          deletedAt: null,
          orderDate: { gte: monthStart, lt: monthEnd },
        },
        _sum: { revenue: true, commission: true, unitsSold: true },
        _count: true,
      })
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (project.entries as any[]).map((e) => ({
    id: e.id,
    kind: e.kind,
    content: e.content,
    authorName: e.author?.name ?? "系统",
    fromWorkLog: !!e.fromWorkLogId,
    createdAt: e.createdAt.toISOString(),
  }));

  // ── 项目 GMV 目标（仅 INTEGRATED）─────────────────────────────────────────────
  let gmvCurrent: CurrentTargetView | null = null;
  let gmvMonthOptions: string[] = [targetMonth];
  let gmvDefaultAmOwner: string | null = null;
  let gmvAllUsers: { id: string; name: string }[] = [];
  if (!isOneOff) {
    // 拉本项目所有 month + 当前 month 的目标
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTargets = await (prisma as any).projectGmvTarget.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { month: "desc" },
      include: {
        amOwner: { select: { id: true, name: true } },
        channelTargets: {
          orderBy: { sortOrder: "asc" },
          include: { owner: { select: { id: true, name: true } } },
        },
      },
    });
    gmvMonthOptions = Array.from(
      new Set<string>([targetMonth, ...allTargets.map((t: { month: string }) => t.month)]),
    ).sort((a, b) => (a < b ? 1 : -1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentTarget = allTargets.find((t: any) => t.month === targetMonth) ?? null;
    if (currentTarget) {
      const [biGmv, reconciliationGmv] = await Promise.all([
        computeBiGmv(brandName, targetMonth),
        computeReconciliationGmv(project.customerId, targetMonth),
      ]);
      const actual = effectiveKpiActual(biGmv, reconciliationGmv);
      const rate = completionRate(currentTarget.monthlyTarget, actual.actualGmv);
      const ach = isAchieved(currentTarget.monthlyTarget, actual.actualGmv);
      gmvCurrent = {
        targetId: currentTarget.id,
        month: currentTarget.month,
        amOwnerId: currentTarget.amOwnerId,
        amOwnerName: currentTarget.amOwner?.name ?? "—",
        currency: currentTarget.currency as Currency,
        monthlyTarget: currentTarget.monthlyTarget,
        thresholdAt80: currentTarget.monthlyTarget * 0.8,
        biGmv,
        reconciliationGmv,
        actualGmv: actual.actualGmv,
        actualSource: actual.actualSource,
        reconciliationCompleted: actual.reconciliationCompleted,
        completionRatePct: rate == null ? null : rate * 100,
        achieved: ach,
        remark: currentTarget.remark,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channels: currentTarget.channelTargets.map((c: any) => ({
          id: c.id,
          channelName: c.channelName,
          ownerId: c.ownerId,
          ownerName: c.owner?.name ?? "—",
          role: c.role,
          currency: c.currency,
          sharePercent: c.sharePercent,
          channelGmv: currentTarget.monthlyTarget * (c.sharePercent || 0) / 100,
        })),
      };
    }
    gmvDefaultAmOwner = project.owner?.id ?? project.customer?.backendOwnerId ?? null;
    gmvAllUsers = await prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  return (
    <div className="space-y-6">
      <BackButton label="返回项目列表" fallbackHref="/projects" />

      {/* ── 项目头部：客户/负责人自动带出 ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-white/70">
                {project.type === "INTEGRATED" ? "联盟营销项目" : "单次合作项目"}
                <span className="ml-2">Strategy AM：{project.owner?.name ?? project.createdBy?.name ?? "—"}</span>
              </p>
              <h1 className="mt-0.5 text-2xl font-bold text-white">{project.name}</h1>
            </div>
            <ProjectHeaderActions
              projectId={project.id}
              status={project.status}
              type={project.type}
              name={project.name}
              customerId={project.customerId ?? null}
              contractId={project.contractId ?? null}
              ownerId={project.owner?.id ?? null}
              customers={editCustomers}
              contracts={editContracts}
              users={editUsers}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 sm:grid-cols-4">
          <HeaderStat icon={<Building2 className="h-4 w-4 shrink-0 text-slate-400" />} label="客户">
            {project.customer ? (
              <Link href={`/customers/${project.customer.id}`} className="truncate text-sm font-medium text-brand-700 hover:underline">
                {brandName}
              </Link>
            ) : <span className="text-sm text-slate-400">—</span>}
          </HeaderStat>
          <HeaderStat icon={<Briefcase className="h-4 w-4 shrink-0 text-slate-400" />} label="商务负责人">
            <p className="truncate text-sm font-medium text-slate-800">{project.customer?.businessOwner?.name ?? "未分配"}</p>
          </HeaderStat>
          <HeaderStat icon={<Wrench className="h-4 w-4 shrink-0 text-slate-400" />} label="售前方案负责人">
            <p className="truncate text-sm font-medium text-slate-800">{project.customer?.backendOwner?.name ?? "未分配"}</p>
          </HeaderStat>
          <HeaderStat icon={<FileText className="h-4 w-4 shrink-0 text-slate-400" />} label={isOneOff ? "创建人" : "关联合同"}>
            {isOneOff ? (
              <p className="truncate text-sm font-medium text-slate-800">{project.createdBy?.name ?? "—"}</p>
            ) : project.contract ? (
              <Link href={`/contracts/${project.contract.id}`} className="truncate text-sm font-medium text-brand-700 hover:underline">
                {project.contract.contractNo}
              </Link>
            ) : <span className="text-sm text-slate-400">—</span>}
          </HeaderStat>
        </div>
      </div>

      {/* ── 单次合作：需求 + 流程 ── */}
      {isOneOff && (
        <>
          {(project.demand || project.coopInfo) && (
            <div className="card p-4">
              {project.demand && (
                <>
                  <p className="text-[11px] font-medium text-slate-400">需求描述</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{project.demand}</p>
                </>
              )}
              {project.coopInfo && (() => {
                // coopInfo 可能是 JSON 表格（推广基本信息）或纯文本
                let table: { headers?: string[]; rows?: string[][] } | null = null;
                try {
                  const parsed = JSON.parse(project.coopInfo);
                  if (parsed && Array.isArray(parsed.headers)) table = parsed;
                } catch { /* 纯文本 */ }
                if (table && table.headers && table.headers.length) {
                  return (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium text-slate-400">推广基本信息</p>
                      <div className="mt-1 overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                            {table.headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {(table.rows ?? []).map((r, i) => (
                              <tr key={i} className="border-b border-slate-50 last:border-0">
                                {table!.headers!.map((_, j) => <td key={j} className="px-2 py-1.5 text-xs text-slate-600">{r[j] ?? ""}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium text-slate-400">合作信息</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{project.coopInfo}</p>
                  </div>
                );
              })()}
            </div>
          )}
          <OneOffFlow
            projectId={project.id}
            stage={project.stage ?? "REQUIREMENT"}
            price={project.price ?? null}
            coopResult={project.coopResult ?? null}
            submissionData={project.submissionData ?? null}
            settlementData={project.settlementData ?? null}
            submittedToName={submittedToName}
            users={users}
            biParentAsins={biParentAsins}
          />
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-700 text-xs font-bold text-white">流</div>
              <h2 className="text-sm font-bold text-slate-700">流程时间流</h2>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <ProjectTimeline projectId={project.id} entries={entries} />
          </div>
        </>
      )}

      {!isOneOff && (
      <>
      {/* INTEGRATED 内容 */}

      {project.contract && (
        <LinkedContractSummary
          contract={project.contract}
          customerId={project.customer?.id ?? null}
        />
      )}

      {/* ── 项目 GMV 目标（员工 KPI 第一期）── */}
      <ProjectGmvTargetPanel
        projectId={project.id}
        projectType={project.type}
        current={gmvCurrent}
        monthOptions={gmvMonthOptions}
        selectedMonth={targetMonth}
        defaultAmOwnerId={gmvDefaultAmOwner}
        users={gmvAllUsers}
        canEdit={isStaff(session.role)}
      />

      {/* ── ① 数据维度：推广 BI 数据 ── */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700">①</div>
          <h2 className="text-sm font-bold text-slate-700">数据维度（推广 BI）</h2>
          <span className="h-px flex-1 bg-slate-200" />
          <form className="flex items-center gap-2" action={`/projects/${project.id}`}>
            <input
              type="month"
              name="targetMonth"
              defaultValue={targetMonth}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
            />
            <button type="submit" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              切换
            </button>
          </form>
          {brandName && (
            <Link
              href={`/bi?brands=${encodeURIComponent(brandName)}`}
              className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <BarChart3 className="h-3.5 w-3.5" /> 查看完整 BI 数据 <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        {monthAgg && (monthAgg._count ?? 0) > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DataCard label={`${targetMonth} 销售金额`} value={formatCurrency(monthAgg._sum.revenue ?? 0)} />
            <DataCard label={`${targetMonth} 销售数量`} value={formatNumber(monthAgg._sum.unitsSold ?? 0)} />
            <DataCard label={`${targetMonth} 联盟商佣金`} value={formatCurrency(monthAgg._sum.commission ?? 0)} />
            <DataCard
              label="BI 记录数"
              value={formatNumber(monthAgg._count ?? 0)}
              sub="按订单日期归入当前月份"
              highlight
            />
          </div>
        ) : (
          <div className="card px-4 py-6 text-center text-sm text-slate-400">
            暂无该客户品牌的推广销售数据（数据上传后自动按品牌「{brandName || "—"}」关联）
          </div>
        )}
      </div>

      {/* ── ② 日常工作：时间瀑布流 ── */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-700 text-xs font-bold text-white">②</div>
          <h2 className="text-sm font-bold text-slate-700">日常工作（时间流）</h2>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <ProjectTimeline projectId={project.id} entries={entries} />
      </div>
      </>
      )}
    </div>
  );
}

function HeaderStat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400">{label}</p>
        {children}
      </div>
    </div>
  );
}

function DataCard({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-brand-200 bg-brand-50/50" : "border-slate-200 bg-white"}`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? "text-brand-700" : "text-slate-800"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function LinkedContractSummary({
  contract,
  customerId,
}: {
  contract: Record<string, unknown>;
  customerId: string | null;
}) {
  const cooperationFields = [
    { label: "合作期限", value: formatPeriod(contract.startDate, contract.endDate) },
    { label: "服务费", value: formatFee(contract.feeAmount, contract.feeCurrency, contract.feeCycle) },
    { label: "佣金机制", value: labelOf(COMMISSION_TYPE_LABELS, contract.commissionType as string | null | undefined) },
    { label: "抽佣比例", value: contract.commissionRate },
    { label: "GMV 结算周期", value: contract.gmvSettlementCycle },
  ];
  const promotionFields = [
    { label: "推广平台", value: contract.promoPlatform },
    { label: "目标站点", value: contract.targetSite },
  ];
  const status = contract.status as string | null | undefined;
  const statusLabel = labelOf(CONTRACT_STATUS_LABELS, status);
  const statusClass = status ? CONTRACT_STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-500";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">关联合同信息</h2>
          <p className="mt-0.5 text-xs text-slate-400">合作信息与推广信息摘要</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
          <Link
            href={`/contracts/${contract.id}`}
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            查看合同 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ContractFieldGroup title="合作信息" fields={cooperationFields} />
        <PromotionFieldGroup
          fields={promotionFields}
          coopChannels={formatCoopChannels(contract.coopChannels)}
          customerId={customerId}
        />
      </div>
    </section>
  );
}

function ContractFieldGroup({
  title,
  fields,
}: {
  title: string;
  fields: { label: string; value: unknown }[];
}) {
  const visibleFields = fields.filter((field) => displayValue(field.value) !== "—");
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">{title}</p>
      {visibleFields.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">暂无字段信息</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {visibleFields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] text-slate-400">{field.label}</dt>
              <dd className="mt-0.5 text-xs font-medium text-slate-700" title={displayValue(field.value)}>
                {displayValue(field.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function PromotionFieldGroup({
  fields,
  coopChannels,
  customerId,
}: {
  fields: { label: string; value: unknown }[];
  coopChannels: string;
  customerId: string | null;
}) {
  const visibleFields = fields.filter((field) => displayValue(field.value) !== "—");
  const hasChannels = coopChannels !== "—";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">推广信息</p>
      {!visibleFields.length && !hasChannels ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">暂无字段信息</p>
      ) : (
        <dl className="space-y-2">
          {visibleFields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] text-slate-400">{field.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-xs font-medium text-slate-700">
                {displayValue(field.value)}
              </dd>
            </div>
          ))}
          {hasChannels && (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10px] text-slate-400">合作渠道</dt>
                {customerId && (
                  <Link
                    href={`/customers/${customerId}#authorization-info`}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"
                  >
                    账号授权 <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                )}
              </div>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-xs font-medium text-slate-700">
                {coopChannels}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function displayValue(value: unknown): string {
  if (value == null) return "—";
  if (value instanceof Date) return formatDate(value);
  const text = String(value).trim();
  return text || "—";
}

function formatPeriod(start: unknown, end: unknown): string {
  const s = displayValue(start);
  const e = displayValue(end);
  if (s === "—" && e === "—") return "—";
  return `${s} ~ ${e}`;
}

function formatFee(amount: unknown, currency: unknown, cycle: unknown): string {
  const a = displayValue(amount);
  if (a === "—") return "—";
  const parts = [displayValue(currency), a, displayValue(cycle)].filter((v) => v !== "—");
  return parts.join(" / ");
}

function formatCoopChannels(value: unknown): string {
  const raw = displayValue(value);
  if (raw === "—") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).join(" / ") || "—";
    }
  } catch {
    return raw;
  }
  return raw;
}
