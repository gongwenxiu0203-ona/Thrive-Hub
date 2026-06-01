"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  REVIEW_ACTION_LABELS,
  REVIEW_ACTION_COLORS,
  COMMISSION_TYPE_LABELS,
  CONTRACT_REVIEW_GROUPS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import { calcCommission } from "@/lib/commissionCalc";

// ── types ──────────────────────────────────────────────────────────────────────

type Review = {
  id: string;
  action: string;
  disputedOrders: number | null;
  disputedSalesAmount: number | null;
  note: string | null;
  createdAt: Date | string;
  reviewer: { id: string; name: string };
};

type Settlement = {
  id: string;
  type: string;
  amount: number;
  status: string;
  estimatedDate: Date | string | null;
  actualDate: Date | string | null;
  reminderSent: boolean;
  note: string | null;
  createdBy: { id: string; name: string };
};

type Rec = {
  id: string;
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
  settlements: Settlement[];
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
};

// ── currency symbol ───────────────────────────────────────────────────────────
function currencySymbol(c: string) {
  return c === "美金" ? "$" : "¥";
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
      .map(
        (t: { from: string; to: string; rate: string }, i: number) => {
          if (i === 0) return `0-${sym}${t.to} → ${t.rate}`;
          if (t.to) return `${sym}${t.from}-${sym}${t.to} → ${t.rate}`;
          return `${sym}${t.from} 及以上 → ${t.rate}`;
        },
      )
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
}: Props) {
  const [showNewModal, setShowNewModal] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {/* ── 基本信息 ── */}
      <BasicInfoSection customer={customer} contract={contract} />

      {/* ── 月度对账 ── */}
      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">月度对账</h2>
          {contract && (
            <button
              className="btn-primary text-sm"
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="h-4 w-4" /> 新建月度对账
            </button>
          )}
        </div>

        {reconciliations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-2 text-3xl">📭</div>
            <p className="text-slate-400 text-sm">暂无对账记录，点击「新建月度对账」开始</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reconciliations.map((rec, idx) => (
              <MonthlyRecordRow
                key={rec.id}
                rec={rec}
                defaultOpen={idx === 0}
                currentUserId={currentUserId}
                users={users}
                onRefresh={() => startTransition(() => router.refresh())}
              />
            ))}
          </div>
        )}
      </section>

      {/* 新建月度对账 Modal */}
      {showNewModal && contract && (
        <NewMonthlyModal
          customerId={customer.id}
          contractId={contract.id}
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            startTransition(() => router.refresh());
            void id;
          }}
        />
      )}
    </div>
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
    commissionType: ct ? COMMISSION_TYPE_LABELS[ct] ?? ct : "",
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
              customer.businessOwner?.email ||
              customer.contactEmail ||
              "—"
            }
          />
          <FieldItem
            label="联系电话"
            value={customer.contactPhone ?? "—"}
          />
        </div>
      </div>
    </section>
  );
}

