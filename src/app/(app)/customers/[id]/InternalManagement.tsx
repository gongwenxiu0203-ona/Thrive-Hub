"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Briefcase, Wrench, CalendarClock, FileText, Users, ArrowRight, TrendingUp, Wallet, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  setBusinessOwner,
  setBackendOwner,
  updateCustomerStatus,
  setChannelUser,
} from "@/actions/customers";
import { ContractFormModal } from "../../contracts/ContractFormModal";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_CATEGORY_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate, toInputDate } from "@/lib/utils";

type Option = { id: string; name: string };
type TaskLite = {
  id: string;
  title: string;
  status: string;
  category: string;
  dueDate: string | null;
};
type ContractLite = {
  id: string;
  contractNo: string;
  type: string;
  status: string;
};

type ChannelRecSummary = {
  totalPeriods: number | null;
  periodType: string | null;
  fixedFeeTotal: number | null;
  commissionTotal: number | null;
  paidPeriodsFixed: number;
  paidPeriodsCommission: number;
  paidFixed: number;
  paidCommission: number;
};

export function InternalManagement({
  customerId,
  customerName,
  status,
  businessOwnerId,
  backendOwnerId,
  demoDueDate,
  channelUserId,
  users,
  contracts,
  businessTasks,
  backendTasks,
  channelRec,
}: {
  customerId: string;
  customerName: string;
  status: string;
  businessOwnerId: string | null;
  backendOwnerId: string | null;
  demoDueDate?: string | null;
  channelUserId: string | null;
  users: Option[];
  contracts: ContractLite[];
  businessTasks: TaskLite[];
  backendTasks: TaskLite[];
  channelRec?: ChannelRecSummary | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 默认显示创建时已保存的 Demo 截止日期（即使后端负责人空着）
  const [demoDue, setDemoDue] = useState(demoDueDate ?? "");

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 h-full">
      {/* ── 1. 当前客户进度 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100">
            <TrendingUp className="h-3.5 w-3.5 text-brand-600" />
          </div>
          <p className="text-xs font-semibold text-slate-600">当前客户进度</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input flex-1"
            value={status}
            disabled={pending}
            onChange={(e) => run(() => updateCustomerStatus(customerId, e.target.value))}
          >
            {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Badge className={`${CUSTOMER_STATUS_COLORS[status]} shrink-0`}>
            {labelOf(CUSTOMER_STATUS_LABELS, status)}
          </Badge>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">进度也可随任务与合同状态自动推进</p>
      </div>

      {/* ── 2. 渠道商 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100">
            <Users className="h-3.5 w-3.5 text-teal-600" />
          </div>
          <p className="text-xs font-semibold text-slate-600">渠道商</p>
        </div>
        <select
          className="input"
          value={channelUserId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setChannelUser(customerId, e.target.value))}
        >
          <option value="">— 未分配 —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-slate-400">渠道商关联后可在客户管理中查看此客户</p>

        {/* 渠道商分账汇总 */}
        {channelRec && (
          <div className="mt-3 rounded-lg bg-teal-50 p-3">
            <div className="mb-2 flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-teal-600" />
              <p className="text-[11px] font-semibold text-teal-700">分账汇总</p>
              <Link href="/finance?tab=channels" className="ml-auto text-[10px] text-teal-500 hover:underline">
                查看详情 →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SummaryItem label="固费分账总额" value={channelRec.fixedFeeTotal != null ? `¥${channelRec.fixedFeeTotal.toLocaleString()}` : "—"} />
              <SummaryItem label="佣金分账总额" value={channelRec.commissionTotal != null ? `¥${channelRec.commissionTotal.toLocaleString()}` : "—"} />
              <SummaryItem label="分账总期数" value={channelRec.totalPeriods != null ? `${channelRec.totalPeriods} 期（${channelRec.periodType === "quarterly" ? "季度" : "月度"}）` : "—"} />
              <SummaryItem
                label="固费剩余待分账"
                value={channelRec.fixedFeeTotal != null
                  ? `¥${(channelRec.fixedFeeTotal - channelRec.paidFixed).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                  : "—"}
                highlight={channelRec.fixedFeeTotal != null && channelRec.paidFixed < channelRec.fixedFeeTotal}
              />
              <SummaryItem
                label="佣金剩余待分账"
                value={channelRec.commissionTotal != null
                  ? `¥${(channelRec.commissionTotal - channelRec.paidCommission).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                  : "—"}
                highlight={channelRec.commissionTotal != null && channelRec.paidCommission < channelRec.commissionTotal}
              />
              <SummaryItem
                label="剩余分账期数"
                value={channelRec.totalPeriods != null
                  ? `${Math.max(0, channelRec.totalPeriods - Math.max(channelRec.paidPeriodsFixed, channelRec.paidPeriodsCommission))} 期`
                  : "—"}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. 商务负责人 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
            <Briefcase className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <p className="text-sm font-semibold text-slate-700">商务负责人</p>
        </div>
        <select
          className="input"
          value={businessOwnerId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setBusinessOwner(customerId, e.target.value))}
        >
          <option value="">— 未分配 —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        {/* 关联合同 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">关联合同</p>
            <Link
              href={`/contracts/new?customerId=${customerId}`}
              className="btn-primary btn-sm flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> 新增合同
            </Link>
          </div>
          {contracts.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
              {businessOwnerId ? "暂无合同，点击「提交合同」创建" : "选择商务负责人后可创建关联合同"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {contracts.map((ct) => (
                <Link
                  key={ct.id}
                  href={`/contracts/${ct.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs hover:bg-white hover:border-slate-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium text-brand-700">
                    <FileText className="h-3 w-3" />{ct.contractNo}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge className={`${CONTRACT_STATUS_COLORS[ct.status]} text-[10px]`}>
                      {labelOf(CONTRACT_STATUS_LABELS, ct.status)}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <TaskList tasks={businessTasks} emptyHint="分配商务负责人后，相关任务将在此处显示" />
      </div>

      {/* ── 4. 后端负责人 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
            <Wrench className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <p className="text-sm font-semibold text-slate-700">后端负责人</p>
        </div>
        <div>
          <label className="label text-xs">Demo 方案任务截止日期</label>
          <input
            type="date"
            className="input"
            value={demoDue}
            min={toInputDate(new Date())}
            onChange={(e) => {
              const v = e.target.value;
              setDemoDue(v);
              // 若后端负责人已选，则同步保存到客户记录与 Demo 任务（独立于选人顺序）
              if (backendOwnerId) {
                run(() => setBackendOwner(customerId, backendOwnerId, v));
              }
            }}
          />
          <p className="mt-1 text-[10px] text-slate-400">截止日期与后端负责人可独立选择，无先后顺序。</p>
        </div>
        <select
          className="input"
          value={backendOwnerId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setBackendOwner(customerId, e.target.value, demoDue))}
        >
          <option value="">— 未分配 —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <TaskList tasks={backendTasks} emptyHint="分配后端负责人后，将自动创建「Demo 方案制定」任务" />
      </div>
    </div>
  );
}

function SummaryItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-xs font-semibold ${highlight ? "text-amber-600" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}

function TaskList({ tasks, emptyHint }: { tasks: TaskLite[]; emptyHint: string }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">{emptyHint}</p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500">相关任务</p>
      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link
              href={`/tasks?focus=${t.id}`}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-white hover:border-slate-200 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{t.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{labelOf(TASK_CATEGORY_LABELS, t.category)}</span>
                  {t.dueDate && (
                    <span className="flex items-center gap-0.5">
                      <CalendarClock className="h-2.5 w-2.5" />
                      {formatDate(t.dueDate)}
                    </span>
                  )}
                </div>
              </div>
              <Badge className={`${TASK_STATUS_COLORS[t.status]} ml-2 shrink-0 text-[10px]`}>
                {labelOf(TASK_STATUS_LABELS, t.status)}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
