"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_COLORS,
  REVIEW_ACTION_LABELS,
  REVIEW_ACTION_COLORS,
  COMMISSION_TYPE_LABELS,
  CONTRACT_REVIEW_GROUPS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import { calcCommission } from "@/lib/commissionCalc";
import type { ReconciliationInvoiceState } from "@/lib/reconciliationInvoice";

// ── types ──────────────────────────────────────────────────────────────────────

type Review = {
  id: string;
  action: string;
  disputedSalesAmount: number | null;
  note: string | null;
  createdAt: Date | string;
  reviewer: { id: string; name: string };
};

type Rec = {
  id: string;
  createdAt: Date | string;
  status: string;
  reconcileType?: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  feeAmount: number;
  fixedFeeCurrency: string;
  commissionAmount: number;
  commissionCurrency: string;
  commissionRate: number;
  betType: string;
  betOrderCount: number | null;
  betSalesAmount: number | null;
  actualOrders: number;
  actualSalesAmount: number;
  betResult: string | null;
  actualCommissionRate: number;
  finalOrders: number | null;
  finalSalesAmount: number | null;
  finalCommissionAmount: number | null;
  submittedById: string | null;
  submittedToUserId: string | null;
  submittedDeadline: Date | string | null;
  gmvBaseline: number | null;
  createdById: string;
  contract: {
    id: string;
    contractNo: string;
    // v3 字段（用于抽佣计算逻辑显示）
    commissionType?: string | null;
    commissionRate?: string | null;
    thresholdAmount?: string | null;
    thresholdCurrency?: string | null;
    tieredRules?: string | null;
    excessBaseMonths?: string | null;
    excessCommissionRate?: string | null;
    gmvSettlementCycle?: string | null;
  };
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  submittedToUser: { id: string; name: string } | null;
  reviews: Review[];
};

type Contract = {
  id: string;
  contractNo: string;
  partyA: string | null;
  // v3 字段
  promoPlatform: string | null;
  targetSite: string | null;
  feeAmount: string | null;
  feeCurrency: string | null;
  paymentMethod: string | null;
  commissionType: string | null;
  commissionRate: string | null;
  thresholdAmount: string | null;
  thresholdCurrency: string | null;
  tieredRules: string | null;
  excessBaseMonths: string | null;
  excessCommissionRate: string | null;
  gmvSettlementCycle: string | null;
  // 兼容旧字段
  feeCycle: string | null;
  hasBet: string | null;
  betTarget: string | null;
  betTargetCurrency: string | null;
  affiliateRule: string | null;
  accountingPeriod: string | null;
  paymentCycle: string | null;
} | null;

type CustomerType = {
  id: string;
  brandName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  businessOwner: { id: string; name: string; email: string } | null;
  contracts: Contract[];
};

type User = { id: string; name: string; role: string };

type Props = {
  customer: CustomerType;
  contract: Contract;
  reconciliations: Rec[];
  currentUserId: string;
  users: User[];
  readOnly?: boolean;
  canManage?: boolean;
  invoiceStates?: Record<string, ReconciliationInvoiceState>;
};

// ── currency symbol ───────────────────────────────────────────────────────────
function currencySymbol(c: string) {
  return c === "美金" ? "$" : "¥";
}