// ── 月度对账行 ────────────────────────────────────────────────────────────────
function MonthlyRecordRow({
  rec,
  defaultOpen,
  currentUserId,
  users,
  onRefresh,
}: {
  rec: Rec;
  defaultOpen: boolean;
  currentUserId: string;
  users: User[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [pulling, setPulling] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<"APPROVED" | "DISPUTED">(
    "APPROVED"
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [updatingCurrency, setUpdatingCurrency] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDraft = rec.status === "DRAFT";
  const isPendingReview = rec.status === "PENDING_REVIEW";
  const isDisputed = rec.status === "DISPUTED";
  const isConfirmed = rec.status === "CONFIRMED";

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
      ? rec.finalSalesAmount ?? rec.actualSalesAmount
      : rec.actualSalesAmount,
  });
  const liveRate = liveCalc.actualCommissionRate;
  const liveAmount = liveCalc.commissionAmount;

  async function pullBiData() {
    setPulling(true);
    try {
      const res = await fetch(
        `/api/finance/reconciliations/${rec.id}/pull-bi`,
        { method: "POST" }
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

  async function updateCurrency(field: "fixedFeeCurrency" | "commissionCurrency", value: string) {
    setUpdatingCurrency(true);
    try {
      await fetch(`/api/finance/reconciliations/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      onRefresh();
    } finally {
      setUpdatingCurrency(false);
    }
  }

  async function deleteRecord() {
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
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* 折叠标题行 */}
      <div className="flex w-full items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="flex-1 flex items-center gap-3 flex-wrap text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="font-medium text-slate-900">
            {formatDate(rec.periodStart)} ~ {formatDate(rec.periodEnd)}
          </span>
          <Badge className={RECONCILIATION_STATUS_COLORS[rec.status]}>
            {RECONCILIATION_STATUS_LABELS[rec.status] ?? rec.status}
          </Badge>
          {rec.reconcileType && rec.reconcileType !== "BOTH" && (
            <Badge className="bg-indigo-50 text-indigo-600">
              {rec.reconcileType === "FEE_ONLY" ? "仅固费" : "仅佣金"}
            </Badge>
          )}
          {rec.reconcileType !== "COMMISSION_ONLY" && (
            <span className="text-sm text-slate-500">
              固费 {fixedSym}
              {rec.feeAmount.toLocaleString()}
            </span>
          )}
          <span className="text-sm text-slate-500">
            抽佣 {commSym}
            {rec.commissionAmount.toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
            })}
          </span>
          {rec.submittedDeadline && !isConfirmed && (
            <span className="text-xs text-amber-600">
              截止 {formatDate(rec.submittedDeadline)}
            </span>
          )}
        </button>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          title="删除该月度对账"
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
          {/* ── 对账数据 ── */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              对账数据
            </p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <FieldItem
                label="对账起始时间"
                value={`${formatDate(rec.periodStart)} ~ ${formatDate(rec.periodEnd)}`}
              />

              {/* 待支付固费 + 货币选择 */}
              <div>
                <dt className="text-xs text-slate-400">待支付固费金额</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-700">
                    {rec.feeAmount > 0
                      ? `${fixedSym}${rec.feeAmount.toLocaleString()}`
                      : "—"}
                  </span>
                  {!isConfirmed && (
                    <select
                      className="h-6 rounded border border-slate-200 px-1 text-xs text-slate-600"
                      value={rec.fixedFeeCurrency || "人民币"}
                      disabled={updatingCurrency}
                      onChange={(e) =>
                        updateCurrency("fixedFeeCurrency", e.target.value)
                      }
                    >
                      <option>人民币</option>
                      <option>美金</option>
                    </select>
                  )}
                </dd>
              </div>

              {/* 待支付抽佣 + 货币选择 */}
              <div>
                <dt className="text-xs text-slate-400">待支付抽佣金额</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-700">
                    {commSym}
                    {rec.commissionAmount.toLocaleString("zh-CN", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  {!isConfirmed && (
                    <select
                      className="h-6 rounded border border-slate-200 px-1 text-xs text-slate-600"
                      value={rec.commissionCurrency || "人民币"}
                      disabled={updatingCurrency}
                      onChange={(e) =>
                        updateCurrency("commissionCurrency", e.target.value)
                      }
                    >
                      <option>人民币</option>
                      <option>美金</option>
                    </select>
                  )}
                </dd>
              </div>
            </div>
          </div>

          {/* ── 计算过程 ── */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              抽佣计算过程
            </p>
            <div className="rounded-lg bg-slate-50 p-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {/* 合同数据 — 来自合同 v3 字段 */}
              <div className="col-span-full sm:col-span-1 space-y-2">
                <p className="text-xs font-medium text-slate-500 mb-1">合同数据</p>
                <FieldItem
                  label="GMV佣金结算方式"
                  value={
                    rec.contract.commissionType
                      ? COMMISSION_TYPE_LABELS[rec.contract.commissionType] ??
                        rec.contract.commissionType
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
                <p className="text-xs font-medium text-slate-500 mb-1">实际数据</p>
                <FieldItem
                  label="实际销售额"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span>
                        {isConfirmed
                          ? `${commSym}${rec.finalSalesAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}`
                          : `${commSym}${rec.actualSalesAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                      </span>
                      {!isConfirmed && (
                        <select
                          className="h-6 rounded border border-slate-200 px-1 text-xs text-slate-600"
                          value={rec.commissionCurrency || "人民币"}
                          disabled={updatingCurrency}
                          onChange={(e) =>
                            updateCurrency("commissionCurrency", e.target.value)
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
                  <GmvBaselineField rec={rec} onRefresh={onRefresh} />
                )}
                {/* 从 BI 拉取按钮（仅 DRAFT 可点） */}
                {isDraft && (
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
                <p className="text-xs font-medium text-slate-500 mb-1">计算结果</p>
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
                        {commSym}{rec.finalSalesAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}
                      </strong>
                    </span>
                    <span className="text-slate-600">
                      抽佣：
                      <strong>
                        {commSym}{rec.finalCommissionAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 工作流按钮 ── */}
          {!isConfirmed && (
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
                  <button
                    onClick={() => {
                      setReviewAction("DISPUTED");
                      setShowReviewModal(true);
                    }}
                    className="btn-secondary text-sm text-rose-600"
                  >
                    ⚠️ 提出异议
                  </button>
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
                  {rec.submittedDeadline && `，截止 ${formatDate(rec.submittedDeadline)}`}
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
                      {(r.disputedOrders != null ||
                        r.disputedSalesAmount != null) && (
                        <div className="mt-1 text-sm text-rose-600">
                          己方数据：单量 {r.disputedOrders ?? "—"} · 销售额{" "}
                          {commSym}
                          {r.disputedSalesAmount?.toLocaleString("zh-CN", {
                            minimumFractionDigits: 2,
                          }) ?? "—"}
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

          {/* ── 结算状态（CONFIRMED后） ── */}
          {isConfirmed && rec.settlements.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                结算状态
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rec.settlements.map((s) => (
                  <SettlementCard
                    key={s.id}
                    settlement={s}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showSubmitModal && (
        <SubmitModal
          recId={rec.id}
          users={users}
          defaultTargetId={rec.submittedToUserId ?? ""}
          onClose={() => setShowSubmitModal(false)}
          onDone={() => {
            setShowSubmitModal(false);
            onRefresh();
          }}
        />
      )}
      {showReviewModal && (
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
      {showConfirmModal && (
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
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-rose-600">
                确认删除该月度对账？
              </h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
              <p>
                即将删除 <strong>{formatDate(rec.periodStart)}</strong> ~{" "}
                <strong>{formatDate(rec.periodEnd)}</strong> 这条月度对账记录（当前状态：
                <Badge
                  className={
                    (RECONCILIATION_STATUS_COLORS[rec.status] ?? "") +
                    " ml-1"
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
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 结算卡片 ──────────────────────────────────────────────────────────────────
function SettlementCard({
  settlement,
  onRefresh,
}: {
  settlement: Settlement;
  onRefresh: () => void;
}) {
  const typeLabels: Record<string, string> = {
    FIXED_FEE: "固费结算",
    COMMISSION: "佣金结算",
  };
  const [estimated, setEstimated] = useState(
    settlement.estimatedDate
      ? new Date(settlement.estimatedDate).toISOString().slice(0, 10)
      : ""
  );
  const [actual, setActual] = useState(
    settlement.actualDate
      ? new Date(settlement.actualDate).toISOString().slice(0, 10)
      : ""
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/finance/settlements/${settlement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estimatedDate: estimated || null,
        actualDate: actual || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "更新失败");
      return;
    }
    onRefresh();
  }

  const isSettled = settlement.status === "SETTLED";

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-800">
          {typeLabels[settlement.type] ?? settlement.type}
          <span className="ml-2 font-semibold">
            ¥{settlement.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </span>
        </span>
        <Badge className={SETTLEMENT_STATUS_COLORS[settlement.status]}>
          {SETTLEMENT_STATUS_LABELS[settlement.status] ?? settlement.status}
        </Badge>
      </div>
      {!isSettled ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="label text-xs">预计结算时间</label>
            <input
              type="date"
              className="input h-8 text-xs"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">实际结算时间</label>
            <input
              type="date"
              className="input h-8 text-xs"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
            {actual && (
              <p className="mt-0.5 text-xs text-emerald-600">
                填写后自动标记已结算
              </p>
            )}
          </div>
          <div className="col-span-full flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="btn-secondary text-xs"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          实际结算：{formatDate(settlement.actualDate)}
        </p>
      )}
    </div>
  );
}

// ── Submit Modal ──────────────────────────────────────────────────────────────
function SubmitModal({
  recId,
  users,
  defaultTargetId,
  onClose,
  onDone,
}: {
  recId: string;
  users: User[];
  defaultTargetId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [submittedToUserId, setSubmittedToUserId] = useState(defaultTargetId);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch(
      `/api/finance/reconciliations/${recId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submittedToUserId: submittedToUserId || undefined,
          submittedDeadline: deadline || undefined,
          note,
        }),
      }
    );
    setLoading(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "提交失败");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">提交对账</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            选择需要确认数据的对方联系人
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="label">提交给</label>
            <select
              className="input"
              value={submittedToUserId}
              onChange={(e) => setSubmittedToUserId(e.target.value)}
            >
              <option value="">（不指定）</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.role === "BRAND" ? " [品牌方]" : u.role === "CHANNEL" ? " [渠道商]" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">截止时间</label>
            <input
              type="date"
              className="input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div>
            <label className="label">备注（可选）</label>
            <textarea
              className="input resize-none"
              rows={2}
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
              className="btn-primary"
            >
              {loading ? "提交中…" : "提交对账"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const [disputedOrders, setDisputedOrders] = useState("");
  const [disputedSalesAmount, setDisputedSalesAmount] = useState("");
  const [salesCurrency, setSalesCurrency] = useState(defaultCurrency);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const body: Record<string, unknown> = { action, note };
    if (action === "DISPUTED") {
      if (disputedOrders) body.disputedOrders = Number(disputedOrders);
      if (disputedSalesAmount) {
        body.disputedSalesAmount = Number(disputedSalesAmount);
        body.salesAmountCurrency = salesCurrency;
      }
    }
    const res = await fetch(
      `/api/finance/reconciliations/${recId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    setLoading(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "操作失败");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {action === "APPROVED" ? "✅ 确认对账" : "⚠️ 提出异议"}
          </h2>
          {action === "DISPUTED" && (
            <p className="mt-0.5 text-sm text-slate-500">
              请填入己方核实数据，单量和销售额可分别有异议
            </p>
          )}
        </div>
        <div className="space-y-4 px-6 py-5">
          {action === "DISPUTED" && (
            <>
              <div>
                <label className="label">己方实际单量（有异议时填写）</label>
                <input
                  type="number"
                  className="input"
                  placeholder="输入己方单量"
                  value={disputedOrders}
                  onChange={(e) => setDisputedOrders(e.target.value)}
                  min={0}
                />
              </div>
              <div>
                <label className="label">己方实际销售额（有异议时填写）</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                      {salesCurrency === "美金" ? "$" : "¥"}
                    </span>
                    <input
                      type="number"
                      className="input pl-7"
                      placeholder="输入己方销售额"
                      value={disputedSalesAmount}
                      onChange={(e) => setDisputedSalesAmount(e.target.value)}
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <select
                    className="input w-24"
                    value={salesCurrency}
                    onChange={(e) => setSalesCurrency(e.target.value)}
                  >
                    <option value="人民币">人民币</option>
                    <option value="美金">美金</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  选择对应货币，会同步更新对账记录的抽佣货币
                </p>
              </div>
            </>
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
      </div>
    </div>
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
    const res = await fetch(
      `/api/finance/reconciliations/${recId}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      }
    );
    setLoading(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "确认失败");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">最终确认对账</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            确认后将锁定数据并生成结算记录，不可修改
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
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
      </div>
    </div>
  );
}

// ── 新建月度对账 Modal ─────────────────────────────────────────────────────────
function NewMonthlyModal({
  customerId,
  contractId,
  onClose,
  onCreated,
}: {
  customerId: string;
  contractId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reconcileType, setReconcileType] = useState("BOTH");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">新建月度对账</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            只需选择对账周期，其他数据将自动从合同基本信息中拉取
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div>
            <label className="label">对账类型 *</label>
            <div className="flex gap-2">
              {([["BOTH", "固费 + 佣金"], ["FEE_ONLY", "仅固费"], ["COMMISSION_ONLY", "仅佣金"]] as const).map(([v, l]) => (
                <label key={v} className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors
                  ${reconcileType === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <input type="radio" className="sr-only" value={v} checked={reconcileType === v} onChange={() => setReconcileType(v)} />
                  {l}
                </label>
              ))}
            </div>
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
      </div>
    </div>
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
  onRefresh,
}: {
  rec: Rec;
  onRefresh: () => void;
}) {
  const [value, setValue] = useState(
    rec.gmvBaseline != null ? String(rec.gmvBaseline) : "",
  );
  const [saving, setSaving] = useState(false);
  const editable = rec.status === "DRAFT";

  async function save() {
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
