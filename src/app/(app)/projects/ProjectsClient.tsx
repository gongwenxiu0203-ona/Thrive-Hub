"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, FileText, X, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { createIntegratedProject, createOneOffProject } from "@/actions/projects";
import { formatDate, cn } from "@/lib/utils";

// 单次合作阶段标签
export const ONEOFF_STAGE_LABELS: Record<string, string> = {
  REQUIREMENT: "需求创建",
  SUBMITTED: "已提交",
  PRICE_CONFIRMED: "已确认价格",
  INFO_SUBMITTED: "已提交信息",
  DECIDED: "已确认合作",
  SETTLED: "已结算",
};
export const ONEOFF_STAGE_COLORS: Record<string, string> = {
  REQUIREMENT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-sky-100 text-sky-700",
  PRICE_CONFIRMED: "bg-amber-100 text-amber-700",
  INFO_SUBMITTED: "bg-indigo-100 text-indigo-700",
  DECIDED: "bg-violet-100 text-violet-700",
  SETTLED: "bg-emerald-100 text-emerald-700",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "进行中",
  PAUSED: "已暂停",
  DONE: "已完成",
  CANCELLED: "已终止",
};

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  DONE: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-rose-100 text-rose-600",
};

type ProjectRow = {
  id: string;
  type: string;
  name: string;
  status: string;
  stage?: string | null;
  customerName: string;
  businessOwner: string;
  backendOwner: string;
  contractNo: string;
  createdBy: string;
  entryCount: number;
  createdAt: string;
};

type ContractOption = { id: string; contractNo: string; brandName: string };
type CustomerOption = { id: string; brandName: string };

export default function ProjectsClient({
  projects,
  availableContracts,
  customers = [],
}: {
  projects: ProjectRow[];
  availableContracts: ContractOption[];
  customers?: CustomerOption[];
}) {
  const [tab, setTab] = useState<"INTEGRATED" | "ONE_OFF">("INTEGRATED");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateOneOff, setShowCreateOneOff] = useState(false);

  const shown = projects.filter((p) => p.type === tab);

  return (
    <div className="space-y-5">
      <PageHeader
        title="项目管理"
        description="整合合作：合同签署完成后创建项目跟进；单次合作：需求驱动的流程化合作"
        actions={
          tab === "INTEGRATED" ? (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 新建整合合作项目
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setShowCreateOneOff(true)}>
              <Plus className="h-4 w-4" /> 新建单次合作
            </button>
          )
        }
      />

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: "INTEGRATED", label: "整合合作" },
          { key: "ONE_OFF", label: "单次合作" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <FolderKanban className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {tab === "INTEGRATED" ? "暂无整合合作项目" : "暂无单次合作项目"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tab === "INTEGRATED"
              ? "合同签署完成后，点击右上角「新建整合合作项目」创建"
              : "需求创建 → 提交 → 确认价格 → 提交信息 → 确认合作 → 结算"}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">项目名称</th>
                <th className="px-4 py-2.5 text-left font-medium">{tab === "ONE_OFF" ? "流程阶段" : "状态"}</th>
                <th className="px-4 py-2.5 text-left font-medium">客户</th>
                {tab === "INTEGRATED" && <th className="px-4 py-2.5 text-left font-medium">商务负责人</th>}
                {tab === "INTEGRATED" && <th className="px-4 py-2.5 text-left font-medium">后端负责人</th>}
                {tab === "INTEGRATED" && <th className="px-4 py-2.5 text-left font-medium">关联合同</th>}
                <th className="px-4 py-2.5 text-left font-medium">进度条数</th>
                <th className="px-4 py-2.5 text-left font-medium">创建时间</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/projects/${p.id}`} className="hover:text-brand-600 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {tab === "ONE_OFF" ? (
                      <Badge className={`${ONEOFF_STAGE_COLORS[p.stage ?? ""] ?? "bg-slate-100 text-slate-600"} border-0`}>
                        {ONEOFF_STAGE_LABELS[p.stage ?? ""] ?? "需求创建"}
                      </Badge>
                    ) : (
                      <Badge className={`${PROJECT_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600"} border-0`}>
                        {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.customerName}</td>
                  {tab === "INTEGRATED" && <td className="px-4 py-3 text-slate-600">{p.businessOwner}</td>}
                  {tab === "INTEGRATED" && <td className="px-4 py-3 text-slate-600">{p.backendOwner}</td>}
                  {tab === "INTEGRATED" && (
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />{p.contractNo}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-600">{p.entryCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="text-slate-300 hover:text-brand-600">
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          contracts={availableContracts}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showCreateOneOff && (
        <CreateOneOffModal
          customers={customers}
          onClose={() => setShowCreateOneOff(false)}
        />
      )}
    </div>
  );
}

// ── 新建单次合作弹窗：需求创建 + 上传合作信息 ────────────────────────────────

function CreateOneOffModal({
  customers,
  onClose,
}: {
  customers: CustomerOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [demand, setDemand] = useState("");
  const [coopInfo, setCoopInfo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    if (!name.trim()) { setError("请填写项目名称"); return; }
    if (!demand.trim()) { setError("请填写需求描述"); return; }
    setError(null);
    startTransition(async () => {
      const result = await createOneOffProject({ name, customerId: customerId || undefined, demand, coopInfo });
      if (!result.ok) { setError(result.error ?? "创建失败"); return; }
      onClose();
      router.push(`/projects/${result.projectId}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">新建单次合作</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="label">项目名称 *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="如：XX 品牌春节单次推广" />
          </div>
          <div>
            <label className="label">关联客户（可选）</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">不关联</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.brandName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">需求描述 *</label>
            <textarea className="input min-h-[80px]" value={demand} onChange={(e) => setDemand(e.target.value)}
              placeholder="描述本次合作的需求…" />
          </div>
          <div>
            <label className="label">合作信息（可选）</label>
            <textarea className="input min-h-[60px]" value={coopInfo} onChange={(e) => setCoopInfo(e.target.value)}
              placeholder="补充合作背景、范围等信息…" />
          </div>
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{error}</div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSubmit} disabled={pending} className="btn-primary text-sm">
              {pending ? "创建中…" : "创建项目"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 新建整合合作项目弹窗：选择签署完成的合同 ─────────────────────────────────

function CreateProjectModal({
  contracts,
  onClose,
}: {
  contracts: ContractOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [contractId, setContractId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = contracts.find((c) => c.id === contractId);

  function onSubmit() {
    if (!contractId) { setError("请选择签署完成的合同"); return; }
    setError(null);
    startTransition(async () => {
      const result = await createIntegratedProject(contractId, name);
      if (!result.ok) { setError(result.error ?? "创建失败"); return; }
      onClose();
      router.push(`/projects/${result.projectId}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">新建整合合作项目</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="label">选择签署完成的合同 *</label>
            {contracts.length === 0 ? (
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
                暂无可用合同：仅「签署完成」且尚未创建过项目的合同可选
              </p>
            ) : (
              <select className="input" value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">请选择合同</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNo} · {c.brandName}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              创建后自动带出客户、商务负责人、后端负责人，并关联推广 BI 数据
            </p>
          </div>
          <div>
            <label className="label">项目名称（可选）</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selected ? `默认：${selected.brandName} 整合合作` : "默认使用客户品牌名"}
            />
          </div>
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{error}</div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSubmit} disabled={pending || contracts.length === 0} className="btn-primary text-sm">
              {pending ? "创建中…" : "创建项目"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
