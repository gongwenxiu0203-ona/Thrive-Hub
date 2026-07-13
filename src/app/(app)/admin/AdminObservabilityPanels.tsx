"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, ClipboardList, Database, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export type AdminOverview = {
  totalUsers: number;
  pendingUsers: number;
  auditCount: number;
  apiFailureCount: number;
};

export type DataQualityIssue = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: "warning" | "danger" | "neutral";
};

export type AuditLogRow = {
  id: string;
  actorName: string | null;
  action: string;
  module: string;
  targetLabel: string | null;
  summary: string;
  status: string;
  createdAt: string;
};

export type ApiAccessLogRow = {
  id: string;
  actorName: string | null;
  method: string;
  route: string;
  operation: string;
  statusCode: number;
  durationMs: number | null;
  outcome: string;
  errorSummary: string | null;
  createdAt: string;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function actionLabel(action: string) {
  return ({
    USER_CREATE: "创建用户",
    USER_UPDATE: "更新用户",
    USER_DELETE: "删除用户",
    ROLE_PERMISSION_UPDATE: "更新角色权限",
    USER_PERMISSION_UPDATE: "更新用户权限",
  } as Record<string, string>)[action] ?? action;
}

export function AdminOverviewPanel({ overview, issues, auditLogs, apiLogs }: {
  overview: AdminOverview;
  issues: DataQualityIssue[];
  auditLogs: AuditLogRow[];
  apiLogs: ApiAccessLogRow[];
}) {
  const totalIssues = issues.reduce((sum, issue) => sum + issue.count, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users className="h-4 w-4" />} label="系统用户" value={overview.totalUsers} hint={`${overview.pendingUsers} 位待审核`} />
        <Metric icon={<AlertTriangle className="h-4 w-4" />} label="数据待处理" value={totalIssues} hint="来自数据质量检查" tone="warning" />
        <Metric icon={<ClipboardList className="h-4 w-4" />} label="审计记录" value={overview.auditCount} hint="已纳入管理员操作" />
        <Metric icon={<Activity className="h-4 w-4" />} label="接口异常" value={overview.apiFailureCount} hint="近 7 天管理员接口" tone={overview.apiFailureCount ? "danger" : "success"} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">数据质量</h2>
              <p className="mt-1 text-xs text-slate-500">优先处理影响业务关联和核算的数据</p>
            </div>
            <span className="text-xs font-medium text-brand-700">共 {totalIssues} 项</span>
          </div>
          <div className="space-y-2">
            {issues.slice(0, 4).map((issue) => <QualityRow key={issue.key} issue={issue} compact />)}
          </div>
        </section>
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">最近管理操作</h2>
              <p className="mt-1 text-xs text-slate-500">用户、权限与系统管理变更</p>
            </div>
            <ClipboardList className="h-4 w-4 text-brand-600" />
          </div>
          {auditLogs.length ? (
            <div className="space-y-2">
              {auditLogs.slice(0, 4).map((log) => <AuditRow key={log.id} log={log} compact />)}
            </div>
          ) : <p className="py-6 text-center text-sm text-slate-400">暂无管理员操作记录</p>}
        </section>
      </div>
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">接口与访问状态</h2>
            <p className="mt-1 text-xs text-slate-500">只展示业务名称与脱敏诊断，不展示 Token、Cookie 或请求参数</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> 受控记录</span>
        </div>
        {apiLogs.length ? <ApiRows logs={apiLogs.slice(0, 4)} compact /> : <p className="py-4 text-center text-sm text-slate-400">暂无管理员接口访问记录</p>}
      </section>
    </div>
  );
}

export function DataQualityPanel({ issues }: { issues: DataQualityIssue[] }) {
  return <div className="card divide-y divide-[#f0ecf4]">{issues.map((issue) => <QualityRow key={issue.key} issue={issue} />)}</div>;
}

export function AuditLogPanel({ logs }: { logs: AuditLogRow[] }) {
  return logs.length ? <div className="card divide-y divide-[#f0ecf4]">{logs.map((log) => <AuditRow key={log.id} log={log} />)}</div> : <div className="card p-10 text-center text-sm text-slate-400">暂无审计日志。后续管理员操作会自动记录在这里。</div>;
}

export function ApiAccessPanel({ logs }: { logs: ApiAccessLogRow[] }) {
  return <section className="card overflow-hidden"><div className="border-b border-[#f0ecf4] px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">接口与访问记录</h2><p className="mt-1 text-xs text-slate-500">当前覆盖管理员用户管理接口；后续会逐步接入高风险业务操作。</p></div>{logs.length ? <ApiRows logs={logs} /> : <p className="p-10 text-center text-sm text-slate-400">暂无访问记录</p>}</section>;
}

function Metric({ icon, label, value, hint, tone = "brand" }: { icon: React.ReactNode; label: string; value: number; hint: string; tone?: "brand" | "warning" | "danger" | "success" }) {
  const tones = { brand: "bg-brand-50 text-brand-700", warning: "bg-amber-50 text-amber-700", danger: "bg-rose-50 text-rose-700", success: "bg-emerald-50 text-emerald-700" };
  return <div className="card p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></div><div className={`rounded-md p-2 ${tones[tone]}`}>{icon}</div></div></div>;
}

function QualityRow({ issue, compact = false }: { issue: DataQualityIssue; compact?: boolean }) {
  const tone = issue.tone === "danger" ? "bg-rose-50 text-rose-700" : issue.tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return <Link href={issue.href} className={`flex items-center gap-3 px-4 ${compact ? "rounded-md bg-[#faf8ff] py-2" : "py-3 hover:bg-brand-50/50"}`}><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tone}`}><Database className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-700">{issue.label}</p>{!compact && <p className="mt-0.5 text-xs text-slate-500">{issue.description}</p>}</div><span className="text-sm font-semibold tabular-nums text-slate-800">{issue.count}</span><ArrowRight className="h-4 w-4 text-slate-300" /></Link>;
}

function AuditRow({ log, compact = false }: { log: AuditLogRow; compact?: boolean }) {
  return <div className={`flex items-center gap-3 ${compact ? "rounded-md bg-[#faf8ff] px-3 py-2" : "px-4 py-3"}`}><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700"><ClipboardList className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{actionLabel(log.action)}{log.targetLabel ? ` · ${log.targetLabel}` : ""}</p><p className="mt-0.5 truncate text-xs text-slate-500">{log.summary}</p></div><div className="shrink-0 text-right"><p className="text-xs text-slate-500">{log.actorName ?? "系统"}</p><p className="mt-0.5 text-xs text-slate-400">{formatTime(log.createdAt)}</p></div></div>;
}

function ApiRows({ logs, compact = false }: { logs: ApiAccessLogRow[]; compact?: boolean }) {
  return <div className={compact ? "space-y-2" : "divide-y divide-[#f0ecf4]"}>{logs.map((log) => <div key={log.id} className={`flex items-center gap-3 ${compact ? "rounded-md bg-[#faf8ff] px-3 py-2" : "px-4 py-3"}`}><Badge className={log.outcome === "SUCCESS" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}>{log.statusCode}</Badge><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{log.operation}</p><p className="mt-0.5 truncate text-xs text-slate-500">{log.route}{log.errorSummary ? ` · ${log.errorSummary}` : ""}</p></div><div className="shrink-0 text-right text-xs text-slate-400"><p>{log.actorName ?? "系统"}</p><p className="mt-0.5">{log.durationMs ?? 0} ms · {formatTime(log.createdAt)}</p></div></div>)}</div>;
}
