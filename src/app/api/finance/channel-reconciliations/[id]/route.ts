import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { appendAuditEntry } from "@/lib/channelSplit";

const PAYEE_FIELD_LIMITS = {
  paymentMethod: 50,
  beneficiary: 200,
  accountNo: 200,
  bankName: 200,
  bankAddress: 500,
  swiftCode: 50,
  paypalAccount: 200,
  note: 1000,
} as const;

type PayeeField = keyof typeof PAYEE_FIELD_LIMITS;

function parseJsonObject(raw: string, errorCode: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(errorCode);
  }
}

function parsePayeeSnapshot(
  value: unknown,
  currentRaw: string,
): Record<PayeeField, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PAYEE_INVALID");
  }
  const current = parseJsonObject(currentRaw, "PAYEE_AUDIT_INVALID");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !(key in PAYEE_FIELD_LIMITS))) {
    throw new Error("PAYEE_INVALID");
  }

  const result: Partial<Record<PayeeField, string>> = {};
  for (const field of Object.keys(PAYEE_FIELD_LIMITS) as PayeeField[]) {
    const raw = field in input ? input[field] : current[field];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string") throw new Error("PAYEE_INVALID");
    const normalized = raw.trim();
    if (!normalized) continue;
    if (normalized.length > PAYEE_FIELD_LIMITS[field]) {
      throw new Error("PAYEE_TOO_LONG");
    }
    result[field] = normalized;
  }
  return result as Record<PayeeField, string>;
}

