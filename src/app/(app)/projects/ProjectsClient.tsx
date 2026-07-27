"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, FileText, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { createIntegratedProject, createOneOffProject } from "@/actions/projects";
import { formatDate, cn } from "@/lib/utils";
import {
  PROJECT_PROMO_PLATFORM_OPTIONS,
  PROJECT_TARGET_SITE_OPTIONS,
  ProjectMultiSelect,
  composeIntegratedProjectName,
} from "./ProjectMarketingFields";

// 单次合作阶段标签
export const ONEOFF_STAGE_LABELS: Record<string, string> = {
  REQUIREMENT: "需求创建",
  SUBMITTED: "已提交",
  PRICE_CONFIRMED: "已确认价格",
  INFO_SUBMITTED: "已提交信息",
  EMAIL_SENT: "已发邮件",
  DECIDED: "已确认合作",
  SETTLED: "已结算",
};
export const ONEOFF_STAGE_COLORS: Record<string, string> = {
  REQUIREMENT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-sky-100 text-sky-700",
  PRICE_CONFIRMED: "bg-amber-100 text-amber-700",
  INFO_SUBMITTED: "bg-indigo-100 text-indigo-700",
  EMAIL_SENT: "bg-cyan-100 text-cyan-700",
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
  ownerName: string;
  businessOwner: string;
  backendOwner: string;
  contractNo: string;
  createdBy: string;
  entryCount: number;
  createdAt: string;
};

type ContractOption = { id: string; contractNo: string; brandName: string; customerId: string };
type CustomerOption = { id: string; brandName: string; businessOwnerName?: string };
type UserOption = { id: string; name: string };

export default function ProjectsClient({
  projects,
  availableContracts,
  customers = [],
  users = [],
  currentUserId = "",
  canEdit = false,
}: {
  projects: ProjectRow[];
  availableContracts: ContractOption[];
  customers?: CustomerOption[];
  users?: UserOption[];
  currentUserId?: string;
  canEdit?: boolean;
}) {
  const [tab, setTab] = useState<"INTEGRATED" | "ONE_OFF">("INTEGRATED");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateOneOff, setShowCreateOneOff] = useState(false);

  const shown = projects.filter((p) => p.type === tab);

  return (
    <div className="space-y-5">
      <PageHeader
        title="项目管理"
        description="联盟营销：合同签署完成后创建项目跟进；单次合作：需求驱动的流程化合作"
        actions={canEdit ? (
          tab === "INTEGRATED" ? (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 新建联盟营销项目
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setShowCreateOneOff(true)}>
              <Plus className="h-4 w-4" /> 新建单次合作
            </button>
          )
        ) : undefined}
      />

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: "INTEGRATED", label: "联盟营销" },
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
            {tab === "INTEGRATED" ? "暂无联盟营销项目" : "暂无单次合作项目"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tab === "INTEGRATED"
              ? "合同签署完成后，点击右上角「新建联盟营销项目」创建"
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
                {tab === "INTEGRATED" && <th className="px-4 py-2.5 text-left font-medium">Strategy AM</th>}
                {tab === "INTEGRATED" && <th className="px-4 py-2.5 text-left font-medium">商务负责人</th>}
                {tab === "INTEGRATED" && <th className="px-4 py-2.5 text-left font-medium">售前方案负责人</th>}
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
                  {tab === "INTEGRATED" && <td className="px-4 py-3 text-slate-600">{p.ownerName}</td>}
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

      {canEdit && showCreate && (
        <CreateProjectModal
          contracts={availableContracts}
          customers={customers}
          users={users}
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
        />
      )}
      {canEdit && showCreateOneOff && (
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
    <Modal open onClose={onClose} title="新建单次合作">
      <div className="space-y-4">
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
    </Modal>
  );
}

// ── 新建整合合作项目弹窗：选客户 → 选合同 → 负责人 ───────────────────────────

function CreateProjectModal({
  contracts,
  customers,
  users,
  currentUserId,
  onClose,
}: {
  contracts: ContractOption[];
  customers: CustomerOption[];
  users: UserOption[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [promoPlatforms, setPromoPlatforms] = useState<string[]>([]);
  const [targetSites, setTargetSites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId);
  const defaultName = composeIntegratedProjectName(customer?.brandName ?? "", promoPlatforms, targetSites);
  const displayedName = nameTouched ? name : defaultName;
  // 该客户名下的合同
  const customerContracts = contracts.filter((c) => c.customerId === customerId);

  function onSubmit() {
    if (!customerId) { setError("请选择关联客户"); return; }
    setError(null);
    startTransition(async () => {
      const result = await createIntegratedProject({
        customerId,
        contractId: contractId || undefined,
        ownerId: ownerId || undefined,
        name: nameTouched ? name : "",
        promoPlatforms,
        targetSites,
      });
      if (!result.ok) { setError(result.error ?? "创建失败"); return; }
      onClose();
      router.push(`/projects/${result.projectId}`);
    });
  }

  return (
    <Modal open onClose={onClose} title="新建联盟营销项目">
      <div className="space-y-4">
          <div>
            <label className="label">关联客户 *</label>
            <select className="input" value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setContractId(""); }}>
              <option value="">请选择客户</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.brandName}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">一个客户可关联创建多个项目</p>
          </div>
          <div>
            <label className="label">关联合同（可选）</label>
            {!customerId ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400">请先选择客户</p>
            ) : customerContracts.length === 0 ? (
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
                该客户暂无可关联的合同
              </p>
            ) : (
              <select className="input" value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">不关联合同</option>
                {customerContracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.contractNo}</option>
                ))}
              </select>
            )}
            <p className="mt-1 text-[11px] text-slate-400">关联后合同状态变动会自动同步到项目时间流</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">商务负责人</label>
              <div className="input bg-slate-50 text-slate-600">{customer?.businessOwnerName ?? "（取客户负责人）"}</div>
              <p className="mt-1 text-[11px] text-slate-400">自动取该客户的商务负责人</p>
            </div>
            <div>
              <label className="label">Strategy AM</label>
              <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">未指定</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">默认创建人，可手动修改；项目 GMV 目标默认取此人</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProjectMultiSelect
              label="推广平台（可多选）"
              options={PROJECT_PROMO_PLATFORM_OPTIONS}
              value={promoPlatforms}
              onChange={setPromoPlatforms}
              placeholder="请选择推广平台"
            />
            <ProjectMultiSelect
              label="目标站点（可多选）"
              options={PROJECT_TARGET_SITE_OPTIONS}
              value={targetSites}
              onChange={setTargetSites}
              placeholder="请选择目标站点"
            />
          </div>
          <div>
            <label className="label">项目名称</label>
            <input
              className="input"
              value={displayedName}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              placeholder="选择客户、推广平台和目标站点后自动生成"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              默认按“关联客户 · 推广平台 · 目标站点”生成，也可以手动修改
            </p>
          </div>
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{error}</div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSubmit} disabled={pending || !customerId} className="btn-primary text-sm">
              {pending ? "创建中…" : "创建项目"}
            </button>
          </div>
      </div>
    </Modal>
  );
}
