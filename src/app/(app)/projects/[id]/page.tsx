import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, Briefcase, Wrench, FileText, BarChart3, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { BackButton } from "@/components/BackButton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { ProjectHeaderActions } from "./ProjectHeaderActions";
import { ProjectTimeline } from "./ProjectTimeline";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/dashboard");
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.project.findUnique as any)({
    where: { id },
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
      entries: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!project || project.deletedAt) notFound();

  const brandName: string = project.customer?.brandName ?? "";

  // ── 数据维度：从推广 BI 拉取该客户品牌的销售数据 ──────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [allAgg, recentAgg] = brandName
    ? await Promise.all([
        prisma.salesRecord.aggregate({
          where: { brand: brandName },
          _sum: { revenue: true, commission: true, unitsSold: true },
          _count: true,
        }),
        prisma.salesRecord.aggregate({
          where: { brand: brandName, orderDate: { gte: thirtyDaysAgo } },
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
          <HeaderStat icon={<FileText className="h-4 w-4 shrink-0 text-slate-400" />} label="关联合同">
            {project.contract ? (
              <Link href={`/contracts/${project.contract.id}`} className="truncate text-sm font-medium text-brand-700 hover:underline">
                {project.contract.contractNo}
              </Link>
            ) : <span className="text-sm text-slate-400">—</span>}
          </HeaderStat>
        </div>
      </div>

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
