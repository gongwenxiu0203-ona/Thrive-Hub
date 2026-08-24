import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope, financeDataView } from "@/lib/dataScope";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import {
  appendAuditEntry,
  calculateShareAmount,
  calcTieredCommission,
  parseNonNegativeAmount,
  parseTieredRules,
  selectBasicCommissionRate,
} from "@/lib/channelSplit";

function parseShanghaiDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("日期格式无效");
  }
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("日期格式无效");
  return date;
}

function snapshotPeriod(period: {
  streamType: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  fixedFeeReceived: number | null;
  commissionReceived: number | null;
  fixedFeeReceivedCurrency: string | null;
  commissionReceivedCurrency: string | null;
  fixedFeeShareRate: number | null;
  commissionShareRate: number | null;
  fixedFeeShareAmount: number | null;
  commissionShareAmount: number | null;
  fixedFeePaidAt: Date | null;
  commissionPaidAt: Date | null;
  confirmedGmv: number | null;
  proofUrl: string | null;
  notes: string | null;
}) {
  return {
    ...period,
    periodStart: period.periodStart?.toISOString() ?? null,
    periodEnd: period.periodEnd?.toISOString() ?? null,
    fixedFeePaidAt: period.fixedFeePaidAt?.toISOString() ?? null,
    commissionPaidAt: period.commissionPaidAt?.toISOString() ?? null,
  };
}

function hasAuditEntries(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.length > 0;
  } catch {
    throw new Error("分账审计日志格式无效，已拒绝覆盖历史审计数据");
  }
}

function canonicalCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized === "CNY" ? "RMB" : normalized;
}

function parsePeriodCurrency(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") {
    return canonicalCurrency(fallback);
  }
  if (typeof value !== "string") throw new Error("CURRENCY_INVALID");
  const normalized = canonicalCurrency(value);
  if (!/^[A-Z]{3,8}$/.test(normalized)) {
    throw new Error("CURRENCY_INVALID");
  }
  return normalized;
}