// PATCH /api/finance/channel-reconciliations/[id] — 编辑分账记录
// v2: 支持固费/抽佣两侧的金额、比例、日期、截图、推送状态更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
    if (session.role !== "ADMIN" && session.role !== "USER") {
      return NextResponse.json(
        { error: "仅内部员工可修改渠道商分账" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.channelReconciliation.findFirst({
      where: { AND: [{ id }, channelReconciliationScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.recordMode === "RULE_DRIVEN") {
      const allowedKeys = new Set([
        "note",
        "channelPayeeSnapshot",
        "correctionReason",
      ]);
      const unsupportedKeys = Object.keys(body).filter(
        (key) => !allowedKeys.has(key),
      );
      if (unsupportedKeys.length > 0) {
        return NextResponse.json(
          {
            error:
              "新版分账的合同、周期、到账货币和金额均不能在主记录上修改，请在对应未付款期录入",
          },
          { status: 400 },
        );
      }

      const ruleDrivenData: Record<string, unknown> = { updatedAt: new Date() };
      if ("note" in body) {
        ruleDrivenData.note =
          typeof body.note === "string" ? body.note.trim() || null : null;
      }
      if ("channelPayeeSnapshot" in body) {
        const before = parseJsonObject(
          existing.channelPayeeSnapshot,
          "PAYEE_AUDIT_INVALID",
        );
        const after = parsePayeeSnapshot(
          body.channelPayeeSnapshot,
          existing.channelPayeeSnapshot,
        );
        const isFirstEntry = Object.keys(before).length === 0;
        const submittedReason =
          typeof body.correctionReason === "string"
            ? body.correctionReason.trim()
            : "";
        if (!isFirstEntry && !submittedReason) {
          throw new Error("PAYEE_REASON_REQUIRED");
        }
        ruleDrivenData.channelPayeeSnapshot = JSON.stringify(after);
        ruleDrivenData.auditLog = appendAuditEntry(existing.auditLog, {
          type: "CHANNEL_PAYEE_SNAPSHOT",
          actorId: session.userId,
          at: new Date().toISOString(),
          reason: isFirstEntry ? "首次录入" : submittedReason,
          before: { channelPayeeSnapshot: before },
          after: { channelPayeeSnapshot: after },
        });
      }

      const updated = await prisma.channelReconciliation.update({
        where: { id },
        data: ruleDrivenData,
      });
      return NextResponse.json(updated);
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };

    // 新版分账管理配置字段
    if ("totalPeriods" in body) data.totalPeriods = body.totalPeriods ? Number(body.totalPeriods) : null;
    if ("periodType" in body) data.periodType = body.periodType || null;
    if ("fixedFeeTotal" in body) data.fixedFeeTotal = body.fixedFeeTotal != null ? Number(body.fixedFeeTotal) : null;
    if ("commissionTotal" in body) data.commissionTotal = body.commissionTotal != null ? Number(body.commissionTotal) : null;
    if ("fixedFeeShareRate" in body && !("fixedFeeReceived" in body)) {
      data.fixedFeeShareRate = Number(body.fixedFeeShareRate);
    }
    if ("commissionShareRate" in body && !("commissionReceived" in body)) {
      data.commissionShareRate = Number(body.commissionShareRate);
    }

    // 通用字段
    if ("note" in body) data.note = body.note;
    if ("periodNo" in body) data.periodNo = body.periodNo;
    if ("periodStart" in body)
      data.periodStart = body.periodStart ? new Date(body.periodStart) : null;
    if ("periodEnd" in body)
      data.periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;

    // 固费分账
    const fixedFields = [
      "fixedFeeReceived",
      "fixedFeeShareRate",
      "fixedFeeShareCurrency",
      "fixedFeeProofUrl",
      "fixedFeePushedToChannel",
    ];
    for (const k of fixedFields) {
      if (k in body) data[k] = body[k];
    }
    if ("fixedFeeEstimatedDate" in body) {
      data.fixedFeeEstimatedDate = body.fixedFeeEstimatedDate
        ? new Date(body.fixedFeeEstimatedDate)
        : null;
    }
    if ("fixedFeeActualDate" in body) {
      data.fixedFeeActualDate = body.fixedFeeActualDate
        ? new Date(body.fixedFeeActualDate)
        : null;
    }

    // 抽佣分账
    const commFields = [
      "commissionReceived",
      "commissionShareRate",
      "commissionShareCurrency",
      "commissionProofUrl",
      "commissionPushedToChannel",
    ];
    for (const k of commFields) {
      if (k in body) data[k] = body[k];
    }
    if ("commissionEstimatedDate" in body) {
      data.commissionEstimatedDate = body.commissionEstimatedDate
        ? new Date(body.commissionEstimatedDate)
        : null;
    }
    if ("commissionActualDate" in body) {
      data.commissionActualDate = body.commissionActualDate
        ? new Date(body.commissionActualDate)
        : null;
    }

    // 自动重算 shareAmount = received × rate
    const finalReceived =
      "fixedFeeReceived" in body
        ? body.fixedFeeReceived
        : existing.fixedFeeReceived;
    const finalRate =
      "fixedFeeShareRate" in body
        ? body.fixedFeeShareRate
        : existing.fixedFeeShareRate;
    if (finalReceived != null && finalRate != null) {
      data.fixedFeeShareAmount = (finalReceived ?? 0) * (finalRate ?? 0);
    }

    const commFinalReceived =
      "commissionReceived" in body
        ? body.commissionReceived
        : existing.commissionReceived;
    const commFinalRate =
      "commissionShareRate" in body
        ? body.commissionShareRate
        : existing.commissionShareRate;
    if (commFinalReceived != null && commFinalRate != null) {
      data.commissionShareAmount =
        (commFinalReceived ?? 0) * (commFinalRate ?? 0);
    }

    const updated = await prisma.channelReconciliation.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (e instanceof Error) {
      if (e.message === "PAYEE_INVALID") {
        return NextResponse.json(
          { error: "收款信息格式无效或包含不支持的字段" },
          { status: 400 },
        );
      }
      if (e.message === "PAYEE_TOO_LONG") {
        return NextResponse.json(
          { error: "收款信息字段内容过长" },
          { status: 400 },
        );
      }
      if (e.message === "PAYEE_AUDIT_INVALID") {
        return NextResponse.json(
          { error: "历史收款信息格式无效，已拒绝覆盖" },
          { status: 409 },
        );
      }
      if (e.message === "PAYEE_REASON_REQUIRED") {
        return NextResponse.json(
          { error: "修改已有收款信息时必须填写修改原因" },
          { status: 400 },
        );
      }
    }
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE /api/finance/channel-reconciliations/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "MANAGE");
    if (session.role !== "ADMIN" && session.role !== "USER") {
      return NextResponse.json(
        { error: "仅内部员工可删除渠道商分账" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const existing = await prisma.channelReconciliation.findFirst({
      where: {
        AND: [
          { id },
          channelReconciliationScope(
            session,
            session.role === "ADMIN" ? "all" : "mine",
          ),
        ],
      },
      select: {
        id: true,
        periods: {
          where: {
            OR: [
              { fixedFeePaidAt: { not: null } },
              { commissionPaidAt: { not: null } },
            ],
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.periods.length > 0) {
      return NextResponse.json(
        { error: "该分账已有向渠道商付款的锁定期，不能删除" },
        { status: 409 },
      );
    }
    await prisma.channelReconciliation.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
