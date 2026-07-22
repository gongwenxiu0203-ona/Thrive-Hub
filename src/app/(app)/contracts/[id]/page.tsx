import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileDown, Pencil } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { FileUploader } from "@/components/FileUploader";
import { ContractFormModal } from "../ContractFormModal";
import { ContractActions } from "./ContractActions";
import { ContactAdminModifyButton } from "./ContactAdminModifyButton";
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
import { contractScope, customerScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  try { await requireFeaturePermission(session, "contracts", "READ"); }
  catch (error) { if (error instanceof FeaturePermissionError) notFound(); throw error; }

  const contract = await prisma.contract.findFirst({
    where: { id, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"), deletedAt: null },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any;
  const isTransactionalContract = c.uploadType === "TRANSACTIONAL" || contract.type === "TRANSACTIONAL";

  // 行级权限校验
  if (session.role === "BRAND" && session.brandName) {
    if (!contract.customer || contract.customer.brandName !== session.brandName) notFound();
  } else if (session.role === "CHANNEL") {
    if (
      !contract.customer ||
      (
        contract.customer.channelUserId !== session.userId &&
        contract.customer.createdById !== session.userId
      )
    ) {
      notFound();
    }
  }

  const [users, files, customers] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.attachment.findMany({
      where: { entityType: "CONTRACT", entityId: id },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: true },
    }),
    prisma.customer.findMany({
      where: {
        ...customerScope(session, session.role === "ADMIN" ? "all" : "mine"),
        deletedAt: null,
      },
      select: { id: true, brandName: true },
      orderBy: { brandName: "asc" },
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
  const partyBCompanyLabels: Record<string, string> = {
    THRAIVE: "佛山公司",
    LINGYUE: "香港公司",
  };
  let partyBBankAccounts: string[] = [];
  try {
    partyBBankAccounts = JSON.parse(c.partyBBankAccounts ?? "[]");
  } catch {}
  const fieldValues: Record<string, string> = {
    partyAName: contract.partyA ?? "",
    partyACreditCode: c.partyACreditCode ?? "",
    partyAAddress: c.partyAAddress ?? "",
    partyAContact: c.partyAContact ?? "",
    partyAPhone: c.partyAPhone ?? "",
    partyAEmail: c.partyAEmail ?? "",
    partyBCompany: partyBCompanyLabels[c.partyBCompany] ?? c.partyBCompany ?? "",
    partyBBankAccounts: partyBBankAccounts.length
      ? partyBBankAccounts.map((account) => partyBCompanyLabels[account] ?? account).join(" / ")
      : "",
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
  const partyBReviewFields = reviewFieldRows.filter((field) => field.key.startsWith("partyB"));
  const promotionKeys = new Set(["promoPlatform", "targetSite", "coopChannels"]);
  const promotionReviewFields = reviewFieldRows.filter((field) => promotionKeys.has(field.key));
  const cooperationReviewFields = reviewFieldRows.filter(
    (field) => !field.key.startsWith("partyA") && !field.key.startsWith("partyB") && !promotionKeys.has(field.key),
  );
  const reviewFieldGroups = [
    { title: "甲方信息", fields: partyAReviewFields },
    { title: "乙方信息", fields: partyBReviewFields },
    { title: "合作信息", fields: cooperationReviewFields },
    { title: "推广信息", fields: promotionReviewFields },
  ];
  const sourceVersion = contract.versions[0] ?? null;
  const sourceUrl = sourceVersion
    ? `/api/contracts/version-download/${sourceVersion.id}?inline=1`
    : contract.generatedDocUrl
      ? `/api/contracts/generate-doc/${contract.id}`
      : null;

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
            {c.fillMethod && (
              contract.status === "IN_PROGRESS" ||
              contract.status === "REJECTED" ||
              (contract.status === "COMPLETED" && isAdmin)
            ) && (
              <Link
                href={`/contracts/new?contractId=${contract.id}`}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <Pencil className="h-4 w-4" /> 编辑合同信息
              </Link>
            )}
            {c.fillMethod && (
              <>
                <a
                  href={`/api/contracts/generate-doc/${contract.id}`}
                  download
                  className="btn-outline flex items-center gap-1.5 text-sm"
                >
                  <FileDown className="h-4 w-4" /> 下载 Word
                </a>
                <a
                  href={`/api/contracts/generate-doc/${contract.id}?format=pdf`}
                  download
                  className="btn-outline flex items-center gap-1.5 text-sm"
                >
                  <FileDown className="h-4 w-4" /> 下载 PDF
                </a>
              </>
            )}
            {contract.status === "COMPLETED" && !isAdmin && <ContactAdminModifyButton />}
            {/* 旧版合同：原有编辑弹窗 */}
            {!c.fillMethod && (contract.status === "IN_PROGRESS" || (contract.status === "COMPLETED" && isAdmin)) && contract.customerId && contract.type && (
              <ContractFormModal
                users={userOptions}
                customers={customers}
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
      {!isTransactionalContract && uploadMissing.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                本合同为上传已有合同，以下 {uploadMissing.length} 个关键字段尚未补齐：
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
      {!isTransactionalContract && <div className="card flex items-center gap-2 overflow-x-auto p-4">
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
      </div>}

      {/* 合同审核：提交审核后置顶展示；上传「签署完成存档」无需审核，不展示 */}
      {!isTransactionalContract && c.uploadArchiveMode !== "SIGNED_ARCHIVE" && (reviewRounds.length > 0 || canActReview) && (
        <ReviewerActionsPanel
          contractId={contract.id}
          contractStatus={contract.status}
          canAct={canActReview}
          currentReview={currentReview}
          history={reviewRounds}
          annotations={reviewAnnotations}
          fields={reviewFieldRows}
          fieldGroups={reviewFieldGroups}
          roundDiff={roundDiff}
          sourceUrl={sourceUrl}
        />
      )}

      {/* 合同流程：生成 + 提交审核（双路径）+ 盖章 + 版本历史 */}
      {!isTransactionalContract && (
        <ContractWorkflowPanel
          contractId={contract.id}
          status={contract.status}
          archived={c.uploadArchiveMode === "SIGNED_ARCHIVE"}
          hasTemplate={!!c.templateId}
          hasGeneratedDoc={!!contract.generatedDocUrl}
          pendingNewUpload={!!c.pendingNewUpload}
          hasSourceAnnotations={!!c.hasSourceAnnotations}
          stampStatus={c.stampStatus ?? "NONE"}
          stampedVersionId={
            contract.versions.find((version) => version.fileUrl === c.stampedDocUrl)?.id ?? null
          }
          isAdmin={isAdmin}
          versions={contract.versions.map((v): ContractVersionRow => ({
            id: v.id,
            versionNo: v.versionNo,
            fileType: v.fileType,
            reason: v.reason,
            createdByName: v.createdBy?.name ?? "—",
            createdAt: v.createdAt.toISOString(),
          }))}
        />
      )}

      {/* 合同基础信息 */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">合同基础信息</h2>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="合同编号" value={contract.contractNo} />
          <Field
            label="关联客户"
            value={contract.customer ? (
              <Link
                href={`/customers/${contract.customerId}`}
                className="text-brand-700 hover:underline"
              >
                {contract.customer.brandName}
              </Link>
            ) : "—"}
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

      {/* 合同字段展示：与创建合同一致分为四个业务板块 */}
      {!isTransactionalContract && reviewFieldGroups
        .filter((group) => group.fields.some((field) => !field.key.startsWith("partyB")))
        .map((group) => (
        <ReviewFieldDisplaySection key={group.title} title={group.title} fields={group.fields} />
      ))}

      {/* 合同中的乙方详细信息 */}
      {!isTransactionalContract && <section className="card p-5">
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
      </section>}

      {/* 旧版合同兜底：保留原文对照 */}
      {!isTransactionalContract && !c.fillMethod && (
        <ContractCompare
          contractText={contract.contractText ?? ""}
          fields={reviewFieldRows.map((field) => ({
            key: field.key,
            label: field.label,
            value: field.value,
          }))}
        />
      )}

      {isTransactionalContract && (
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-slate-900">事务性合同源文件</h2>
          <p className="mb-4 text-sm text-slate-400">源文件不参与字段识别、模板生成或审核流程</p>
          {contract.fileUrl ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {files.find((file) => file.fileUrl === contract.fileUrl)?.fileName ?? "事务性合同源文件"}
              </span>
              <a
                href={contract.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-outline inline-flex items-center gap-1.5 text-sm"
              >
                <ExternalLink className="h-4 w-4" /> 在线查看
              </a>
              <a
                href={contract.fileUrl}
                download
                className="btn-secondary inline-flex items-center gap-1.5 text-sm"
              >
                <FileDown className="h-4 w-4" /> 下载源文件
              </a>
            </div>
          ) : (
            <p className="text-sm text-slate-400">暂无源文件</p>
          )}
        </section>
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