const FIXED_FIELDS = new Set([
  "fixedFeeReceived",
  "fixedFeeReceivedCurrency",
  "fixedFeePaidAt",
]);
const COMMISSION_FIELDS = new Set([
  "commissionReceived",
  "commissionReceivedCurrency",
  "commissionPaidAt",
  "confirmedGmv",
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; periodId: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(
      session,
      "finance.channel_reconciliation",
      "EDIT",
    );
    if (session.role !== "ADMIN" && session.role !== "USER") {
      return NextResponse.json(
        { error: "仅内部员工可录入或修改渠道商分账" },
        { status: 403 },
      );
    }
    const { id, periodId } = await params;
    const body = await req.json();

    const updated = await prisma.$transaction(async (tx) => {
      const period = await tx.channelReconciliationPeriod.findFirst({
        where: {
          id: periodId,
          reconciliationId: id,
          reconciliation: channelReconciliationScope(
            session,
            financeDataView(session),
          ),
        },
        include: {
          reconciliation: {
            include: { splitRule: true },
          },
        },
      });
      if (!period) throw new Error("NOT_FOUND");
      if (period.reconciliation.recordMode !== "RULE_DRIVEN") {
        const confirmsFixedPayment = "fixedFeePaidAt" in body;
        const confirmsCommissionPayment = "commissionPaidAt" in body;
        if (confirmsFixedPayment || confirmsCommissionPayment) {
          const paymentOnlyKeys = new Set([
            "fixedFeePaidAt",
            "commissionPaidAt",
            "correctionReason",
          ]);
          if (Object.keys(body).some((key) => !paymentOnlyKeys.has(key))) {
            throw new Error("PAYMENT_ONLY_REQUEST");
          }
          const confirmationReason =
            typeof body.correctionReason === "string"
              ? body.correctionReason.trim()
              : "";
          if (!confirmationReason)
            throw new Error("CORRECTION_REASON_REQUIRED");
          if (confirmsFixedPayment && period.fixedFeeAmount === null) {
            throw new Error("FIXED_PAYMENT_DATA_REQUIRED");
          }
          if (confirmsCommissionPayment && period.commissionAmount === null) {
            throw new Error("COMMISSION_PAYMENT_DATA_REQUIRED");
          }
        }
        const fixedKeys = new Set(["fixedFeeAmount", "fixedFeePaidAt"]);
        const commissionKeys = new Set([
          "commissionAmount",
          "commissionPaidAt",
        ]);
        const commonChanged = ["proofUrl", "notes", "periodLabel"].some(
          (key) => key in body,
        );
        const fixedChanged =
          Object.keys(body).some((key) => fixedKeys.has(key)) || commonChanged;
        const commissionChanged =
          Object.keys(body).some((key) => commissionKeys.has(key)) ||
          commonChanged;
        if (period.fixedFeePaidAt && fixedChanged)
          throw new Error("PAID_LOCKED");
        if (period.commissionPaidAt && commissionChanged) {
          throw new Error("PAID_LOCKED");
        }

        const fixedFeeAmount =
          "fixedFeeAmount" in body
            ? parseNonNegativeAmount(body.fixedFeeAmount, "固费分账金额")
            : period.fixedFeeAmount;
        const commissionAmount =
          "commissionAmount" in body
            ? parseNonNegativeAmount(body.commissionAmount, "抽佣分账金额")
            : period.commissionAmount;
        const fixedFeePaidAt =
          "fixedFeePaidAt" in body
            ? parseShanghaiDate(body.fixedFeePaidAt)
            : period.fixedFeePaidAt;
        const commissionPaidAt =
          "commissionPaidAt" in body
            ? parseShanghaiDate(body.commissionPaidAt)
            : period.commissionPaidAt;
        if (fixedFeePaidAt && fixedFeeAmount === null) {
          throw new Error("FIXED_PAYMENT_DATA_REQUIRED");
        }
        if (commissionPaidAt && commissionAmount === null) {
          throw new Error("COMMISSION_PAYMENT_DATA_REQUIRED");
        }

        return tx.channelReconciliationPeriod.update({
          where: { id: periodId },
          data: {
            fixedFeeAmount,
            commissionAmount,
            fixedFeePaidAt,
            commissionPaidAt,
            proofUrl:
              "proofUrl" in body
                ? typeof body.proofUrl === "string"
                  ? body.proofUrl.trim() || null
                  : null
                : period.proofUrl,
            notes:
              "notes" in body
                ? typeof body.notes === "string"
                  ? body.notes.trim() || null
                  : null
                : period.notes,
            periodLabel:
              "periodLabel" in body
                ? typeof body.periodLabel === "string"
                  ? body.periodLabel.trim() || null
                  : null
                : period.periodLabel,
          },
        });
      }
      if (!period.reconciliation.splitRule) {
        throw new Error("RULE_MISSING");
      }

      const bodyKeys = Object.keys(body);
      const changesFixed = bodyKeys.some((key) => FIXED_FIELDS.has(key));
      const changesCommission = bodyKeys.some((key) =>
        COMMISSION_FIELDS.has(key),
      );
      const changesServicePeriod = "periodStart" in body || "periodEnd" in body;

      if (period.streamType === "FIXED_FEE" && changesCommission) {
        throw new Error("STREAM_FIELD_MISMATCH");
      }
      if (period.streamType === "COMMISSION" && changesFixed) {
        throw new Error("STREAM_FIELD_MISMATCH");
      }

      const requestsFixedPayment =
        "fixedFeePaidAt" in body &&
        body.fixedFeePaidAt !== null &&
        body.fixedFeePaidAt !== "";
      const requestsCommissionPayment =
        "commissionPaidAt" in body &&
        body.commissionPaidAt !== null &&
        body.commissionPaidAt !== "";
      const requestsPayment = requestsFixedPayment || requestsCommissionPayment;
      if (requestsPayment) {
        if (!["CONFIRMED", "SKIPPED"].includes(period.channelReviewStatus))
          throw new Error("CHANNEL_REVIEW_REQUIRED");
        const paymentProofUrl =
          typeof body.paymentProofUrl === "string"
            ? body.paymentProofUrl.trim()
            : "";
        if (!paymentProofUrl) throw new Error("PAYMENT_PROOF_REQUIRED");
        let paymentProofUrls: unknown;
        try {
          paymentProofUrls = JSON.parse(paymentProofUrl);
        } catch {
          paymentProofUrls = [paymentProofUrl];
        }
        if (
          !Array.isArray(paymentProofUrls) ||
          paymentProofUrls.length === 0 ||
          paymentProofUrls.length > 10 ||
          paymentProofUrls.some(
            (url) => typeof url !== "string" || !url.startsWith("/uploads/"),
          )
        ) {
          throw new Error("PAYMENT_PROOF_INVALID");
        }
      } else if (!["DRAFT", "DISPUTED"].includes(period.channelReviewStatus)) {
        throw new Error("CHANNEL_REVIEW_LOCKED");
      }
      if (
        requestsFixedPayment &&
        bodyKeys.some(
          (key) =>
            key !== "fixedFeePaidAt" &&
            key !== "paymentProofUrl" &&
            key !== "correctionReason",
        )
      ) {
        throw new Error("PAYMENT_ONLY_REQUEST");
      }
      if (
        requestsCommissionPayment &&
        bodyKeys.some(
          (key) =>
            key !== "commissionPaidAt" &&
            key !== "paymentProofUrl" &&
            key !== "correctionReason",
        )
      ) {
        throw new Error("PAYMENT_ONLY_REQUEST");
      }
      if (
        requestsFixedPayment &&
        (period.fixedFeeReceived === null ||
          period.fixedFeeShareAmount === null)
      ) {
        throw new Error("FIXED_PAYMENT_NOT_READY");
      }
      if (
        requestsCommissionPayment &&
        (period.commissionReceived === null ||
          period.commissionShareAmount === null)
      ) {
        throw new Error("COMMISSION_PAYMENT_NOT_READY");
      }

      if (
        period.fixedFeePaidAt &&
        (changesFixed ||
          changesServicePeriod ||
          period.streamType === "FIXED_FEE")
      ) {
        throw new Error("PAID_LOCKED");
      }
      if (
        period.commissionPaidAt &&
        (changesCommission ||
          changesServicePeriod ||
          period.streamType === "COMMISSION")
      ) {
        throw new Error("PAID_LOCKED");
      }

      // Generated periods already contain default currency and cycle dates. Those
      // defaults are not an entry. Each waterfall decides from its own values only.
      const relevantAlreadyRecorded =
        period.streamType === "FIXED_FEE"
          ? period.fixedFeeReceived !== null ||
            period.fixedFeeShareAmount !== null ||
            period.fixedFeePaidAt !== null
          : period.streamType === "COMMISSION"
            ? period.commissionReceived !== null ||
              period.commissionShareAmount !== null ||
              period.commissionPaidAt !== null ||
              period.confirmedGmv !== null
            : period.fixedFeeReceived !== null ||
              period.fixedFeeShareAmount !== null ||
              period.fixedFeePaidAt !== null ||
              period.commissionReceived !== null ||
              period.commissionShareAmount !== null ||
              period.commissionPaidAt !== null ||
              period.confirmedGmv !== null;
      const submittedReason =
        typeof body.correctionReason === "string"
          ? body.correctionReason.trim()
          : "";
      if (relevantAlreadyRecorded && !requestsPayment && !submittedReason) {
        throw new Error("CORRECTION_REASON_REQUIRED");
      }
      if (period.channelReviewStatus === "DISPUTED" && !submittedReason)
        throw new Error("CORRECTION_REASON_REQUIRED");
      const reason = requestsPayment
        ? submittedReason || "确认付款"
        : relevantAlreadyRecorded
          ? submittedReason
          : "首次录入";

      const nextPeriodStart =
        "periodStart" in body
          ? parseShanghaiDate(body.periodStart)
          : period.periodStart;
      const nextPeriodEnd =
        "periodEnd" in body
          ? parseShanghaiDate(body.periodEnd)
          : period.periodEnd;
      if (!nextPeriodStart || !nextPeriodEnd) {
        throw new Error("SERVICE_PERIOD_REQUIRED");
      }
      if (nextPeriodEnd.getTime() < nextPeriodStart.getTime()) {
        throw new Error("SERVICE_PERIOD_INVALID");
      }

      const rule = period.reconciliation.splitRule;
      let fixedFeeReceived = period.fixedFeeReceived;
      let fixedFeeReceivedCurrency =
        period.fixedFeeReceivedCurrency ??
        canonicalCurrency(period.reconciliation.fixedFeeReceivedCurrency);
      let fixedFeeShareRate = period.fixedFeeShareRate;
      let fixedFeeShareAmount = period.fixedFeeShareAmount;
      let fixedFeePaidAt = period.fixedFeePaidAt;
      if (period.streamType !== "COMMISSION") {
        const submittedCurrency =
          "fixedFeeReceivedCurrency" in body
            ? parsePeriodCurrency(
                body.fixedFeeReceivedCurrency,
                period.reconciliation.fixedFeeReceivedCurrency,
              )
            : fixedFeeReceivedCurrency;
        if (
          relevantAlreadyRecorded &&
          submittedCurrency !== fixedFeeReceivedCurrency
        ) {
          throw new Error("CURRENCY_LOCKED");
        }
        fixedFeeReceivedCurrency = submittedCurrency;
        fixedFeeReceived =
          "fixedFeeReceived" in body
            ? parseNonNegativeAmount(body.fixedFeeReceived, "Thraive 到账固费")
            : period.fixedFeeReceived;
        fixedFeeShareRate =
          relevantAlreadyRecorded && period.fixedFeeShareRate !== null
            ? period.fixedFeeShareRate
            : rule.fixedFeeRate;
        fixedFeeShareAmount =
          fixedFeeReceived === null
            ? null
            : calculateShareAmount(fixedFeeReceived, fixedFeeShareRate);
        fixedFeePaidAt =
          "fixedFeePaidAt" in body
            ? parseShanghaiDate(body.fixedFeePaidAt)
            : period.fixedFeePaidAt;
        if (
          fixedFeePaidAt !== null &&
          (fixedFeeReceived === null || fixedFeeShareAmount === null)
        ) {
          throw new Error("FIXED_PAYMENT_DATA_REQUIRED");
        }
      }

      let commissionReceived = period.commissionReceived;
      let commissionReceivedCurrency =
        period.commissionReceivedCurrency ??
        canonicalCurrency(period.reconciliation.commissionReceivedCurrency);
      let commissionShareRate = period.commissionShareRate;
      let commissionShareAmount = period.commissionShareAmount;
      let commissionPaidAt = period.commissionPaidAt;
      let confirmedGmv = period.confirmedGmv;
      if (period.streamType !== "FIXED_FEE") {
        const submittedCurrency =
          "commissionReceivedCurrency" in body
            ? parsePeriodCurrency(
                body.commissionReceivedCurrency,
                period.reconciliation.commissionReceivedCurrency,
              )
            : commissionReceivedCurrency;
        if (
          relevantAlreadyRecorded &&
          submittedCurrency !== commissionReceivedCurrency
        ) {
          throw new Error("CURRENCY_LOCKED");
        }
        commissionReceivedCurrency = submittedCurrency;
        commissionReceived =
          "commissionReceived" in body
            ? parseNonNegativeAmount(
                body.commissionReceived,
                "Thraive 到账销售佣金",
              )
            : period.commissionReceived;
        confirmedGmv =
          "confirmedGmv" in body
            ? parseNonNegativeAmount(body.confirmedGmv, "确认 GMV")
            : period.confirmedGmv;
        commissionPaidAt =
          "commissionPaidAt" in body
            ? parseShanghaiDate(body.commissionPaidAt)
            : period.commissionPaidAt;

        commissionShareRate = null;
        commissionShareAmount = null;
        if (commissionReceived !== null) {
          if (rule.ruleType === "A") {
            if (
              commissionReceivedCurrency !==
              canonicalCurrency(rule.commissionThresholdCurrency)
            ) {
              throw new Error("COMMISSION_CURRENCY_MISMATCH");
            }
            commissionShareRate = selectBasicCommissionRate(
              commissionReceived,
              rule.commissionThresholdAmount,
              rule.commissionBelowRate,
              rule.commissionAtOrAboveRate,
            );
            commissionShareAmount = calculateShareAmount(
              commissionReceived,
              commissionShareRate,
            );
          } else {
            if (confirmedGmv === null) throw new Error("GMV_REQUIRED");
            const tierAmount = calcTieredCommission(
              confirmedGmv,
              parseTieredRules(JSON.parse(rule.tieredRules)),
            );
            commissionShareAmount =
              Math.round(
                (Math.min(tierAmount, commissionReceived) + Number.EPSILON) *
                  100,
              ) / 100;
            commissionShareRate =
              commissionReceived > 0
                ? commissionShareAmount / commissionReceived
                : 0;
          }
        }
        if (
          commissionPaidAt !== null &&
          (commissionReceived === null || commissionShareAmount === null)
        ) {
          throw new Error("COMMISSION_PAYMENT_DATA_REQUIRED");
        }
      }

      const next = {
        streamType: period.streamType,
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        fixedFeeReceived,
        commissionReceived,
        fixedFeeReceivedCurrency,
        commissionReceivedCurrency,
        fixedFeeShareRate,
        commissionShareRate,
        fixedFeeShareAmount,
        commissionShareAmount,
        fixedFeePaidAt,
        commissionPaidAt,
        confirmedGmv,
        proofUrl:
          "proofUrl" in body
            ? typeof body.proofUrl === "string"
              ? body.proofUrl.trim() || null
              : null
            : period.proofUrl,
        paymentProofUrl:
          "paymentProofUrl" in body && typeof body.paymentProofUrl === "string"
            ? body.paymentProofUrl.trim() || null
            : period.paymentProofUrl,
        notes:
          "notes" in body
            ? typeof body.notes === "string"
              ? body.notes.trim() || null
              : null
            : period.notes,
      };
      const auditLog = appendAuditEntry(period.auditLog, {
        actorId: session.userId,
        at: new Date().toISOString(),
        reason,
        before: snapshotPeriod(period),
        after: snapshotPeriod(next),
      });

      return tx.channelReconciliationPeriod.update({
        where: { id: periodId },
        data: {
          periodStart: next.periodStart,
          periodEnd: next.periodEnd,
          fixedFeeReceived: next.fixedFeeReceived,
          commissionReceived: next.commissionReceived,
          fixedFeeReceivedCurrency: next.fixedFeeReceivedCurrency,
          commissionReceivedCurrency: next.commissionReceivedCurrency,
          fixedFeeShareRate: next.fixedFeeShareRate,
          commissionShareRate: next.commissionShareRate,
          fixedFeeShareAmount: next.fixedFeeShareAmount,
          commissionShareAmount: next.commissionShareAmount,
          fixedFeePaidAt: next.fixedFeePaidAt,
          commissionPaidAt: next.commissionPaidAt,
          confirmedGmv: next.confirmedGmv,
          proofUrl: next.proofUrl,
          paymentProofUrl: next.paymentProofUrl,
          notes: next.notes,
          channelReviewStatus:
            !requestsPayment && period.channelReviewStatus === "DISPUTED"
              ? "DRAFT"
              : period.channelReviewStatus,
          channelReviewedAt:
            !requestsPayment && period.channelReviewStatus === "DISPUTED"
              ? null
              : period.channelReviewedAt,
          channelDisputeReason:
            !requestsPayment && period.channelReviewStatus === "DISPUTED"
              ? null
              : period.channelDisputeReason,
          auditLog,
        },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "渠道商对账周期不存在、已删除或无权访问" },
          { status: 404 },
        );
      }
      if (error.message === "RULE_MISSING") {
        return NextResponse.json(
          { error: "该分账记录缺少分账规则，无法计算" },
          { status: 409 },
        );
      }
      if (error.message === "STREAM_FIELD_MISMATCH") {
        return NextResponse.json(
          { error: "当前服务周期与提交的分账类型不一致" },
          { status: 400 },
        );
      }
      if (error.message === "PAID_LOCKED") {
        return NextResponse.json(
          { error: "该期已向渠道商付款，记录已永久锁定，不能再修改" },
          { status: 409 },
        );
      }
      if (error.message === "CHANNEL_REVIEW_REQUIRED")
        return NextResponse.json(
          { error: "渠道商确认完成或跳过确认后才能填写付款信息" },
          { status: 409 },
        );
      if (error.message === "CHANNEL_REVIEW_LOCKED")
        return NextResponse.json(
          { error: "当前确认状态已锁定分账数据" },
          { status: 409 },
        );
      if (error.message === "PAYMENT_PROOF_REQUIRED")
        return NextResponse.json(
          { error: "请先上传付款回单" },
          { status: 400 },
        );
      if (error.message === "PAYMENT_PROOF_INVALID")
        return NextResponse.json(
          { error: "付款回单格式无效，最多支持 10 张已上传回单" },
          { status: 400 },
        );
      if (error.message === "CORRECTION_REASON_REQUIRED") {
        return NextResponse.json(
          { error: "修改已有录入时必须填写修改原因" },
          { status: 400 },
        );
      }
      if (error.message === "SERVICE_PERIOD_REQUIRED") {
        return NextResponse.json(
          { error: "到账对应服务周期的开始和结束时间均为必填项" },
          { status: 400 },
        );
      }
      if (error.message === "SERVICE_PERIOD_INVALID") {
        return NextResponse.json(
          { error: "服务周期结束时间不能早于开始时间" },
          { status: 400 },
        );
      }
      if (error.message === "GMV_REQUIRED") {
        return NextResponse.json(
          { error: "B 类规则填写销售佣金到账金额时必须填写本期确认 GMV" },
          { status: 400 },
        );
      }
      if (error.message === "FIXED_PAYMENT_NOT_READY") {
        return NextResponse.json(
          {
            error:
              "请先保存本期到账固费和系统计算的分账金额，再单独填写向渠道商实际付款时间",
          },
          { status: 400 },
        );
      }
      if (error.message === "COMMISSION_PAYMENT_NOT_READY") {
        return NextResponse.json(
          {
            error:
              "请先保存本期到账销售佣金和系统计算的分账金额，再单独填写向渠道商实际付款时间",
          },
          { status: 400 },
        );
      }
      if (error.message === "PAYMENT_ONLY_REQUEST") {
        return NextResponse.json(
          {
            error:
              "确认付款必须单独提交；本次请求只能包含对应实际付款时间和确认说明，不能同时修改到账、币种、周期或备注",
          },
          { status: 400 },
        );
      }
      if (error.message === "FIXED_PAYMENT_DATA_REQUIRED") {
        return NextResponse.json(
          {
            error:
              "填写固费实际付款时间前，必须先录入到账固费并完成分账金额计算",
          },
          { status: 400 },
        );
      }
      if (error.message === "COMMISSION_PAYMENT_DATA_REQUIRED") {
        return NextResponse.json(
          {
            error:
              "填写销售佣金实际付款时间前，必须先录入到账销售佣金并完成分账金额计算",
          },
          { status: 400 },
        );
      }
      if (error.message === "COMMISSION_CURRENCY_MISMATCH") {
        return NextResponse.json(
          {
            error:
              "到账销售佣金货币与 A 类规则阈值货币不一致；系统没有汇率，不能直接比较或计算分账",
          },
          { status: 400 },
        );
      }
      if (error.message === "CURRENCY_INVALID") {
        return NextResponse.json(
          { error: "到账货币必须为 USD、RMB、EUR、GBP 或 HKD" },
          { status: 400 },
        );
      }
      if (error.message === "CURRENCY_LOCKED") {
        return NextResponse.json(
          { error: "本期到账货币已随首次录入锁定，不能再修改" },
          { status: 409 },
        );
      }
      if (
        error.message.includes("必须") ||
        error.message.includes("无效") ||
        error.message.includes("审计")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return errorResponse(error, "finance.channel-reconciliation.period.update");
  }
}
