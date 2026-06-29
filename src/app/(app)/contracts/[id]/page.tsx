import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Pencil } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { FileUploader } from "@/components/FileUploader";
import { ContractFormModal } from "../ContractFormModal";
import { ContractActions } from "./ContractActions";
import { ContractCompare } from "./ContractCompare";
import { ContractWorkflowPanel, type ContractVersionRow } from "./ContractWorkflowPanel";
import {
  ReviewerActionsPanel,
  type ReviewRoundRow,
  type ReviewAnnotationRow,
  type ReviewFieldRow,
} from "./ReviewerActionsPanel";
import { REVIEWER_EMAIL } from "@/lib/contractReviewer";
import { UPLOAD_EXTRACT_REQUIRED } from "@/lib/contractAiExtract";
import {
  SNAPSHOT_FIELD_KEY,
  collectContractFieldSnapshot,
  diffSnapshots,
  getReviewDecisionFields,
} from "@/lib/contractFieldSnapshot";
import { AlertCircle } from "lucide-react";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_STATUS_ORDER,
  CONTRACT_TYPE_LABELS,
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
      versions: {
        orderBy: { versionNo: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
      reviews: {
        orderBy: { round: "desc" },
        include: {
          reviewer: { select: { name: true } },
          comments: { orderBy: { createdAt: "asc" } },
        },
      },
      annotations: {
        orderBy: { createdAt: "desc" },
        include: { version: { select: { versionNo: true } } },
      },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!contract || (contract as any).deletedAt) notFound();

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

  // ── 审核轮次 + 批注（用于 ReviewerActionsPanel）───────────────────────────
  const reviewerUser = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { id: true },
  });
  const isReviewer = !!reviewerUser && reviewerUser.id === session.userId;

  const reviewRounds: ReviewRoundRow[] = contract.reviews.map((r) => ({
    id: r.id,
    round: r.round,
    status: r.status,
    reviewerName: r.reviewer?.name ?? "—",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    // 过滤掉特殊快照记录，UI 不展示
    comments: r.comments
      .filter((cm) => cm.fieldKey !== SNAPSHOT_FIELD_KEY)
      .map((cm) => ({
        id: cm.id,
        fieldKey: cm.fieldKey,
        comment: cm.comment,
        decision: cm.decision,
        annotationId: cm.annotationId,
        createdAt: cm.createdAt.toISOString(),
        updatedAt: cm.updatedAt.toISOString(),
      })),
  }));

  // 第二轮起：计算「本轮相比上一轮变动」字段
  let roundDiff: { key: string; label: string; from: string; to: string }[] = [];
  const currentRound = contract.reviews.find((r) => r.status === "PENDING");
  if (currentRound && currentRound.round >= 2) {
    const prevRound = contract.reviews.find((r) => r.round === currentRound.round - 1);
    const prevSnapRow = prevRound?.comments.find((cm) => cm.fieldKey === SNAPSHOT_FIELD_KEY);
    if (prevSnapRow) {
      try {
        const prevSnap = JSON.parse(prevSnapRow.comment) as Record<string, string>;
        const currentSnap = await collectContractFieldSnapshot(contract.id);
        roundDiff = diffSnapshots(prevSnap, currentSnap);
      } catch {
        // 解析失败忽略，diff 为空
      }
    }
  }
  const currentReview = reviewRounds.find((r) => r.status === "PENDING") ?? null;
  const reviewAnnotations: ReviewAnnotationRow[] = contract.annotations.map((a) => ({
    id: a.id,
    versionNo: a.version?.versionNo ?? 0,
    content: a.content,
    fileUrl: a.fileUrl,
    createdAt: a.createdAt.toISOString(),
  }));
  const canActReview =
    (isReviewer || isAdmin) &&
    contract.status === "REVIEWING" &&
    !!currentReview;

  // Field values keyed for compare view + review panel (v3 template fields).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any;

  // 「上传已有合同」的缺失字段：用 contract 表实际列回查（与 AI 抽取结果分离）
  const uploadValueByKey: Record<string, unknown> = {
    partyAName: contract.partyA,
    partyACreditCode: c.partyACreditCode,
    partyAAddress: c.partyAAddress,
    partyAContact: c.partyAContact,
    partyAPhone: c.partyAPhone,
    partyAEmail: c.partyAEmail,
    startDate: contract.startDate,
    endDate: contract.endDate,
    feeAmount: contract.feeAmount,
    feeCurrency: c.feeCurrency,
    commissionRate: contract.commissionRate,
  };
  const uploadMissing =
    c.uploadType === "EXISTING"
      ? UPLOAD_EXTRACT_REQUIRED.filter((f) => {
          const v = uploadValueByKey[f.key];
          if (v == null) return true;
          if (typeof v === "string" && !v.trim()) return true;
          return false;
        })
      : [];

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

  const formatMaybeDate = (value: unknown) => {
    if (!value) return "";
    if (value instanceof Date) return formatDate(value);
    return String(value);
  };
  const fieldValues: Record<string, string> = {
    partyAName: contract.partyA ?? "",
    partyACreditCode: c.partyACreditCode ?? "",
    partyAAddress: c.partyAAddress ?? "",
    partyAContact: c.partyAContact ?? "",
    partyAPhone: c.partyAPhone ?? "",
    partyAEmail: c.partyAEmail ?? "",
    startDate: formatMaybeDate(contract.startDate),
    endDate: formatMaybeDate(contract.endDate),
    promoPlatform: c.promoPlatform ?? "",
    targetSite: c.targetSite ?? "",
    feeAmount: contract.feeAmount ?? "",
    feeCurrency: c.feeCurrency ?? "",
    feeCycle: c.feeCycle ?? "",
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
    specialCommissionTerms: c.specialCommissionTerms ?? "",
    coopChannels: (() => {
      try {
        const channels = JSON.parse(c.coopChannels ?? "[]") as string[];
        return channels.join(" / ");
      } catch {
        return "";
      }
    })(),
  };

  const reviewFieldRows: ReviewFieldRow[] = getReviewDecisionFields(contract.commissionType).map((field) => ({
    key: field.key,
    label: field.label,
    value: fieldValues[field.key] ?? "",
  }));
  const partyAReviewFields = reviewFieldRows.filter((field) => field.key.startsWith("partyA"));
  const keyReviewFields = reviewFieldRows.filter((field) => !field.key.startsWith("partyA"));
  const sourceVersion = contract.versions[0] ?? null;
  const sourceUrl = sourceVersion
    ? `/api/contracts/version-download/${sourceVersion.id}?inline=1`
    : contract.generatedDocUrl
      ? `/api/contracts/generate-doc/${contract.id}`
      : null;

  const partyBCompanyLabels: Record<string, string> = {
    THRAIVE: "佛山公司",
    LINGYUE: "香港公司",
  };
  let partyBBankAccounts: string[] = [];
  try {
    partyBBankAccounts = JSON.parse(c.partyBBankAccounts ?? "[]");
  } catch {}

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
            {/* V4 合同：编辑 + 下载 */}
            {c.fillMethod && contract.status === "IN_PROGRESS" && (
              <Link
                href={`/contracts/new?contractId=${contract.id}`}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <Pencil className="h-4 w-4" /> 编辑合同信息
              </Link>
            )}
            {c.fillMethod && (
              <a
                href={`/api/contracts/generate-doc/${contract.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn-outline flex items-center gap-1.5 text-sm"
              >
                <FileDown className="h-4 w-4" /> 下载合同 DOCX
              </a>
            )}
            {/* 旧版合同：原有编辑弹窗 */}
            {!c.fillMethod && contract.status === "IN_PROGRESS" && (
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

      {/* 上传已有合同：缺失字段提醒 */}
      {uploadMissing.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                本合同为上传已有合同，AI 未识别到以下 {uploadMissing.length} 个关键字段，请补填后再提交审核：
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-amber-700 sm:grid-cols-3">
                {uploadMissing.map((m) => (
                  <li key={m.key} className="rounded bg-amber-100/60 px-2 py-1">· {m.label}</li>
                ))}
              </ul>
              <Link
                href={`/contracts/new?contractId=${contract.id}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline"
              >
                <Pencil className="h-3.5 w-3.5" /> 去补填字段
              </Link>
            </div>
          </div>
        </div>
      )}

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

      {/* 合同流程：生成 + 提交审核（双路径）+ 盖章 + 版本历史 */}
      <ContractWorkflowPanel
        contractId={contract.id}
        status={contract.status}
        archived={c.uploadArchiveMode === "SIGNED_ARCHIVE"}
        hasTemplate={!!c.templateId}
        hasGeneratedDoc={!!contract.generatedDocUrl}
        pendingNewUpload={!!c.pendingNewUpload}
        hasSourceAnnotations={!!c.hasSourceAnnotations}
        stampStatus={c.stampStatus ?? "NONE"}
        stampedDocUrl={c.stampedDocUrl ?? null}
        isAdmin={isAdmin}
        versions={contract.versions.map((v): ContractVersionRow => ({
          id: v.id,
          versionNo: v.versionNo,
          fileUrl: v.fileUrl,
          fileType: v.fileType,
          reason: v.reason,
          createdByName: v.createdBy?.name ?? "—",
          createdAt: v.createdAt.toISOString(),
        }))}
      />

      {/* 合同审核（轮次 / 字段意见 / 批注）—— 上传「签署完成存档」无需审核，不展示 */}
      {c.uploadArchiveMode !== "SIGNED_ARCHIVE" && (reviewRounds.length > 0 || canActReview) && (
        <ReviewerActionsPanel
          contractId={contract.id}
          contractStatus={contract.status}
          canAct={canActReview}
          currentReview={currentReview}
          history={reviewRounds}
          annotations={reviewAnnotations}
          fields={reviewFieldRows}
          roundDiff={roundDiff}
          sourceUrl={sourceUrl}
        />
      )}

      {/* 合同基础信息 */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">合同基础信息</h2>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="合同编号" value={contract.contractNo} />
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
          <Field label="合同状态" value={labelOf(CONTRACT_STATUS_LABELS, contract.status)} />
          <Field label="合同负责人" value={contract.owner?.name ?? "—"} />
          <Field label="审核人" value={contract.reviewer?.name ?? "—"} />
          <Field label="创建人" value={contract.createdBy.name} />
          <Field
            label="创建时间"
            value={formatDateTime(contract.createdAt)}
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

      {/* 合同审核字段：甲方信息 */}
      <ReviewFieldDisplaySection title="甲方信息" fields={partyAReviewFields} />

      {/* 合同审核字段：关键字段 */}
      <ReviewFieldDisplaySection title="合同关键字段" fields={keyReviewFields} />

      {/* 合同中的乙方信息 */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">乙方信息</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="乙方公司" value={partyBCompanyLabels[c.partyBCompany] ?? c.partyBCompany ?? "—"} />
          <Field label="统一社会信用代码/商业登记号" value={c.partyBCreditCode ?? "—"} />
          <Field label="乙方地址" value={c.partyBAddress ?? "—"} />
          <Field label="乙方指定联系人" value={c.partyBContact ?? "—"} />
          <Field label="电话" value={c.partyBPhone ?? "—"} />
          <Field label="电子邮箱" value={c.partyBEmail ?? "—"} />
          <Field
            label="收款账户"
            value={
              partyBBankAccounts.length
                ? partyBBankAccounts.map((account) => partyBCompanyLabels[account] ?? account).join(" / ")
                : "—"
            }
          />
        </dl>
      </section>

      {/* V4 补充展示：商品清单、渠道、外部填写链接 */}
      {c.fillMethod && (
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">推广信息</h2>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-600">
              {c.fillMethod === "AI_EXTRACT" ? "AI识别填写" : c.fillMethod === "EXTERNAL_LINK" ? "客户外部填写" : "手动填写"}
            </span>
          </div>
          {/* 推广商品清单 */}
          {(() => {
            let products: Array<{name:string;asin:string;price:string;trackLink:string}> = [];
            try { products = JSON.parse(c.productList ?? "[]"); } catch {}
            if (!products.length) return null;
            return (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-slate-600">推广商品清单</p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                        <th className="px-3 py-2 text-left">商品名称</th>
                        <th className="px-3 py-2 text-left">ASIN</th>
                        <th className="px-3 py-2 text-left">零售价</th>
                        <th className="px-3 py-2 text-left">追踪链接/优惠码</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2">{p.name || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{p.asin || "—"}</td>
                          <td className="px-3 py-2">{p.price || "—"}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-xs text-slate-500">{p.trackLink || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* 合作渠道 */}
          {(() => {
            let channels: string[] = [];
            try { channels = JSON.parse(c.coopChannels ?? "[]"); } catch {}
            if (!channels.length) return null;
            const labelMap: Record<string,string> = {
              ACC: "Amazon Creator Connections（ACC）", Attribution: "Amazon Attribution",
              Associates: "Amazon Affiliate Associates", AmazonLive: "Amazon Live",
              Levanta: "Levanta", Impact: "Impact", Wayward: "Wayward",
              ArcherAffiliates: "Archer Affiliates", PrivateSocial: "私域/社媒/流量渠道",
            };
            return (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-slate-600">确认合作渠道</p>
                <div className="flex flex-wrap gap-2">
                  {channels.map(k => (
                    <span key={k} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
                      ☑ {labelMap[k] ?? k}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 外部填写链接 */}
          {c.externalFillToken && (
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">
                外部填写链接有效至：{c.externalFillExpiry ? new Date(c.externalFillExpiry).toLocaleDateString("zh-CN") : "—"}
              </p>
            </div>
          )}
        </section>
      )}

      {/* 旧版合同兜底：保留原文对照 */}
      {!c.fillMethod && (
        <ContractCompare
          contractText={contract.contractText ?? ""}
          fields={reviewFieldRows.map((field) => ({
            key: field.key,
            label: field.label,
            value: field.value,
          }))}
        />
      )}

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

function ReviewFieldDisplaySection({
  title,
  fields,
}: {
  title: string;
  fields: ReviewFieldRow[];
}) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 font-semibold text-slate-900">{title}</h2>
      {fields.length === 0 ? (
        <p className="text-sm text-slate-400">暂无字段信息</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              value={field.value || "—"}
            />
          ))}
        </dl>
      )}
    </section>
  );
}
