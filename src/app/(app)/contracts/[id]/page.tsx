import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { FileUploader } from "@/components/FileUploader";
import { ContractFormModal } from "../ContractFormModal";
import { ContractActions } from "./ContractActions";
import { ContractCompare } from "./ContractCompare";
import { ReviewPanel, type ReviewFieldState } from "./ReviewPanel";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_STATUS_ORDER,
  CONTRACT_TYPE_LABELS,
  CONTRACT_REVIEW_FIELDS,
  COMMISSION_TYPE_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: true,
      owner: true,
      reviewer: true,
      fieldReviews: true,
    },
  });
  if (!contract) notFound();

  // 行级权限校验
  if (session.role === "BRAND" && session.brandName) {
    if (contract.customer.brandName !== session.brandName) notFound();
  } else if (session.role === "CHANNEL") {
    if (
      contract.customer.channelUserId !== session.userId &&
      contract.customer.createdById !== session.userId
    ) {
      notFound();
    }
  }

  const [users, files] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.attachment.findMany({
      where: { entityType: "CONTRACT", entityId: id },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: true },
    }),
  ]);

  const isAdmin = session.role === "ADMIN";
  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  // Field values keyed for compare view + review panel (v3 template fields).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any;

  // 阶梯规则展示
  let tieredText = "";
  try {
    if (c.tieredRules) {
      const obj = JSON.parse(c.tieredRules);
      const sym = obj.currency === "美金" ? "$" : "¥";
      tieredText = (obj.tiers ?? [])
        .map((t: { from: string; to: string; rate: string }, i: number) => {
          if (i === 0) return `0-${sym}${t.to} → ${t.rate}`;
          if (t.to) return `${sym}${t.from}-${sym}${t.to} → ${t.rate}`;
          return `${sym}${t.from} 及以上 → ${t.rate}`;
        })
        .join(" / ");
    }
  } catch {}

  const fieldValues: Record<string, string> = {
    partyA: contract.partyA ?? "",
    contractPeriod: `${formatDate(contract.startDate)} ~ ${formatDate(
      contract.endDate,
    )}`,
    promoPlatform: c.promoPlatform ?? "",
    targetSite: c.targetSite ?? "",
    feeAmount: contract.feeAmount ?? "",
    feeCurrency: c.feeCurrency ?? "",
    paymentMethod: c.paymentMethod ?? "",
    commissionType: c.commissionType
      ? labelOf(COMMISSION_TYPE_LABELS, c.commissionType)
      : "",
    commissionRate: contract.commissionRate ?? "",
    thresholdAmount: c.thresholdAmount ?? "",
    thresholdCurrency: c.thresholdCurrency ?? "",
    tieredRules: tieredText,
    excessBaseMonths: c.excessBaseMonths ?? "",
    excessCommissionRate: c.excessCommissionRate ?? "",
    gmvSettlementCycle: c.gmvSettlementCycle ?? "",
  };

  // 根据 GMV 佣金结算方式，过滤掉无关字段（v3 模板）
  const ct = c.commissionType ?? "FIXED";
  const conditionalKeys: Record<string, string[]> = {
    FIXED: [],
    THRESHOLD: ["thresholdAmount", "thresholdCurrency"],
    TIERED: ["tieredRules"],
    EXCESS: ["excessBaseMonths", "excessCommissionRate"],
  };
  // 所有可能出现的条件字段，用于"非当前类型则隐藏"
  const allConditionalKeys = new Set([
    "thresholdAmount",
    "thresholdCurrency",
    "tieredRules",
    "excessBaseMonths",
    "excessCommissionRate",
  ]);
  const activeConditional = new Set(conditionalKeys[ct] ?? []);

  const visibleFields = CONTRACT_REVIEW_FIELDS.filter((f) => {
    // 条件字段：只在匹配当前 commissionType 时显示
    if (allConditionalKeys.has(f.key)) return activeConditional.has(f.key);
    // 其他字段：只在有值时显示（避免空字段一直占位）
    const v = fieldValues[f.key];
    return v != null && v !== "" && v !== "—" && !/^\s*~\s*$/.test(v);
  });

  const reviewByField = new Map(
    contract.fieldReviews.map((r) => [r.fieldName, r]),
  );
  const reviewStates: Record<string, ReviewFieldState> = {};
  for (const f of visibleFields) {
    const r = reviewByField.get(f.key);
    reviewStates[f.key] = {
      key: f.key,
      label: f.label,
      value: fieldValues[f.key] ?? "",
      decision: r?.decision ?? "APPROVED",
      modification: r?.modification ?? "",
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton label="返回合同列表" fallbackHref="/contracts" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {contract.contractNo}
            </h1>
            <Badge className={CONTRACT_STATUS_COLORS[contract.status]}>
              {labelOf(CONTRACT_STATUS_LABELS, contract.status)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {contract.status === "IN_PROGRESS" && (
              <ContractFormModal
                users={userOptions}
                currentUserId={session.userId}
                contract={{
                  id: contract.id,
                  contractNo: contract.contractNo,
                  customerId: contract.customerId,
                  type: contract.type,
                  ownerId: contract.ownerId,
                  reviewerId: contract.reviewerId,
                  contractText: contract.contractText,
                  partyA: contract.partyA,
                  promoPlatform: c.promoPlatform ?? null,
                  targetSite: c.targetSite ?? null,
                  feeAmount: contract.feeAmount,
                  feeCurrency: c.feeCurrency ?? null,
                  paymentMethod: c.paymentMethod ?? null,
                  commissionType: c.commissionType ?? "FIXED",
                  commissionRate: contract.commissionRate,
                  thresholdAmount: c.thresholdAmount ?? null,
                  thresholdCurrency: c.thresholdCurrency ?? null,
                  tieredRules: c.tieredRules ?? null,
                  excessBaseMonths: c.excessBaseMonths ?? null,
                  excessCommissionRate: c.excessCommissionRate ?? null,
                  gmvSettlementCycle: c.gmvSettlementCycle ?? null,
                  startDate: contract.startDate,
                  endDate: contract.endDate,
                }}
                trigger="edit"
              />
            )}
            <ContractActions
              contractId={contract.id}
              status={contract.status}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </div>

      {/* 状态流转 */}
      <div className="card flex items-center gap-2 overflow-x-auto p-4">
        {CONTRACT_STATUS_ORDER.map((s, i) => {
          const reached =
            CONTRACT_STATUS_ORDER.indexOf(contract.status) >= i;
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-7 items-center rounded-full px-3 text-xs font-medium ${
                  reached
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {labelOf(CONTRACT_STATUS_LABELS, s)}
              </span>
              {i < CONTRACT_STATUS_ORDER.length - 1 && (
                <span className="text-slate-300">→</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 基本信息 */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">合同信息</h2>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="关联客户"
            value={
              <Link
                href={`/customers/${contract.customerId}`}
                className="text-brand-700 hover:underline"
              >
                {contract.customer.brandName}
              </Link>
            }
          />
          <Field
            label="合同类型"
            value={labelOf(CONTRACT_TYPE_LABELS, contract.type)}
          />
          <Field label="合同负责人" value={contract.owner?.name ?? "—"} />
          <Field label="审核人" value={contract.reviewer?.name ?? "—"} />
          <Field label="创建人" value={contract.createdBy.name} />
          <Field
            label="创建时间"
            value={formatDateTime(contract.createdAt)}
          />
          <Field
            label="合作期限"
            value={`${formatDate(contract.startDate)} ~ ${formatDate(
              contract.endDate,
            )}`}
          />
          <Field
            label="字段提取方式"
            value={
              contract.extractedBy === "AI"
                ? "Claude AI"
                : contract.extractedBy === "RULE"
                  ? "规则提取"
                  : "手动填写"
            }
          />
        </dl>
      </section>

      {/* 关键字段 + 原文对照 */}
      <ContractCompare
        contractText={contract.contractText ?? ""}
        fields={visibleFields.map((f) => ({
          key: f.key,
          label: f.label,
          value: fieldValues[f.key] ?? "",
        }))}
      />

      {/* 字段级审核 */}
      <section>
        <h2 className="mb-3 font-semibold text-slate-900">字段级审核</h2>
        <p className="mb-3 text-sm text-slate-400">
          左侧为审核内容，中间为审核意见（默认通过，可改为驳回），右侧为修改意见 — 一一对应。
        </p>
        <ReviewPanel
          contractId={contract.id}
          contractStatus={contract.status}
          isAdmin={isAdmin}
          fields={reviewStates}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lockedFieldKeys={(() => { try { return JSON.parse((contract as any).lockedFields ?? "[]"); } catch { return []; } })()}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reviewComment={(contract as any).reviewComment ?? ""}
        />
      </section>

      {/* 合同文件 */}
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-slate-900">合同文件</h2>
        <p className="mb-4 text-sm text-slate-400">上传合同 PDF 等文件</p>
        <FileUploader
          entityType="CONTRACT"
          entityId={contract.id}
          label="上传合同文件"
          attachments={files.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            fileSize: file.fileSize,
            createdAt: file.createdAt,
            uploadedBy: file.uploadedBy,
          }))}
        />
      </section>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{value}</dd>
    </div>
  );
}
