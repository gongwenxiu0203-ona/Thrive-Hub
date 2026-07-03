import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  purgeExpired,
  daysRemaining,
  RECYCLE_TYPE_LABELS,
  type RecycleType,
} from "@/lib/recycleBin";
import { RecycleItemRow } from "./RecycleItemRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "回收站 · Thraive联盟营销系统" };

type Item = {
  type: RecycleType;
  id: string;
  title: string;
  subtitle: string;
  deletedAt: string;
  daysLeft: number;
};

export default async function RecycleBinPage() {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/dashboard");
  const isAdmin = session.role === "ADMIN";

  // 访问时惰性物理清理超过 7 天的记录
  await purgeExpired();

  const sel = { deletedAt: { not: null } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (m: any, args: any) => m.findMany({ ...args, where: sel, orderBy: { deletedAt: "desc" } });

  const [customers, contracts, affiliates, tasks, reminders, batches, salesRecords, projects, workLogs] = await Promise.all([
    q(prisma.customer, { select: { id: true, brandName: true, category: true, deletedAt: true } }),
    q(prisma.contract, { select: { id: true, contractNo: true, partyA: true, deletedAt: true } }),
    q(prisma.affiliate, { select: { id: true, platformAffiliateName: true, source: true, deletedAt: true } }),
    q(prisma.task, { select: { id: true, title: true, category: true, deletedAt: true } }),
    q(prisma.reminder, { select: { id: true, title: true, type: true, deletedAt: true } }),
    q(prisma.salesBatch, { select: { id: true, fileName: true, recordCount: true, deletedAt: true } }),
    q(prisma.salesRecord, { select: { id: true, brand: true, affiliateName: true, orderDate: true, revenue: true, deletedAt: true } }),
    q(prisma.project, { select: { id: true, name: true, type: true, deletedAt: true } }),
    q(prisma.workLog, { select: { id: true, content: true, period: true, deletedAt: true, author: { select: { name: true } } } }),
  ]);

  const items: Item[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...customers.map((c: any) => ({ type: "customer" as const, id: c.id, title: c.brandName, subtitle: c.category ?? "", deletedAt: c.deletedAt, daysLeft: daysRemaining(c.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...contracts.map((c: any) => ({ type: "contract" as const, id: c.id, title: c.contractNo, subtitle: c.partyA ?? "", deletedAt: c.deletedAt, daysLeft: daysRemaining(c.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...affiliates.map((a: any) => ({ type: "affiliate" as const, id: a.id, title: a.platformAffiliateName, subtitle: a.source ?? "", deletedAt: a.deletedAt, daysLeft: daysRemaining(a.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...tasks.map((t: any) => ({ type: "task" as const, id: t.id, title: t.title, subtitle: t.category ?? "", deletedAt: t.deletedAt, daysLeft: daysRemaining(t.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...reminders.map((r: any) => ({ type: "reminder" as const, id: r.id, title: r.title, subtitle: r.type ?? "", deletedAt: r.deletedAt, daysLeft: daysRemaining(r.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...batches.map((b: any) => ({ type: "salesBatch" as const, id: b.id, title: b.fileName, subtitle: `${b.recordCount} 条记录`, deletedAt: b.deletedAt, daysLeft: daysRemaining(b.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...salesRecords.map((r: any) => ({ type: "salesRecord" as const, id: r.id, title: `${r.brand} · ${r.affiliateName}`, subtitle: `${new Date(r.orderDate).toISOString().slice(0, 10)} · ${Number(r.revenue || 0).toLocaleString()}`, deletedAt: r.deletedAt, daysLeft: daysRemaining(r.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...projects.map((p: any) => ({ type: "project" as const, id: p.id, title: p.name, subtitle: p.type === "INTEGRATED" ? "整合合作" : "单次合作", deletedAt: p.deletedAt, daysLeft: daysRemaining(p.deletedAt) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...workLogs.map((w: any) => ({ type: "workLog" as const, id: w.id, title: `${w.author?.name ?? "—"} 的${w.period === "MONTHLY" ? "月报" : "周报"}`, subtitle: String(w.content ?? "").slice(0, 40), deletedAt: w.deletedAt, daysLeft: daysRemaining(w.deletedAt) })),
  ];

  // 按类型分组
  const groups = (["customer", "contract", "affiliate", "task", "reminder", "salesBatch", "salesRecord", "project", "workLog"] as RecycleType[])
    .map((type) => ({ type, items: items.filter((i) => i.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="回收站"
        description="已删除的项目在此保留 7 天，到期自动永久清除。可随时恢复。"
      />

      {groups.length === 0 ? (
        <EmptyState title="回收站为空" description="删除的客户、合同、联盟商、任务、提醒、推广批次会出现在这里" />
      ) : (
        groups.map((g) => (
          <section key={g.type} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-700">{RECYCLE_TYPE_LABELS[g.type]}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{g.items.length}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {g.items.map((item) => (
                <RecycleItemRow
                  key={`${item.type}-${item.id}`}
                  type={item.type}
                  id={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  daysLeft={item.daysLeft}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
