"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, FileText, ArrowRight, Database, Settings2, Tags, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  createIntegratedProject,
  createOneOffProject,
} from "@/actions/projects";
import { formatDate, cn } from "@/lib/utils";
import {
  PROJECT_PROMO_PLATFORM_OPTIONS,
  PROJECT_TARGET_SITE_OPTIONS,
  ProjectMultiSelect,
  composeIntegratedProjectName,
} from "./ProjectMarketingFields";
import SalesProgressDashboard from "./SalesProgressDashboard";

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

type ContractOption = {
  id: string;
  contractNo: string;
  brandName: string;
  customerId: string;
};
type CustomerOption = {
  id: string;
  brandName: string;
  businessOwnerName?: string;
};
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
  const [tab, setTab] = useState<"PROGRESS" | "DISCOUNTS" | "INTEGRATED" | "ONE_OFF">("PROGRESS");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateOneOff, setShowCreateOneOff] = useState(false);

  const shown = projects.filter((p) => p.type === tab);

  return (
    <div className="space-y-5">
      <PageHeader
        title="项目管理"
        description="联盟营销：合同签署完成后创建项目跟进；单次合作：需求驱动的流程化合作"
        actions={
          canEdit && (tab === "INTEGRATED" || tab === "ONE_OFF") ? (
            tab === "INTEGRATED" ? (
              <button
                className="btn-primary"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4" /> 新建联盟营销项目
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => setShowCreateOneOff(true)}
              >
                <Plus className="h-4 w-4" /> 新建单次合作
              </button>
            )
          ) : undefined
        }
      />

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
          { key: "PROGRESS", label: "项目进度跟踪" },
            { key: "DISCOUNTS", label: "折扣管理" },
            { key: "INTEGRATED", label: "联盟营销" },
            { key: "ONE_OFF", label: "单次合作" },
          ] as const
        ).map((t) => (
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

      {tab === "PROGRESS" ? <SalesProgressDashboard projects={projects.filter((row) => row.type === "INTEGRATED")} /> : tab === "DISCOUNTS" ? <DiscountModuleEntry /> : shown.length === 0 ? (
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
                <th className="px-4 py-2.5 text-left font-medium">
                  {tab === "ONE_OFF" ? "流程阶段" : "状态"}
                </th>
                <th className="px-4 py-2.5 text-left font-medium">客户</th>
                {tab === "INTEGRATED" && (
                  <th className="px-4 py-2.5 text-left font-medium">
                    Strategy AM
                  </th>
                )}
                {tab === "INTEGRATED" && (
                  <th className="px-4 py-2.5 text-left font-medium">
                    商务负责人
                  </th>
                )}
                {tab === "INTEGRATED" && (
                  <th className="px-4 py-2.5 text-left font-medium">
                    售前方案负责人
                  </th>
                )}
                {tab === "INTEGRATED" && (
                  <th className="px-4 py-2.5 text-left font-medium">
                    关联合同
                  </th>
                )}
                <th className="px-4 py-2.5 text-left font-medium">进度条数</th>
                <th className="px-4 py-2.5 text-left font-medium">创建时间</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-50 transition-colors hover:bg-slate-50/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/projects/${p.id}`}
                      className="hover:text-brand-600 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {tab === "ONE_OFF" ? (
                      <Badge
                        className={`${ONEOFF_STAGE_COLORS[p.stage ?? ""] ?? "bg-slate-100 text-slate-600"} border-0`}
                      >
                        {ONEOFF_STAGE_LABELS[p.stage ?? ""] ?? "需求创建"}
                      </Badge>
                    ) : (
                      <Badge
                        className={`${PROJECT_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600"} border-0`}
                      >
                        {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.customerName}</td>
                  {tab === "INTEGRATED" && (
                    <td className="px-4 py-3 text-slate-600">{p.ownerName}</td>
                  )}
                  {tab === "INTEGRATED" && (
                    <td className="px-4 py-3 text-slate-600">
                      {p.businessOwner}
                    </td>
                  )}
                  {tab === "INTEGRATED" && (
                    <td className="px-4 py-3 text-slate-600">
                      {p.backendOwner}
                    </td>
                  )}
                  {tab === "INTEGRATED" && (
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {p.contractNo}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-600">{p.entryCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(p.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-slate-300 hover:text-brand-600"
                    >
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

function DiscountModuleEntry() {
  const items = [
    ["折扣汇总中心", "查看折扣活动、有效期、价格与佣金，并筛选导出。", "/projects/discount"],
    ["产品信息表", "按项目维护店铺、ASIN、评分、排名和产品链接。", "/projects/discount/product-info"],
    ["源数据管理", "配置飞书表格数据源，查看映射和同步状态。", "/projects/discount/source"],
    ["字段映射配置", "将外部字段映射到 16 个标准折扣字段。", "/projects/discount/field-mapping"],
  ];
  return <section className="grid gap-4 md:grid-cols-2">{items.map(([title, description, href]) => <Link key={href} href={href} className="card group p-5 transition-colors hover:border-brand-300"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p></div><ArrowRight className="mt-1 h-4 w-4 text-slate-300 group-hover:text-brand-600" /></div></Link>)}</section>;
}

function LegacyProgressDashboard({ projects }: { projects: ProjectRow[] }) {
  const active = projects.filter((row) => row.status === "ACTIVE").length;
  const done = projects.filter((row) => row.status === "DONE").length;
  const entries = projects.reduce((sum, row) => sum + row.entryCount, 0);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><KpiCard label="项目总数" value={projects.length} note="联盟营销项目" /><KpiCard label="进行中" value={active} note="需要持续跟进" tone="brand" /><KpiCard label="已完成" value={done} note="当前范围累计" tone="green" /><KpiCard label="进度记录" value={entries} note="项目动态总条数" /></div>
    <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="font-semibold text-slate-900">项目推进总览</h2><p className="mt-1 text-xs text-slate-500">KPI 口径与源数据分别维护，项目详情及既有录入逻辑保持不变。</p></div><div className="flex gap-2"><Link href="/projects/kpi-config" className="btn-secondary"><Settings2 className="h-4 w-4" />KPI 配置</Link><Link href="/projects/source-data" className="btn-secondary"><Database className="h-4 w-4" />源数据管理</Link></div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><th className="px-4 py-2.5">项目</th><th>客户</th><th>Strategy AM</th><th>状态</th><th className="text-right">进度记录</th><th className="px-4 text-right">详情</th></tr></thead><tbody className="divide-y divide-slate-100">{projects.map((row) => <tr key={row.id} className="hover:bg-slate-50/60"><td className="px-4 py-3 font-medium text-slate-900">{row.name}</td><td>{row.customerName}</td><td>{row.ownerName}</td><td><Badge className={`${PROJECT_STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-600"} border-0`}>{PROJECT_STATUS_LABELS[row.status] ?? row.status}</Badge></td><td className="text-right">{row.entryCount}</td><td className="px-4 text-right"><Link href={`/projects/${row.id}`} className="text-brand-700 hover:underline">查看</Link></td></tr>)}</tbody></table>{!projects.length && <p className="py-12 text-center text-sm text-slate-500">暂无项目进度数据。</p>}</div></section>
  </div>;
}

const discountSections = [
  { key: "DISCOUNT_RECORD", title: "折扣汇总中心", description: "按有效期、品牌、平台、店铺、Deal Type 与活动时间统一查看折扣", columns: ["有效期","Brand品牌","平台","店铺","Deal Type","产品品类/名称","子ASIN","产品链接","划线价/List Price","Discount/Deals Price","Discount %","开始时间","结束时间","Promo Code","ACC Campaign ID","ACC Commission %","最后更新时间"], resource: "DISCOUNT_RECORD" },
  { key: "PRODUCT", title: "产品信息表", description: "按原应用字段维护项目产品资料，并作为折扣同步的补全来源", columns: ["序号","店铺","产品品类","平台","Brand品牌","子ASIN","站内排名","评分","评论数","链接定位","产品链接"], resource: "PRODUCT" },
  { key: "DISCOUNT_SOURCE", title: "源数据管理", description: "配置飞书多维表格、飞书表格或其他表格的数据源与同步信息", columns: ["数据源名称","关联项目","数据源类型","源链接","字段映射","同步状态","最后同步时间","同步数据","操作人"], resource: "DISCOUNT_SOURCE" },
  { key: "DISCOUNT_MAPPING", title: "字段映射配置", description: "将 16 个标准折扣字段映射至源字段，支持可为空和手动补足", columns: ["数据源","目标字段","英文标识","源字段","更新时间"], resource: "DISCOUNT_MAPPING" },
] as const;
type DataRow = Record<string, unknown> & { id?: string };
const fieldsByResource: Record<string, { key: string; label: string; type?: string; required?: boolean }[]> = {
  DISCOUNT_SOURCE: [{ key: "sourceUrl", label: "飞书表格链接" }, { key: "name", label: "数据源名称", required: true }, { key: "sourceType", label: "数据源类型（feishu_bitable / feishu_sheets / other）", required: true }, { key: "appToken", label: "App Token" }, { key: "tableId", label: "Table ID / Sheet ID" }, { key: "viewId", label: "View ID" }, { key: "headerRowIndex", label: "表头行号（1-5）", type: "number" }],
  PRODUCT: [{ key: "sequence", label: "序号" }, { key: "store", label: "店铺" }, { key: "category", label: "产品品类" }, { key: "platform", label: "平台" }, { key: "brand", label: "Brand品牌" }, { key: "asin", label: "子ASIN", required: true }, { key: "bsrRank", label: "站内排名" }, { key: "rating", label: "评分", type: "number" }, { key: "reviewCount", label: "评论数", type: "number" }, { key: "linkPosition", label: "链接定位" }, { key: "productLink", label: "产品链接" }],
  DISCOUNT_MAPPING: [{ key: "sourceId", label: "数据源 ID", required: true }, { key: "targetField", label: "目标字段", required: true }, { key: "sourceField", label: "源字段（可填 __empty__ 或 __manual__:内容）", required: true }],
  DISCOUNT_RECORD: [{ key: "sourceId", label: "数据源 ID", required: true }, { key: "brand", label: "Brand品牌" }, { key: "platform", label: "平台" }, { key: "store", label: "店铺" }, { key: "dealType", label: "Deals Type" }, { key: "productCategory", label: "产品品类/名称" }, { key: "asin", label: "子ASIN" }, { key: "productLink", label: "产品链接" }, { key: "originalPrice", label: "划线价/List Price", type: "number" }, { key: "discountPrice", label: "Discount/Deals Price", type: "number" }, { key: "discountRate", label: "Discount Percentage（%）", type: "number" }, { key: "startDate", label: "开始时间", type: "date" }, { key: "endDate", label: "结束时间", type: "date" }, { key: "promoCode", label: "Promo Code" }, { key: "accCampaignId", label: "ACC Campaign ID" }, { key: "accGoldRatio", label: "ACC Commission（%）", type: "number" }, { key: "currency", label: "币种" }],
};

function displayRow(resource: string, row: DataRow): string[] {
  const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("zh-CN") : "—";
  const json = (value: unknown) => value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value);
  if (resource === "DISCOUNT_RECORD") { const now=new Date(), end=row.endDate?new Date(String(row.endDate)):null,start=row.startDate?new Date(String(row.startDate)):null; const validity=end?(end>=now?"有效":"已过期"):start?"长期有效":"未知"; const pct=(v:unknown)=>v==null?"—":`${Math.abs(Number(v))<=1?Number(v)*100:Number(v)}%`; return [validity,String(row.brand??"—"),String(row.platform??"—"),String(row.store??"—"),String(row.dealType??"—"),String(row.productCategory??"—"),String(row.asin??"—"),String(row.productLink??"—"),String(row.originalPrice??"—"),String(row.discountPrice??"—"),pct(row.discountRate),date(row.startDate),date(row.endDate),String(row.promoCode??"—"),String(row.accCampaignId??"—"),pct(row.accGoldRatio),date(row.lastUpdated)]; }
  if (resource === "PRODUCT") return [String(row.sequence??"—"),String(row.store??"—"),String(row.category??"—"),String(row.platform??"—"),String(row.brand??"—"),String(row.asin??"—"),String(row.bsrRank??"—"),String(row.rating??"—"),String(row.reviewCount??"—"),String(row.linkPosition??"—"),String(row.productLink??"—")];
  if (resource === "DISCOUNT_SOURCE") return [String(row.name??"—"),"当前项目",String(row.sourceType??"—"),String(row.sourceUrl??"—"),"查看配置",String(row.syncStatus??"IDLE"),date(row.lastSyncAt),String(row.lastSyncCount??0),String(row.lastOperatedById??"—")];
  return [String(row.sourceId??"—"),String(row.targetField??"—"),String(row.targetField??"—"),String(row.sourceField??"—"),date(row.updatedAt)];
}

function DiscountsWorkspace({ projects, canEdit }: { projects: ProjectRow[]; canEdit: boolean }) {
  const [sectionKey, setSectionKey] = useState<(typeof discountSections)[number]["key"]>("DISCOUNT_RECORD");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [rows, setRows] = useState<DataRow[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [showForm, setShowForm] = useState(false); const [saving, setSaving] = useState(false);
  const section = discountSections.find((item) => item.key === sectionKey)!;
  const load = async () => { if (!projectId) return; setLoading(true); setError(""); try { const response = await fetch(`/api/project-data?projectId=${encodeURIComponent(projectId)}&resource=${section.resource}`); const body = await response.json(); if (!response.ok) throw new Error(body.error || "加载失败"); setRows(body.data ?? []); } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [projectId, section.resource]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const payload: Record<string, unknown> = { projectId, resource: section.resource }; fieldsByResource[section.resource].forEach(({ key, type }) => { const value = String(form.get(key) ?? "").trim(); if (value) payload[key] = type === "number" ? Number(value) : value; }); try { const response = await fetch("/api/project-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "保存失败"); setShowForm(false); await load(); } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); } };
  return <section className="card overflow-hidden"><div className="border-b border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Tags className="h-4 w-4 text-brand-600" /><h2 className="font-semibold text-slate-900">项目折扣数据</h2></div><p className="mt-1 text-xs text-slate-500">以项目为边界管理折扣事实、产品主数据、数据源和字段映射。</p></div><div className="flex items-center gap-2"><select className="input min-w-56" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className="btn-secondary" onClick={() => void load()} disabled={!projectId || loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />刷新</button>{canEdit && <button className="btn-primary" onClick={() => setShowForm(true)} disabled={!projectId}><Plus className="h-4 w-4" />新增</button>}</div></div><div className="mt-4 flex flex-wrap gap-1">{discountSections.map((item) => <button key={item.key} type="button" onClick={() => setSectionKey(item.key)} className={cn("rounded-md px-3 py-2 text-sm font-medium", item.key === sectionKey ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{item.title}</button>)}</div></div><div className="border-b border-slate-100 px-4 py-3"><h3 className="font-semibold text-slate-900">{section.title}</h3><p className="mt-1 text-xs text-slate-500">{section.description}</p></div>{error && <div className="m-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500">{section.columns.map((column, index) => <th key={column} className={index === 0 ? "px-4 py-2.5" : "py-2.5"}>{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.id ?? index}>{displayRow(section.resource, row).map((value, cell) => <td key={cell} className={cn("max-w-64 truncate py-3", cell === 0 && "px-4")}>{value}</td>)}</tr>)}</tbody></table>{loading ? <p className="py-10 text-center text-sm text-slate-500">正在加载…</p> : !projectId ? <p className="py-10 text-center text-sm text-slate-500">暂无可选项目。</p> : rows.length === 0 && <p className="py-10 text-center text-sm text-slate-500">当前项目暂无{section.title}数据。</p>}</div><Modal open={showForm} onClose={() => setShowForm(false)} title={`新增${section.title}`}><form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>{fieldsByResource[section.resource].map((field) => <label key={field.key} className="text-xs font-medium text-slate-600">{field.label}<input className="input mt-1 w-full" name={field.key} type={field.type ?? "text"} required={field.required} step={field.type === "number" ? "any" : undefined} /></label>)}<div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>取消</button><button className="btn-primary" disabled={saving}>{saving ? "保存中…" : "保存"}</button></div></form></Modal></section>;
}
function KpiCard({ label, value, note, tone = "slate" }: { label: string; value: number; note: string; tone?: "slate" | "brand" | "green" }) { const colors = tone === "brand" ? "text-brand-700" : tone === "green" ? "text-emerald-700" : "text-slate-900"; return <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${colors}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>; }

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
    if (!name.trim()) {
      setError("请填写项目名称");
      return;
    }
    if (!demand.trim()) {
      setError("请填写需求描述");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createOneOffProject({
        name,
        customerId: customerId || undefined,
        demand,
        coopInfo,
      });
      if (!result.ok) {
        setError(result.error ?? "创建失败");
        return;
      }
      onClose();
      router.push(`/projects/${result.projectId}`);
    });
  }

  return (
    <Modal open onClose={onClose} title="新建单次合作">
      <div className="space-y-4">
        <div>
          <label className="label">项目名称 *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：XX 品牌春节单次推广"
          />
        </div>
        <div>
          <label className="label">关联客户（可选）</label>
          <select
            className="input"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">不关联</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brandName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">需求描述 *</label>
          <textarea
            className="input min-h-[80px]"
            value={demand}
            onChange={(e) => setDemand(e.target.value)}
            placeholder="描述本次合作的需求…"
          />
        </div>
        <div>
          <label className="label">合作信息（可选）</label>
          <textarea
            className="input min-h-[60px]"
            value={coopInfo}
            onChange={(e) => setCoopInfo(e.target.value)}
            placeholder="补充合作背景、范围等信息…"
          />
        </div>
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="btn-secondary text-sm">
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={pending}
            className="btn-primary text-sm"
          >
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
  const defaultName = composeIntegratedProjectName(
    customer?.brandName ?? "",
    promoPlatforms,
    targetSites,
  );
  const displayedName = nameTouched ? name : defaultName;
  // 该客户名下的合同
  const customerContracts = contracts.filter(
    (c) => c.customerId === customerId,
  );

  function onSubmit() {
    if (!customerId) {
      setError("请选择关联客户");
      return;
    }
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
      if (!result.ok) {
        setError(result.error ?? "创建失败");
        return;
      }
      onClose();
      router.push(`/projects/${result.projectId}`);
    });
  }

  return (
    <Modal open onClose={onClose} title="新建联盟营销项目">
      <div className="space-y-4">
        <div>
          <label className="label">关联客户 *</label>
          <select
            className="input"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setContractId("");
            }}
          >
            <option value="">请选择客户</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brandName}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            一个客户可关联创建多个项目
          </p>
        </div>
        <div>
          <label className="label">关联合同（可选）</label>
          {!customerId ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400">
              请先选择客户
            </p>
          ) : customerContracts.length === 0 ? (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
              该客户暂无可关联的合同
            </p>
          ) : (
            <select
              className="input"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              <option value="">不关联合同</option>
              {customerContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractNo}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            关联后合同状态变动会自动同步到项目时间流
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">商务负责人</label>
            <div className="input bg-slate-50 text-slate-600">
              {customer?.businessOwnerName ?? "（取客户负责人）"}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              自动取该客户的商务负责人
            </p>
          </div>
          <div>
            <label className="label">Strategy AM</label>
            <select
              className="input"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              <option value="">未指定</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              默认创建人，可手动修改；项目 GMV 目标默认取此人
            </p>
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
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="btn-secondary text-sm">
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={pending || !customerId}
            className="btn-primary text-sm"
          >
            {pending ? "创建中…" : "创建项目"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
