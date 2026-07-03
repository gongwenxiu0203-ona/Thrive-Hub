import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, Briefcase, Wrench, FileText, BarChart3, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { projectScope } from "@/lib/dataScope";
import { BackButton } from "@/components/BackButton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { ProjectHeaderActions } from "./ProjectHeaderActions";
import { ProjectTimeline } from "./ProjectTimeline";
import { OneOffFlow } from "./OneOffFlow";
import { ProjectGmvTargetPanel, type CurrentTargetView } from "./ProjectGmvTargetPanel";
import { computeBiGmv, computeReconciliationGmv, completionRate, isAchieved, currentMonthKey } from "@/lib/projectKpi";
import type { Currency } from "@/lib/projectChannels";

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
          businessOwner: { select: { name: true } },
          backendOwner: { select: { name: true } },
        },
      },
      contract: { select: { id: true, contractNo: true } },
      createdBy: { select: { name: true } },
      owner: { select: { name: true } },
      entries: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!project) notFound();

  const isOneOff = project.type === "ONE_OFF";
  const brandName: string = project.customer?.brandName ?? "";

  // 单次合作所需：站内用户（提交对象）+ BI 父ASIN（结算选择）+ 提交对象名
  let users: { id: string; name: string }[] = [];
  let biParentAsins: string[] = [];
  let submittedToName: string | null = null;
  if (isOneOff) {
    users = await prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER", "LYNQ_STAFF"] } },
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

  // ── 数据维度：从推广 BI 拉取该客户品牌的销售数据 ──────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [allAgg, recentAgg] = brandName
    ? await Promise.all([
        prisma.salesRecord.aggregate({
          where: { brand: brandName, deletedAt: null },
          _sum: { revenue: true, commission: true, unitsSold: true },
          _count: true,
        }),
        prisma.salesRecord.aggregate({
          where: { brand: brandName, deletedAt: null, orderDate: { gte: thirtyDaysAgo } },
          _sum: { revenue: true, unitsSold: true },
        }),
      ])
    : [null, null];

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
      const rate = completionRate(currentTarget.monthlyTarget, reconciliationGmv);
      const ach = isAchieved(currentTarget.monthlyTarget, reconciliationGmv);
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
    gmvDefaultAmOwner = project.customer?.backendOwner ? (await prisma.customer.findUnique({
      where: { id: project.customerId ?? "" },
      select: { backendOwnerId: true },
    }))?.backendOwnerId ?? null : null;
    gmvAllUsers = await prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER", "LYNQ_STAFF"] } },
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
                {project.type === "INTEGRATED" ? "整合合作项目" : "单次合作项目"}
                <span className="ml-2">项目负责人：{project.owner?.name ?? project.createdBy?.name ?? "—"}</span>
              </p>
              <h1 className="mt-0.5 text-2xl font-bold text-white">{project.name}</h1>
            </div>
            <ProjectHeaderActions projectId={project.id} status={project.status} />
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
          <HeaderStat icon={<Wrench className="h-4 w-4 shrink-0 text-slate-400" />} label="后端负责人">
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
          {brandName && (
            <Link
              href={`/bi?brands=${encodeURIComponent(brandName)}`}
              className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <BarChart3 className="h-3.5 w-3.5" /> 查看完整 BI 数据 <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        {allAgg && (allAgg._count ?? 0) > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DataCard label="累计销售金额" value={formatCurrency(allAgg._sum.revenue ?? 0)} />
            <DataCard label="累计销售数量" value={formatNumber(allAgg._sum.unitsSold ?? 0)} />
            <DataCard label="累计联盟商佣金" value={formatCurrency(allAgg._sum.commission ?? 0)} />
            <DataCard
              label="近30天销售额"
              value={formatCurrency(recentAgg?._sum.revenue ?? 0)}
              sub={`${formatNumber(recentAgg?._sum.unitsSold ?? 0)} 单`}
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