function summarizeSelectedAmounts(
  records: Rec[],
  streamKind: "fixed" | "commission",
) {
  const totals = new Map<string, number>();
  for (const rec of records) {
    const belongsToStream =
      rec.reconcileType === "BOTH" ||
      rec.reconcileType ===
        (streamKind === "fixed" ? "FEE_ONLY" : "COMMISSION_ONLY");
    if (!belongsToStream) continue;
    const currency =
      streamKind === "fixed"
        ? rec.fixedFeeCurrency || "人民币"
        : rec.commissionCurrency || "人民币";
    const amount =
      streamKind === "fixed"
        ? rec.feeAmount
        : (rec.finalCommissionAmount ?? rec.commissionAmount);
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(
      ([currency, amount]) =>
        `${currencySymbol(currency)}${amount.toLocaleString("zh-CN", {
          minimumFractionDigits: 2,
        })}`,
    )
    .join(" + ");
}

/** 把 "1.5%" / "0.015" / 1.5 / 0.015 转为小数（0.015） */
function parseRatePct(s: string | number | null | undefined): number {
  if (s == null || s === "") return 0;
  if (typeof s === "number") return s > 1 ? s / 100 : s;
  const n = Number(String(s).replace(/[%\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

// ── tiered rules formatting ───────────────────────────────────────────────────
function formatTieredRules(raw: string | null): string {
  if (!raw) return "—";
  try {
    const obj = JSON.parse(raw);
    if (!obj?.tiers?.length) return "—";
    const sym = obj.currency === "美金" ? "$" : "¥";
    return obj.tiers
      .map((t: { from: string; to: string; rate: string }, i: number) => {
        if (i === 0) return `0-${sym}${t.to} → ${t.rate}`;
        if (t.to) return `${sym}${t.from}-${sym}${t.to} → ${t.rate}`;
        return `${sym}${t.from} 及以上 → ${t.rate}`;
      })
      .join(" / ");
  } catch {
    return "—";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function CustomerReconciliationDetailClient({
  customer,
  contract,
  reconciliations,
  currentUserId,
  users,
  readOnly = false,
  canManage = false,
  invoiceStates = {},
}: Props) {
  const [newStream, setNewStream] = useState<
    "FEE_ONLY" | "COMMISSION_ONLY" | null
  >(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const scopeAll = searchParams.get("scope") === "all";
  const [, startTransition] = useTransition();
  const fixedReconciliations = reconciliations.filter(
    (rec) => rec.reconcileType !== "COMMISSION_ONLY",
  );
  const commissionReconciliations = reconciliations.filter(
    (rec) => rec.reconcileType !== "FEE_ONLY",
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchSubmitModal, setShowBatchSubmitModal] = useState(false);
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const selectedRecords = reconciliations.filter((rec) =>
    selectedIds.includes(rec.id),
  );
  const fixedSummary = summarizeSelectedAmounts(selectedRecords, "fixed");
  const commissionSummary = summarizeSelectedAmounts(
    selectedRecords,
    "commission",
  );

  function toggleSelected(recId: string) {
    setSelectedIds((current) =>
      current.includes(recId)
        ? current.filter((id) => id !== recId)
        : [...current, recId],
    );
  }

  function openBatchSubmit() {
    if (readOnly) {
      alert("当前权限仅允许查看和下载对账明细，不能提交对账");
      return;
    }
    if (selectedRecords.some((rec) => rec.reconcileType === "BOTH")) {
      alert("历史合并记录仅支持下载对账明细，不能批量提交");
      return;
    }
    const unavailable = selectedRecords.filter(
      (rec) => rec.status !== "DRAFT" && rec.status !== "DISPUTED",
    );
    if (unavailable.length > 0) {
      alert(
        `所选记录中有 ${unavailable.length} 条不是草稿或有异议状态，不能批量提交`,
      );
      return;
    }
    setShowBatchSubmitModal(true);
  }

  function openInvoice() {
    if (readOnly) {
      alert("当前权限仅允许查看和下载对账明细，不能开具 Invoice");
      return;
    }
    if (selectedRecords.some((rec) => rec.reconcileType === "BOTH")) {
      alert(
        "历史合并记录不能直接开具 Invoice，请仅选择独立的固费或销售佣金对账",
      );
      return;
    }
    const unconfirmed = selectedRecords.filter(
      (rec) => rec.status !== "CONFIRMED",
    );
    if (unconfirmed.length > 0) {
      alert(
        `开具 Invoice 前必须完成对账确认；当前有 ${unconfirmed.length} 条记录尚未确认`,
      );
      return;
    }
    router.push(
      `/invoices/new?reconciliationIds=${encodeURIComponent(selectedIds.join(","))}${scopeAll ? "&scope=all" : ""}`,
    );
  }

  async function downloadStatement() {
    setDownloadingStatement(true);
    try {
      const response = await fetch(
        `/api/finance/reconciliation-statements${scopeAll ? "?scope=all" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reconciliationIds: selectedIds }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload.error ?? "生成对账明细失败，请稍后重试");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const fileName = encodedName
        ? decodeURIComponent(encodedName)
        : plainName || `${customer.brandName}_对账明细.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Download reconciliation statement failed", error);
      alert("网络连接异常，无法下载对账明细，请稍后重试");
    } finally {
      setDownloadingStatement(false);
    }
  }

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <BasicInfoSection customer={customer} contract={contract} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ReconciliationStreamSection
          title="固费对账"
          description="按固费服务周期独立确认和结算"
          records={fixedReconciliations}
          streamKind="fixed"
          canCreate={Boolean(contract) && !readOnly}
          onCreate={() => setNewStream("FEE_ONLY")}
          currentUserId={currentUserId}
          users={users}
          readOnly={readOnly}
          canManage={canManage}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onRefresh={refresh}
          invoiceStates={invoiceStates}
          scopeAll={scopeAll}
        />
        <ReconciliationStreamSection
          title="销售佣金对账"
          description="按销售归属周期拉取 BI 数据并计算佣金"
          records={commissionReconciliations}
          streamKind="commission"
          canCreate={Boolean(contract) && !readOnly}
          onCreate={() => setNewStream("COMMISSION_ONLY")}
          currentUserId={currentUserId}
          users={users}
          readOnly={readOnly}
          canManage={canManage}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onRefresh={refresh}
          invoiceStates={invoiceStates}
          scopeAll={scopeAll}
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                已选择 {selectedIds.length} 条
              </span>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setSelectedIds([])}
                title="清空选择"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {fixedSummary && `固费 ${fixedSummary}`}
              {fixedSummary && commissionSummary && " · "}
              {commissionSummary && `销售佣金 ${commissionSummary}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={openBatchSubmit}
            >
              <Send className="h-4 w-4" />
              批量提交
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={openInvoice}
            >
              <FileText className="h-4 w-4" />
              开具 Invoice
            </button>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={downloadStatement}
              disabled={downloadingStatement}
            >
              <Download className="h-4 w-4" />
              {downloadingStatement ? "生成中…" : "下载对账明细"}
            </button>
          </div>
        </div>
      )}

      {newStream && contract && !readOnly && (
        <NewMonthlyModal
          customerId={customer.id}
          contractId={contract.id}
          reconcileType={newStream}
          onClose={() => setNewStream(null)}
          onCreated={(id) => {
            setNewStream(null);
            refresh();
            void id;
          }}
        />
      )}

      {showBatchSubmitModal && !readOnly && (
        <BatchSubmitModal
          records={selectedRecords}
          users={users}
          scopeAll={scopeAll}
          onClose={() => setShowBatchSubmitModal(false)}
          onDone={() => {
            setShowBatchSubmitModal(false);
            setSelectedIds([]);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ReconciliationStreamSection({
  title,
  description,
  records,
  streamKind,
  canCreate,
  onCreate,
  currentUserId,
  users,
  readOnly,
  canManage,
  selectedIds,
  onToggleSelected,
  onRefresh,
  invoiceStates,
  scopeAll,
}: {
  title: string;
  description: string;
  records: Rec[];
  streamKind: "fixed" | "commission";
  canCreate: boolean;
  onCreate: () => void;
  currentUserId: string;
  users: User[];
  readOnly: boolean;
  canManage: boolean;
  selectedIds: string[];
  onToggleSelected: (recId: string) => void;
  onRefresh: () => void;
  invoiceStates: Record<string, ReconciliationInvoiceState>;
  scopeAll: boolean;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>
        {canCreate && (
          <button className="btn-primary shrink-0 text-sm" onClick={onCreate}>
            <Plus className="h-4 w-4" /> 新建
          </button>
        )}
      </div>
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-2 text-3xl">📭</div>
          <p className="text-sm text-slate-400">暂无{title}记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec, index) => (
            <MonthlyRecordRow
              key={streamKind + "-" + rec.id}
              rec={rec}
              streamKind={streamKind}
              defaultOpen={index === 0}
              currentUserId={currentUserId}
              users={users}
              readOnly={readOnly}
              canManage={canManage}
              selected={selectedIds.includes(rec.id)}
              onToggleSelected={onToggleSelected}
              onRefresh={onRefresh}
              invoiceState={invoiceStates[rec.id]}
              scopeAll={scopeAll}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── 基本信息 ─────────────────────────────────────────────────────────────────
function BasicInfoSection({
  customer,
  contract,
}: {
  customer: CustomerType;
  contract: Contract;
}) {
  // 组装合同字段值（与合同详情页一致）
  let tieredText = "";
  if (contract?.tieredRules) {
    tieredText = formatTieredRules(contract.tieredRules);
  }

  const ct = contract?.commissionType ?? "";

  // 字段值映射（与 /contracts/[id] 保持一致）
  const fieldValues: Record<string, string> = {
    partyA: contract?.partyA ?? "",
    contractPeriod: "", // 合同无 startDate/endDate 在 finance 端 select，此处留空
    promoPlatform: contract?.promoPlatform ?? "",
    targetSite: contract?.targetSite ?? "",
    feeAmount: contract?.feeAmount
      ? `${currencySymbol(contract.feeCurrency ?? "人民币")}${contract.feeAmount}`
      : "",
    feeCurrency: contract?.feeCurrency ?? "",
    paymentMethod: contract?.paymentMethod ?? "",
    commissionType: ct ? (COMMISSION_TYPE_LABELS[ct] ?? ct) : "",
    commissionRate: contract?.commissionRate ?? "",
    thresholdAmount: contract?.thresholdAmount
      ? `${currencySymbol(contract.thresholdCurrency ?? "人民币")}${contract.thresholdAmount}`
      : "",
    thresholdCurrency: contract?.thresholdCurrency ?? "",
    tieredRules: tieredText,
    excessBaseMonths: contract?.excessBaseMonths
      ? `${contract.excessBaseMonths} 个月`
      : "",
    excessCommissionRate: contract?.excessCommissionRate ?? "",
    gmvSettlementCycle: contract?.gmvSettlementCycle
      ? `${contract.gmvSettlementCycle}结算`
      : "",
  };

  // 条件字段：只显示当前 commissionType 对应的
  const conditionalKeys: Record<string, string[]> = {
    FIXED: [],
    THRESHOLD: ["thresholdAmount", "thresholdCurrency"],
    TIERED: ["tieredRules"],
    EXCESS: ["excessBaseMonths", "excessCommissionRate"],
  };
  const allConditionalKeys = new Set([
    "thresholdAmount",
    "thresholdCurrency",
    "tieredRules",
    "excessBaseMonths",
    "excessCommissionRate",
  ]);
  const activeConditional = new Set(conditionalKeys[ct] ?? []);

  // 与合同页一致的过滤：隐藏不相关条件字段 + 隐藏空值字段
  function visibleInGroup(key: string) {
    if (allConditionalKeys.has(key)) return activeConditional.has(key);
    const v = fieldValues[key];
    return v != null && v !== "" && v !== "—";
  }

  // 分组颜色配色（每个块视觉区分）
  const groupAccent: Record<string, string> = {
    基本信息: "border-l-sky-400 bg-sky-50/40",
    推广信息: "border-l-violet-400 bg-violet-50/40",
    月度服务费: "border-l-emerald-400 bg-emerald-50/40",
    联盟归因GMV佣金: "border-l-amber-400 bg-amber-50/40",
  };

  return (
    <section className="space-y-4">
      {/* 头部卡片：关联客户 + 合同编号 + 客户负责人 */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">基本信息</h2>
          {contract && (
            <Link
              href={`/contracts/${contract.id}`}
              className="btn-secondary btn-sm flex items-center gap-1"
            >
              <Pencil className="h-3.5 w-3.5" /> 查看/编辑合同
            </Link>
          )}
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <FieldItem label="关联客户" value={customer.brandName} />
          <FieldItem
            label="合同编号"
            value={
              contract ? (
                <Link
                  href={`/contracts/${contract.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {contract.contractNo}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <FieldItem
            label="客户负责人"
            value={customer.businessOwner?.name ?? "—"}
          />
        </div>
      </div>

      {/* 合同关键字段：每组独立卡片，左侧色条区分 */}
      {contract && (
        <div className="grid gap-4 lg:grid-cols-2">
          {CONTRACT_REVIEW_GROUPS.map((group) => {
            const visibleFields = group.fields.filter((f) =>
              visibleInGroup(f.key),
            );
            if (visibleFields.length === 0) return null;
            const accent =
              groupAccent[group.group] ?? "border-l-slate-300 bg-slate-50/40";
            return (
              <div
                key={group.group}
                className={`rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm ${accent}`}
              >
                <p className="mb-4 text-sm font-semibold text-slate-700">
                  {group.group}
                </p>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {visibleFields.map((f) => (
                    <div key={f.key}>
                      <dt className="text-xs text-slate-400">{f.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">
                        {fieldValues[f.key] || (
                          <span className="text-slate-300">—</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}

      {/* 联系信息卡片 */}
      <div className="card p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">联系信息</p>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <FieldItem
            label="联系邮箱"
            value={
              customer.businessOwner?.email || customer.contactEmail || "—"
            }
          />
          <FieldItem label="联系电话" value={customer.contactPhone ?? "—"} />
        </div>
      </div>
    </section>
  );
}

// ── 月度对账行 ────────────────────────────────────────────────────────────────
function MonthlyRecordRow({
  rec,
  streamKind,
  defaultOpen,
  currentUserId,
  users,
  readOnly,
  canManage,
  selected,
  onToggleSelected,
  onRefresh,
  invoiceState,
  scopeAll,
}: {
  rec: Rec;
  streamKind: "fixed" | "commission";
  defaultOpen: boolean;
  currentUserId: string;
  users: User[];
  readOnly: boolean;
  canManage: boolean;
  selected: boolean;
  onToggleSelected: (recId: string) => void;
  onRefresh: () => void;
  invoiceState?: ReconciliationInvoiceState;
  scopeAll: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [pulling, setPulling] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<"APPROVED" | "DISPUTED">(
    "APPROVED",
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [updatingCurrency, setUpdatingCurrency] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDraft = rec.status === "DRAFT";
  const isPendingReview = rec.status === "PENDING_REVIEW";
  const isDisputed = rec.status === "DISPUTED";
  const isConfirmed = rec.status === "CONFIRMED";
  const isFixedStream = streamKind === "fixed";
  const isHistoricalCombined = rec.reconcileType === "BOTH";
  const canOperateRecord = !isHistoricalCombined;

  const fixedSym = currencySymbol(rec.fixedFeeCurrency || "人民币");
  const commSym = currencySymbol(rec.commissionCurrency || "人民币");

  // ── 实时计算抽佣（基于合同 v3 字段 + 当前 actualSalesAmount）─────────────────
  // 不依赖 DB 快照的 actualCommissionRate / commissionAmount，避免历史数据陈旧
  const parsedContractRate = parseRatePct(rec.contract.commissionRate);
  const liveCalc = calcCommission({
    commissionType: rec.contract.commissionType ?? "FIXED",
    contractRate: parsedContractRate,
    thresholdAmount: rec.contract.thresholdAmount ?? null,
    tieredRules: rec.contract.tieredRules ?? null,
    gmvBaseline: rec.gmvBaseline ?? null,
    actualSalesAmount: isConfirmed
      ? (rec.finalSalesAmount ?? rec.actualSalesAmount)
      : rec.actualSalesAmount,
  });
  const liveRate = liveCalc.actualCommissionRate;
  const liveAmount = liveCalc.commissionAmount;

  async function pullBiData() {
    if (readOnly) return;
    setPulling(true);
    try {
      const res = await fetch(
        `/api/finance/reconciliations/${rec.id}/pull-bi`,
        { method: "POST" },
      );
      if (!res.ok) {
        alert((await res.json()).error ?? "拉取失败");
        return;
      }
      onRefresh();
    } finally {
      setPulling(false);
    }
  }

  async function updateCurrency(
    field: "fixedFeeCurrency" | "commissionCurrency",
    value: string,
  ) {
    if (readOnly) return;
    setUpdatingCurrency(true);
    try {
      const res = await fetch(`/api/finance/reconciliations/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        alert(payload.error ?? "币种更新失败，请稍后重试");
        return;
      }
      onRefresh();
    } finally {
      setUpdatingCurrency(false);
    }
  }

  async function deleteRecord() {
    if (!canManage) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/reconciliations/${rec.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert((await res.json()).error ?? "删除失败");
        return;
      }
      setShowDeleteModal(false);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#e7e0ef] bg-white">
      {/* 折叠标题行 */}
      <div className="flex w-full items-center gap-2 px-4 py-3">
        <label
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-slate-50"
          title={
            isHistoricalCombined
              ? "历史合并记录仅可用于下载对账明细"
              : "选择该条对账记录"
          }
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={selected}
            onChange={() => onToggleSelected(rec.id)}
          />
          <span className="sr-only">选择该条对账记录</span>
        </label>
        <button
          type="button"
          className="flex-1 flex items-center gap-3 flex-wrap text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="whitespace-nowrap text-xs text-slate-400">
            创建时间 {formatDateTime(rec.createdAt)}
          </span>
          <span className="font-medium text-slate-900">
            对账周期 {formatDate(rec.periodStart)} ~ {formatDate(rec.periodEnd)}
          </span>
          <Badge className={RECONCILIATION_STATUS_COLORS[rec.status]}>
            {RECONCILIATION_STATUS_LABELS[rec.status] ?? rec.status}
          </Badge>
          {isHistoricalCombined && (
            <Badge className="bg-indigo-50 text-indigo-600">历史合并记录</Badge>
          )}
          {isFixedStream ? (
            <span className="text-sm text-slate-500">
              固费 {fixedSym}
              {rec.feeAmount.toLocaleString()}
            </span>
          ) : (
            <span className="text-sm text-slate-500">
              销售佣金 {commSym}
              {rec.commissionAmount.toLocaleString("zh-CN", {
                minimumFractionDigits: 2,
              })}
            </span>
          )}
          {rec.submittedDeadline && !isConfirmed && (
            <span className="text-xs text-amber-600">
              截止 {formatDate(rec.submittedDeadline)}
            </span>
          )}
        </button>
        {canManage && canOperateRecord && (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            title="删除该月度对账"
            onClick={() => setShowDeleteModal(true)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-5 pt-4 space-y-5">
          {/* ── 对账摘要 ── */}
          <div>
            <p className="mb-3 text-xs font-semibold text-slate-500">
              对账摘要
            </p>
            <dl
              className={`grid gap-x-6 gap-y-3 ${isFixedStream ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}
            >
              <FieldItem
                label="对账周期"
                value={`${formatDate(rec.periodStart)} ~ ${formatDate(rec.periodEnd)}`}
              />
              {!isFixedStream && (
                <FieldItem
                  label="实际销售额"
                  value={`${commSym}${(isConfirmed ? (rec.finalSalesAmount ?? rec.actualSalesAmount) : rec.actualSalesAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                />
              )}
              {!isFixedStream && (
                <FieldItem
                  label="销售佣金比例"
                  value={`${(liveRate * 100).toFixed(2)}%`}
                />
              )}
              <div>
                <dt className="text-xs text-slate-400">
                  {isFixedStream ? "待支付固费金额" : "待支付销售佣金"}
                </dt>
                <dd className="mt-1 flex items-center gap-2">
                  <strong className="text-sm text-slate-800">
                    {isFixedStream
                      ? `${fixedSym}${rec.feeAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                      : `${commSym}${liveAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                  </strong>
                  {!isConfirmed && !readOnly && (
                    <select
                      className="h-7 rounded-md border border-[#dcd4e7] bg-white px-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      value={
                        (isFixedStream
                          ? rec.fixedFeeCurrency
                          : rec.commissionCurrency) || "人民币"
                      }
                      disabled={updatingCurrency}
                      onChange={(event) =>
                        updateCurrency(
                          isFixedStream
                            ? "fixedFeeCurrency"
                            : "commissionCurrency",
                          event.target.value,
                        )
                      }
                    >
                      <option>人民币</option>
                      <option>美金</option>
                    </select>
                  )}
                </dd>
              </div>
            </dl>
          </div>
          {/* ── 计算过程 ── */}
          {!isFixedStream && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                抽佣计算过程
              </p>
              <div className="rounded-lg bg-slate-50 p-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                {/* 合同数据 — 来自合同 v3 字段 */}
                <div className="col-span-full sm:col-span-1 space-y-2">
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    合同数据
                  </p>
                  <FieldItem
                    label="GMV佣金结算方式"
                    value={
                      rec.contract.commissionType
                        ? (COMMISSION_TYPE_LABELS[
                            rec.contract.commissionType
                          ] ?? rec.contract.commissionType)
                        : "—"
                    }
                  />

                  {/* FIXED → 抽佣比例 */}
                  {rec.contract.commissionType === "FIXED" && (
                    <FieldItem
                      label="抽佣比例"
                      value={rec.contract.commissionRate ?? "—"}
                    />
                  )}

                  {/* THRESHOLD → 门槛金额 + 抽佣比例 */}
                  {rec.contract.commissionType === "THRESHOLD" && (
                    <>
                      <FieldItem
                        label="GMV门槛金额"
                        value={
                          rec.contract.thresholdAmount
                            ? `${currencySymbol(rec.contract.thresholdCurrency ?? "人民币")}${rec.contract.thresholdAmount}`
                            : "—"
                        }
                      />
                      <FieldItem
                        label="抽佣比例"
                        value={rec.contract.commissionRate ?? "—"}
                      />
                    </>
                  )}

                  {/* TIERED → 阶梯规则 */}
                  {rec.contract.commissionType === "TIERED" && (
                    <FieldItem
                      label="阶梯规则"
                      value={
                        <span className="text-xs">
                          {formatTieredRules(rec.contract.tieredRules ?? null)}
                        </span>
                      }
                    />
                  )}

                  {/* EXCESS → 基准月数 + 增长服务佣金比例 */}
                  {rec.contract.commissionType === "EXCESS" && (
                    <>
                      <FieldItem
                        label="基准月数"
                        value={
                          rec.contract.excessBaseMonths
                            ? `${rec.contract.excessBaseMonths} 个月`
                            : "—"
                        }
                      />
                      <FieldItem
                        label="增长服务佣金比例"
                        value={
                          rec.contract.excessCommissionRate ??
                          rec.contract.commissionRate ??
                          "—"
                        }
                      />
                    </>
                  )}

                  {/* GMV 结算周期 */}
                  <FieldItem
                    label="结算周期"
                    value={
                      rec.contract.gmvSettlementCycle
                        ? `${rec.contract.gmvSettlementCycle}结算`
                        : "—"
                    }
                  />
                </div>

                {/* 实际数据 — 仅实际销售额 */}
                <div className="col-span-full sm:col-span-1 space-y-2">
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    实际数据
                  </p>
                  <FieldItem
                    label="实际销售额"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <span>
                          {isConfirmed
                            ? `${commSym}${rec.finalSalesAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}`
                            : `${commSym}${rec.actualSalesAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                        </span>
                        {!isConfirmed && !readOnly && (
                          <select
                            className="h-6 rounded border border-slate-200 px-1 text-xs text-slate-600"
                            value={rec.commissionCurrency || "人民币"}
                            disabled={updatingCurrency}
                            onChange={(e) =>
                              updateCurrency(
                                "commissionCurrency",
                                e.target.value,
                              )
                            }
                          >
                            <option>人民币</option>
                            <option>美金</option>
                          </select>
                        )}
                      </span>
                    }
                  />
                  {/* EXCESS 模式：GMV 基准值手动填写 */}
                  {rec.contract.commissionType === "EXCESS" && (
                    <GmvBaselineField
                      rec={rec}
                      readOnly={readOnly}
                      onRefresh={onRefresh}
                    />
                  )}
                  {/* 从 BI 拉取按钮（仅 DRAFT 可点） */}
                  {isDraft && !readOnly && !isFixedStream && (
                    <button
                      onClick={pullBiData}
                      disabled={pulling}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {pulling ? "拉取中…" : "从 BI 拉取"}
                    </button>
                  )}
                </div>

                {/* 计算结果 — 当期抽佣比例 + 抽佣金额公式（v3 逻辑，实时计算） */}
                <div className="col-span-full sm:col-span-1 space-y-2">
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    计算结果
                  </p>
                  <FieldItem
                    label="当期抽佣比例"
                    value={`${(liveRate * 100).toFixed(2)}%`}
                  />
                  <FieldItem
                    label="抽佣金额公式"
                    value={
                      <span className="text-xs text-slate-500 whitespace-pre-wrap">
                        {buildFormulaText(rec, commSym, liveRate, liveAmount)}
                      </span>
                    }
                  />
                  <FieldItem
                    label="待支付抽佣金额"
                    value={
                      <strong className="text-sm text-slate-800">
                        {commSym}
                        {liveAmount.toLocaleString("zh-CN", {
                          minimumFractionDigits: 2,
                        })}
                      </strong>
                    }
                  />
                  {liveCalc.note && (
                    <p className="text-xs text-amber-600">{liveCalc.note}</p>
                  )}
                </div>

                {/* CONFIRMED: 终版锁定数据 */}
                {isConfirmed && (
                  <div className="col-span-full rounded-lg bg-emerald-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-800">
                      ✅ 终版对账数据（已锁定）
                    </p>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                      <span className="text-slate-600">
                        单量：<strong>{rec.finalOrders ?? "—"}</strong>
                      </span>
                      <span className="text-slate-600">
                        销售额：
                        <strong>
                          {commSym}
                          {rec.finalSalesAmount?.toLocaleString("zh-CN", {
                            minimumFractionDigits: 2,
                          }) ?? "—"}
                        </strong>
                      </span>
                      <span className="text-slate-600">
                        抽佣：
                        <strong>
                          {commSym}
                          {rec.finalCommissionAmount?.toLocaleString("zh-CN", {
                            minimumFractionDigits: 2,
                          }) ?? "—"}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 工作流按钮 ── */}
          {!isConfirmed && !readOnly && canOperateRecord && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {isDraft && (
                <>
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    className="btn-primary text-sm"
                  >
                    提交对账
                  </button>
                </>
              )}
              {(isPendingReview || isDisputed) && (
                <>
                  <button
                    onClick={() => {
                      setReviewAction("APPROVED");
                      setShowReviewModal(true);
                    }}
                    className="btn-primary text-sm"
                  >
                    ✅ 无异议确认
                  </button>
                  {!isFixedStream && (
                    <button
                      onClick={() => {
                        setReviewAction("DISPUTED");
                        setShowReviewModal(true);
                      }}
                      className="btn-secondary text-sm text-rose-600"
                    >
                      销售额有异议
                    </button>
                  )}
                </>
              )}
              {isDisputed && rec.submittedById === currentUserId && (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="btn-primary text-sm"
                >
                  最终确认
                </button>
              )}
              {isPendingReview && rec.submittedToUser && (
                <span className="text-xs text-slate-400 self-center">
                  已提交给 {rec.submittedToUser.name}
                  {rec.submittedDeadline &&
                    `，截止 ${formatDate(rec.submittedDeadline)}`}
                </span>
              )}
            </div>
          )}

          {/* ── 对账记录 ── */}
          {rec.reviews.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                对账记录
              </p>
              <div className="space-y-3">
                {rec.reviews.map((r) => (
                  <div key={r.id} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {r.reviewer.name.slice(0, 1)}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {r.reviewer.name}
                        </span>
                        <Badge
                          className={
                            REVIEW_ACTION_COLORS[r.action] + " text-xs"
                          }
                        >
                          {REVIEW_ACTION_LABELS[r.action] ?? r.action}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {formatDateTime(r.createdAt)}
                        </span>
                      </div>
                      {r.disputedSalesAmount != null && (
                        <div className="mt-1 text-sm text-rose-600">
                          纠正后销售额：{commSym}
                          {r.disputedSalesAmount.toLocaleString("zh-CN", {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      )}
                      {r.note && (
                        <p className="mt-0.5 text-sm text-slate-500">
                          {r.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Invoice 与收款状态（自动回传，只读） ── */}
          {isConfirmed && (
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs font-semibold text-slate-500">
                开票与收款状态
              </p>
              <InvoiceSettlementState
                state={invoiceState}
                reconciliationId={rec.id}
                scopeAll={scopeAll}
              />
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showSubmitModal && !readOnly && (
        <BatchSubmitModal
          records={[rec]}
          users={users}
          scopeAll={scopeAll}
          defaultTargetId={rec.submittedToUserId ?? ""}
          onClose={() => setShowSubmitModal(false)}
          onDone={() => {
            setShowSubmitModal(false);
            onRefresh();
          }}
        />
      )}
      {showReviewModal && !readOnly && (
        <ReviewModal
          recId={rec.id}
          action={reviewAction}
          defaultCurrency={rec.commissionCurrency || "人民币"}
          onClose={() => setShowReviewModal(false)}
          onDone={() => {
            setShowReviewModal(false);
            onRefresh();
          }}
        />
      )}
      {showConfirmModal && !readOnly && (
        <ConfirmModal
          recId={rec.id}
          onClose={() => setShowConfirmModal(false)}
          onDone={() => {
            setShowConfirmModal(false);
            onRefresh();
          }}
        />
      )}

      {/* 删除月度对账确认 */}
      {showDeleteModal && canManage && (
        <Modal
          open
          onClose={() => setShowDeleteModal(false)}
          title="确认删除该月度对账？"
          size="sm"
          closeOnBackdrop={!deleting}
          closeOnEscape={!deleting}
          footer={
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                disabled={deleting}
                onClick={deleteRecord}
              >
                {deleting ? "删除中…" : "确认删除"}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              即将删除 <strong>{formatDate(rec.periodStart)}</strong> ~{" "}
              <strong>{formatDate(rec.periodEnd)}</strong>{" "}
              这条月度对账记录（当前状态：
              <Badge
                className={
                  (RECONCILIATION_STATUS_COLORS[rec.status] ?? "") + " ml-1"
                }
              >
                {RECONCILIATION_STATUS_LABELS[rec.status] ?? rec.status}
              </Badge>
              ）。
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              💡 删除后可在财务对账列表的「已删除」Tab 中找回，
              <strong>7 天内可恢复</strong>，超期将自动永久清理。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 结算卡片 ──────────────────────────────────────────────────────────────────
function InvoiceSettlementState({
  state,
  reconciliationId,
  scopeAll,
}: {
  state?: ReconciliationInvoiceState;
  reconciliationId: string;
  scopeAll: boolean;
}) {
  if (!state) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">尚未关联 Invoice</p>
        <p className="hidden">
          对账确认后系统会自动创建 Invoice
          草稿，状态将从「开票与收款」自动回传。
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {"\u4e0b\u4e00\u6b65\uff1a\u5f00\u5177 Invoice"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {
                "\u5f53\u524d\u5bf9\u8d26\u5df2\u786e\u8ba4\uff0c\u5c1a\u672a\u5173\u8054\u6b63\u5f0f Invoice\u3002\u5f00\u5177\u540e\uff0c\u5f00\u7968\u4e0e\u6536\u6b3e\u72b6\u6001\u4f1a\u81ea\u52a8\u56de\u4f20\u3002"
              }
            </p>
          </div>
          <Link
            href={`/invoices/new?reconciliationIds=${encodeURIComponent(reconciliationId)}${scopeAll ? "&scope=all" : ""}`}
            className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {"\u5f00\u5177 Invoice"}
          </Link>
        </div>
      </div>
    );
  }

  const invoiceLabels: Record<string, string> = {
    DRAFT: "Invoice 草稿",
    ISSUED: "已开具",
    VOID: "已作废",
  };
  const receivableLabels: Record<string, string> = {
    PENDING: "待收款",
    PARTIAL: "部分收款",
    RECEIVED: "已收款",
    OVERDUE: "已逾期",
    CANCELLED: "已取消",
  };
  const received = state.receivedAmount ?? 0;
  const outstanding = Math.max(0, state.totalAmount - received);

  return (
    <div className="rounded-lg border border-[#e7e0ef] bg-[#faf8ff] px-4 py-3">
      {state.invoiceStatus === "DRAFT" && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#dcd4e7] bg-white px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {"Invoice \u8349\u7a3f\u5f85\u6b63\u5f0f\u5f00\u5177"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {
                "\u8349\u7a3f\u5df2\u4fdd\u7559\uff0c\u8bf7\u6838\u5bf9\u5185\u5bb9\u540e\u6b63\u5f0f\u5f00\u5177\u3002"
              }
            </p>
          </div>
          <Link
            href={`/invoices/${state.invoiceId}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {"\u6253\u5f00\u8349\u7a3f"}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">关联 Invoice</p>
          <Link
            href={`/invoices/${state.invoiceId}`}
            className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            {state.invoiceNo}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-violet-100 text-violet-700">
            {invoiceLabels[state.invoiceStatus] ?? state.invoiceStatus}
          </Badge>
          <Badge
            className={
              state.receivableStatus === "RECEIVED"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }
          >
            {state.receivableStatus
              ? (receivableLabels[state.receivableStatus] ??
                state.receivableStatus)
              : "尚未生成应收"}
          </Badge>
        </div>
      </div>
      <dl className="mt-3 grid gap-3 border-t border-[#e7e0ef] pt-3 sm:grid-cols-3">
        <FieldItem
          label="Invoice 金额"
          value={state.totalAmount.toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
          })}
        />
        <FieldItem
          label="已收金额"
          value={received.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        />
        <FieldItem
          label="待收金额"
          value={outstanding.toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
          })}
        />
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        状态由 Invoice 与应收账款自动同步，本页不可手工修改。
      </p>
    </div>
  );
}

function BatchSubmitModal({
  records,
  users,
  scopeAll,
  defaultTargetId = "",
  onClose,
  onDone,
}: {
  records: Rec[];
  users: User[];
  scopeAll: boolean;
  defaultTargetId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [submitMode, setSubmitMode] = useState<
    "CUSTOMER_REVIEW" | "SKIP_CUSTOMER"
  >("CUSTOMER_REVIEW");
  const [submittedToUserId, setSubmittedToUserId] = useState(defaultTargetId);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [decisions, setDecisions] = useState<
    Record<string, "APPROVED" | "DISPUTED">
  >(() => Object.fromEntries(records.map((record) => [record.id, "APPROVED"])));
  const [correctedSalesAmounts, setCorrectedSalesAmounts] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(false);
  const single = records.length === 1;

  function setDecision(record: Rec, decision: "APPROVED" | "DISPUTED") {
    if (record.reconcileType === "FEE_ONLY" && decision === "DISPUTED") return;
    setDecisions((current) => ({ ...current, [record.id]: decision }));
  }

  async function submit() {
    if (submitMode === "CUSTOMER_REVIEW" && !submittedToUserId) {
      alert("提交客户确认时必须选择提交人");
      return;
    }
    if (submitMode === "SKIP_CUSTOMER") {
      const missingCorrection = records.find(
        (record) =>
          decisions[record.id] === "DISPUTED" &&
          !correctedSalesAmounts[record.id]?.trim(),
      );
      if (missingCorrection) {
        alert(
          `请填写 ${formatDate(missingCorrection.periodStart)} 对账记录纠正后的销售额`,
        );
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/finance/reconciliations/batch-submit${scopeAll ? "?scope=all" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reconciliationIds: records.map((record) => record.id),
            submitMode,
            submittedToUserId:
              submitMode === "CUSTOMER_REVIEW" ? submittedToUserId : undefined,
            submittedDeadline:
              submitMode === "CUSTOMER_REVIEW" && deadline
                ? deadline
                : undefined,
            note: note || undefined,
            decisions:
              submitMode === "SKIP_CUSTOMER"
                ? records.map((record) => ({
                    reconciliationId: record.id,
                    decision: decisions[record.id] ?? "APPROVED",
                    correctedSalesAmount:
                      decisions[record.id] === "DISPUTED"
                        ? Number(correctedSalesAmounts[record.id])
                        : undefined,
                  }))
                : undefined,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(
          payload.error ?? `${single ? "提交" : "批量提交"}失败，请稍后重试`,
        );
        return;
      }
      onDone();
    } catch (error) {
      console.error("Submit reconciliations failed", error);
      alert("网络连接异常，提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={single ? "提交对账" : `提交 ${records.length} 条对账`}
      description="选择客户确认流程，或由内部人员核实后跳过客户确认。"
      size="md"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="label">提交方式</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${submitMode === "CUSTOMER_REVIEW" ? "border-brand-500 bg-brand-50" : "border-[#dcd4e7] bg-white hover:bg-slate-50"}`}
            >
              <input
                type="radio"
                name="submitMode"
                value="CUSTOMER_REVIEW"
                checked={submitMode === "CUSTOMER_REVIEW"}
                onChange={() => setSubmitMode("CUSTOMER_REVIEW")}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-slate-900">
                提交客户确认
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                指定提交人，由对方确认销售额或提出异议。
              </span>
            </label>
            <label
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${submitMode === "SKIP_CUSTOMER" ? "border-brand-500 bg-brand-50" : "border-[#dcd4e7] bg-white hover:bg-slate-50"}`}
            >
              <input
                type="radio"
                name="submitMode"
                value="SKIP_CUSTOMER"
                checked={submitMode === "SKIP_CUSTOMER"}
                onChange={() => setSubmitMode("SKIP_CUSTOMER")}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-slate-900">
                跳过客户确认
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                内部直接核实，每条记录仍须确认无异议或填写纠正销售额。
              </span>
            </label>
          </div>
        </fieldset>

        {submitMode === "CUSTOMER_REVIEW" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">
                提交给 <span className="text-rose-600">*</span>
              </label>
              <select
                className="input"
                value={submittedToUserId}
                onChange={(event) => setSubmittedToUserId(event.target.value)}
              >
                <option value="">请选择提交人</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.role === "BRAND"
                      ? " [品牌方]"
                      : user.role === "CHANNEL"
                        ? " [渠道商]"
                        : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">截止时间（可选）</label>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">逐条核实结果</p>
            {records.map((record) => {
              const fixedFee = record.reconcileType === "FEE_ONLY";
              const disputed = decisions[record.id] === "DISPUTED";
              const symbol = currencySymbol(
                record.commissionCurrency || "人民币",
              );
              return (
                <div
                  key={record.id}
                  className="rounded-lg border border-[#e7e0ef] bg-[#faf8ff] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {fixedFee ? "固费" : "销售佣金"} ·{" "}
                        {formatDate(record.periodStart)} ~{" "}
                        {formatDate(record.periodEnd)}
                      </p>
                      {!fixedFee && (
                        <p className="mt-1 text-xs text-slate-600">
                          当前销售额 {symbol}
                          {record.actualSalesAmount.toLocaleString("zh-CN", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={
                          disputed
                            ? "btn-secondary btn-sm"
                            : "btn-primary btn-sm"
                        }
                        onClick={() => setDecision(record, "APPROVED")}
                      >
                        确认无异议
                      </button>
                      {!fixedFee && (
                        <button
                          type="button"
                          className={
                            disputed
                              ? "btn-primary btn-sm"
                              : "btn-secondary btn-sm"
                          }
                          onClick={() => setDecision(record, "DISPUTED")}
                        >
                          销售额有异议
                        </button>
                      )}
                    </div>
                  </div>
                  {disputed && !fixedFee && (
                    <div className="mt-3 max-w-sm">
                      <label className="label">
                        纠正后的销售额 <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                          {symbol}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="input pl-7"
                          value={correctedSalesAmounts[record.id] ?? ""}
                          onChange={(event) =>
                            setCorrectedSalesAmounts((current) => ({
                              ...current,
                              [record.id]: event.target.value,
                            }))
                          }
                          placeholder="输入核实后的销售额"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div>
          <label className="label">备注（可选）</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录本次提交或核实说明"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={loading}
          >
            {loading
              ? "处理中…"
              : submitMode === "SKIP_CUSTOMER"
                ? "确认并完成对账"
                : "提交客户确认"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
// ── Review Modal ──────────────────────────────────────────────────────────────
function ReviewModal({
  recId,
  action,
  defaultCurrency,
  onClose,
  onDone,
}: {
  recId: string;
  action: "APPROVED" | "DISPUTED";
  defaultCurrency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [correctedSalesAmount, setCorrectedSalesAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const body: Record<string, unknown> = { action, note };
    if (action === "DISPUTED") {
      if (!correctedSalesAmount.trim()) {
        alert("请填写纠正后的销售额");
        setLoading(false);
        return;
      }
      body.correctedSalesAmount = Number(correctedSalesAmount);
    }
    const res = await fetch(`/api/finance/reconciliations/${recId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "操作失败");
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={action === "APPROVED" ? "确认对账" : "提出异议"}
      description={
        action === "DISPUTED"
          ? "销售数据如有差异，请填写核实后应采用的销售额。"
          : undefined
      }
      size="sm"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
    >
      <div className="space-y-4">
        {action === "DISPUTED" && (
          <div>
            <label className="label">
              纠正后的销售额 <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                {currencySymbol(defaultCurrency)}
              </span>
              <input
                type="number"
                className="input pl-7"
                placeholder="输入核实后应采用的销售额"
                value={correctedSalesAmount}
                onChange={(e) => setCorrectedSalesAmount(e.target.value)}
                min={0}
                step="0.01"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              币种沿用当前对账记录，不在异议环节修改。
            </p>
          </div>
        )}
        <div>
          <label className="label">备注（可选）</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="说明意见"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className={
              action === "APPROVED"
                ? "btn-primary"
                : "btn-primary bg-rose-600 hover:bg-rose-700"
            }
          >
            {loading
              ? "处理中…"
              : action === "APPROVED"
                ? "确认无异议"
                : "提交异议"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  recId,
  onClose,
  onDone,
}: {
  recId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch(`/api/finance/reconciliations/${recId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setLoading(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "确认失败");
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="最终确认对账"
      description="确认后将锁定数据并生成结算记录，不可修改"
      size="sm"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
    >
      <div className="space-y-4">
        <div>
          <label className="label">备注（可选）</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? "确认中…" : "最终确认"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── 新建月度对账 Modal ─────────────────────────────────────────────────────────
function NewMonthlyModal({
  customerId,
  contractId,
  reconcileType,
  onClose,
  onCreated,
}: {
  customerId: string;
  contractId: string;
  reconcileType: "FEE_ONLY" | "COMMISSION_ONLY";
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    try {
      const res = await fetch("/api/finance/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          contractId,
          periodStart,
          periodEnd,
          reconcileType,
        }),
      });
      if (!res.ok) {
        alert((await res.json()).error ?? "创建失败");
        return;
      }
      const created = await res.json();
      onCreated(created.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={reconcileType === "FEE_ONLY" ? "新建固费对账" : "新建销售佣金对账"}
      description={
        reconcileType === "FEE_ONLY"
          ? "选择固费服务周期，固费将独立审核和结算"
          : "选择销售归属周期，销售数据和佣金将独立审核和结算"
      }
      size="sm"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          对账类型：{reconcileType === "FEE_ONLY" ? "固费" : "销售佣金"}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">对账开始日期 *</label>
            <input
              type="date"
              className="input"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">对账结束日期 *</label>
            <input
              type="date"
              className="input"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "创建中…" : "创建"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────
function FieldItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value || "—"}</dd>
    </div>
  );
}

// ── GMV 基准值字段（EXCESS 模式手动填写）─────────────────────────────────────
function GmvBaselineField({
  rec,
  readOnly,
  onRefresh,
}: {
  rec: Rec;
  readOnly: boolean;
  onRefresh: () => void;
}) {
  const [value, setValue] = useState(
    rec.gmvBaseline != null ? String(rec.gmvBaseline) : "",
  );
  const [saving, setSaving] = useState(false);
  const editable = !readOnly && rec.status === "DRAFT";

  async function save() {
    if (readOnly) return;
    const num = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(num)) {
      alert("请输入有效数字");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/reconciliations/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmvBaseline: num }),
      });
      if (!res.ok) {
        alert((await res.json()).error ?? "保存失败");
        return;
      }
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <dt className="text-xs text-slate-400">GMV 基准值</dt>
      <dd className="mt-1 flex items-center gap-2">
        <input
          type="number"
          className="h-7 w-32 rounded border border-slate-200 px-2 text-sm text-slate-700 disabled:bg-slate-50"
          placeholder="如 50000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable || saving}
        />
        {editable && (
          <button
            type="button"
            className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-40"
            disabled={saving}
            onClick={save}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        )}
      </dd>
    </div>
  );
}

// ── 抽佣金额公式文字（接受 live 计算结果） ───────────────────────────────────
function buildFormulaText(
  rec: Rec,
  sym: string,
  liveRate: number,
  liveAmount: number,
): string {
  const ct = rec.contract.commissionType ?? "FIXED";
  const sales = rec.actualSalesAmount;
  const ratePct = `${(liveRate * 100).toFixed(2)}%`;
  const salesStr = `${sym}${sales.toLocaleString("zh-CN", { minimumFractionDigits: 0 })}`;
  const amtStr = `${sym}${liveAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;

  if (ct === "EXCESS") {
    const baseline = rec.gmvBaseline ?? 0;
    const baselineStr = `${sym}${baseline.toLocaleString("zh-CN", { minimumFractionDigits: 0 })}`;
    const excess = sales - baseline;
    if (baseline <= 0) return "请先填写 GMV 基准值";
    return `(${salesStr} − ${baselineStr}) × ${ratePct} = ${amtStr}${excess < 0 ? "（差额 < 0，记为 0）" : ""}`;
  }

  if (ct === "THRESHOLD" && liveRate === 0) {
    return `未达 GMV 门槛 → 抽佣比例 0%，待支付 ${amtStr}`;
  }

  return `${ratePct} × ${salesStr} = ${amtStr}`;
}
