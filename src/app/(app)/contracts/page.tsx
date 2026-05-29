import Link from "next/link";
import { Download } from "lucide-react";
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
import { ContractFormModal } from "./ContractFormModal";
import { ScopeToggle } from "@/components/ScopeToggle";
import { isStaff } from "@/lib/dataScope";

export const metadata = { title: "合同管理 · Thraive联盟营销系统" };

function csv(sp: Record<string, string | undefined>, key: string): string[] {
  return (sp[key] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const statusFilter = csv(sp, "status");
  const typeFilter = csv(sp, "type");
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
      where: contractScope(sess, view) as any,
      orderBy: { createdAt: "desc" },
      include: { customer: true, owner: true, reviewer: true },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customer.findMany({
      where: customerScope(sess, view) as any,
      orderBy: { brandName: "asc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Client-side filtering for multi-select support
  const contracts = allContracts.filter((ct) => {
    if (statusFilter.length && !statusFilter.includes(ct.status)) return false;
    if (typeFilter.length && !typeFilter.includes(ct.type)) return false;
    if (customerFilter.length && !customerFilter.includes(ct.customerId)) return false;
    if (q) {
      const ql = q.toLowerCase();
      if (
        !ct.contractNo.toLowerCase().includes(ql) &&
        !ct.customer.brandName.toLowerCase().includes(ql)
      )
        return false;
    }
    return true;
  });

  const customerOptions = customers.map((c) => ({ id: c.id, brandName: c.brandName }));
  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  const statusOptions = Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  const typeOptions = Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
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
            <a
              href="/templates/contract-template.docx"
              download="平台联盟营销服务合同模板.docx"
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Download className="h-4 w-4" />
              下载合同模板
            </a>
            <ContractFormModal
              customers={customerOptions}
              users={userOptions}
              currentUserId={session.userId}
            />
          </div>
        }
      />

      <FilterBar>
        <SearchFilter placeholder="搜索合同编号 / 客户名称" />
        <MultiSelectFilter paramKey="status" placeholder="合同状态" options={statusOptions} />
        <MultiSelectFilter paramKey="type" placeholder="合同类型" options={typeOptions} />
        <MultiSelectFilter paramKey="customer" placeholder="关联客户" options={customerFilterOptions} />
      </FilterBar>

      {contracts.length === 0 ? (
        <EmptyState title="暂无合同" description="点击右上角新建合同" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">合同编号</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">关联客户</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">类型</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">负责人</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">审核人</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">固费</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">抽佣</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {contracts.map((ct) => (
                <tr key={ct.id} className="group hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contracts/${ct.id}`}
                      className="font-semibold text-brand-700 hover:text-brand-500 hover:underline"
                    >
                      {ct.contractNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${ct.customerId}`}
                      className="text-slate-700 hover:text-brand-600 hover:underline"
                    >
                      {ct.customer.brandName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {labelOf(CONTRACT_TYPE_LABELS, ct.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ct.owner?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ct.reviewer?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{ct.feeAmount ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{ct.commissionRate ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <Badge className={CONTRACT_STATUS_COLORS[ct.status]}>
                      {labelOf(CONTRACT_STATUS_LABELS, ct.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDate(ct.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        共 {contracts.length} / {allContracts.length} 份合同
      </p>
    </div>
  );
}
