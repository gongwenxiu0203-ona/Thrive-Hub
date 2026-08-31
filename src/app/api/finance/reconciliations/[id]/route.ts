import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/appError";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { recalcReconciliation } from "@/lib/reconciliationCalc";
import { parseDateOnlyUtc } from "@/lib/dateRange";
import { readReconciliationConfirmation } from "@/lib/reconciliationConfirmation";

// GET /api/finance/reconciliations/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "READ", req, true);
    const { id } = await params;

    const rec = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            channelUserId: true,
            businessOwnerId: true,
            businessOwner: { select: { id: true, name: true, email: true } },
          },
        },
        contract: { select: { id: true, contractNo: true, type: true, startDate: true, endDate: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        reviews: {
          include: { reviewer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        settlements: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { type: "asc" },
        },
      },
    });

    if (!rec) return NextResponse.json({ error: "客户对账记录不存在、已删除或无权访问" }, { status: 404 });
    return NextResponse.json(rec);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "登录状态已失效，请重新登录后再操作" }, { status: 401 });
  }
}

// PATCH /api/finance/reconciliations/[id]
// - 货币字段（fixedFeeCurrency / commissionCurrency）：任何状态均可修改
// - 其他对账字段：仅 DRAFT 状态可修改
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", req);
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.customerReconciliation.findFirst({ where: scopedReconciliationWhere(id, access.scope) });
    if (!existing) return NextResponse.json({ error: "对账记录不存在或您无权访问" }, { status: 404 });

    // 货币字段任何状态可改
    const currencyFields = ["fixedFeeCurrency", "commissionCurrency"];
    const draftOnlyFields = [
      "confirmedCommissionRate",
      "periodStart", "periodEnd",
      "betType", "betOrderCount", "betSalesAmount",
      "actualOrders", "actualSalesAmount",
      "gmvBaseline", // EXCESS 模式手动填写
    ];

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if ("confirmedCommissionRate" in body) {
      const draft = readReconciliationConfirmation(existing);
      if (!existing.projectConfirmationId || existing.reconcileType === "FEE_ONLY" || draft?.commission?.mode !== "PACKAGE") {
        return NextResponse.json({ error: "只有总包佣金对账可以核定实际比例" }, { status: 400 });
      }
      if (typeof body.confirmedCommissionRate !== "number" || !Number.isFinite(body.confirmedCommissionRate) || body.confirmedCommissionRate < 0 || body.confirmedCommissionRate > 1) {
        return NextResponse.json({ error: "实际抽佣比例必须为0%至100%" }, { status: 400 });
      }
    }

    // 货币字段
    for (const key of currencyFields) {
      if (key in body) {
        const currency = String(body[key] ?? "").trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) {
          return NextResponse.json(
            { error: "币种必须是有效的三位国际币种代码" },
            { status: 400 },
          );
        }
        data[key] = currency;
      }
    }

    // 草稿专属字段
    const hasDraftFields = draftOnlyFields.some((k) => k in body);
    if (hasDraftFields) {
      if (existing.status !== "DRAFT") {
        return NextResponse.json({ error: "只能修改草稿状态的对账记录" }, { status: 400 });
      }
      const parsedPeriodStart = "periodStart" in body
        ? typeof body.periodStart === "string"
          ? parseDateOnlyUtc(body.periodStart)
          : null
        : existing.periodStart;
      const parsedPeriodEnd = "periodEnd" in body
        ? typeof body.periodEnd === "string"
          ? parseDateOnlyUtc(body.periodEnd)
          : null
        : existing.periodEnd;
      if (!parsedPeriodStart || !parsedPeriodEnd) {
        return NextResponse.json({ error: "对账周期日期格式无效" }, { status: 400 });
      }
      if (parsedPeriodStart > parsedPeriodEnd) {
        return NextResponse.json(
          { error: "对账周期结束时间不能早于开始时间" },
          { status: 400 },
        );
      }

      const periodChanged = parsedPeriodStart.getTime() !== existing.periodStart.getTime()
        || parsedPeriodEnd.getTime() !== existing.periodEnd.getTime();
      if (periodChanged) {
        if (existing.projectConfirmationId) return NextResponse.json({ error: "确认书对账周期由生效版本生成，请通过确认书调整流程处理" }, { status: 400 });
        const reason = typeof body.adjustmentReason === "string" ? body.adjustmentReason.trim() : "";
        if (!reason) {
          return NextResponse.json({ error: "调整对账周期时必须填写调整原因" }, { status: 400 });
        }
        const contract = await prisma.contract.findUnique({
          where: { id: existing.contractId },
          select: { startDate: true, endDate: true },
        });
        if ((contract?.startDate && parsedPeriodStart < contract.startDate)
          || (contract?.endDate && parsedPeriodEnd > contract.endDate)) {
          return NextResponse.json({ error: "调整后的对账周期不能超出合同有效期" }, { status: 400 });
        }
        const conflictingTypes = [existing.reconcileType, "BOTH"];
        const overlap = await prisma.customerReconciliation.findFirst({
          where: {
            id: { not: id },
            contractId: existing.contractId,
            projectConfirmationId: existing.projectConfirmationId,
            deletedAt: null,
            reconcileType: { in: conflictingTypes },
            periodStart: { lte: parsedPeriodEnd },
            periodEnd: { gte: parsedPeriodStart },
          },
          select: { id: true },
        });
        if (overlap) {
          return NextResponse.json({ error: "调整后的周期与同一合同、同一费用类型的现有对账记录重叠" }, { status: 409 });
        }
        data.periodAdjusted = true;
        data.adjustmentReason = reason;
        data.periodStart = parsedPeriodStart;
        data.periodEnd = parsedPeriodEnd;
        if (!existing.originalPeriodStart) data.originalPeriodStart = existing.periodStart;
        if (!existing.originalPeriodEnd) data.originalPeriodEnd = existing.periodEnd;
      }

      for (const key of draftOnlyFields) {
        if (key in body) {
          if (key === "periodStart") {
            data[key] = parsedPeriodStart;
          } else if (key === "periodEnd") {
            data[key] = parsedPeriodEnd;
          } else {
            data[key] = body[key];
          }
        }
      }
      // 重新计算抽佣（v3：根据合同 commissionType + 阶梯/门槛/超额逻辑）
      const updated = { ...existing, ...data };
      const calc = await recalcReconciliation(id, updated as Record<string, unknown>);
      Object.assign(data, calc);
    }

    const periodChanged = data.periodAdjusted === true;
    const result = await prisma.$transaction(async (tx) => {
      if ("confirmedCommissionRate" in data) {
        await tx.financeAuditLog.create({ data: { entityType: "CUSTOMER_RECONCILIATION", entityId: id, action: "CONFIRM_PACKAGE_RATE", actorId: session.userId, note: "核定本期总包佣金实际抽佣比例", metadata: JSON.stringify({ before: existing.confirmedCommissionRate, after: data.confirmedCommissionRate }) } });
      }
      if (periodChanged) {
        await tx.reconciliationPeriodAudit.create({
          data: {
            reconciliationId: id,
            actorId: session.userId,
            beforeStart: existing.periodStart,
            beforeEnd: existing.periodEnd,
            afterStart: data.periodStart as Date,
            afterEnd: data.periodEnd as Date,
            reason: data.adjustmentReason as string,
          },
        });
      }
      return tx.customerReconciliation.update({ where: { id }, data });
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.update");
  }
}

// DELETE /api/finance/reconciliations/[id] — 软删除单条月度对账
// 设置 deletedAt = now()，7 天内可恢复，到期后访问列表时自动物理清理
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "MANAGE", req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const deletionReason = typeof body.reason === "string" ? body.reason.trim() : "";
    const existing = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: { settlements: { select: { status: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "对账记录不存在或您无权访问" }, { status: 404 });
    }
    const completed = existing.status === "CONFIRMED"
      || existing.settlements.some((settlement) => settlement.status === "SETTLED");
    if (completed && session.role !== "ADMIN") {
      return NextResponse.json({ error: "只有管理员可以删除已确认或已结算的客户对账" }, { status: 403 });
    }
    if (completed && !deletionReason) {
      return NextResponse.json({ error: "删除已完成的客户对账必须填写删除原因" }, { status: 400 });
    }

    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.customerReconciliation.update({
        where: { id },
        data: { deletedAt },
      });
      await tx.financeAuditLog.create({
        data: {
          entityType: "CUSTOMER_RECONCILIATION",
          entityId: id,
          action: "SOFT_DELETE",
          actorId: session.userId,
          fromStatus: existing.status,
          toStatus: "DELETED",
          note: deletionReason || null,
          metadata: JSON.stringify({
            completed,
            settlementStatuses: existing.settlements.map((item) => item.status),
            deletedAt: deletedAt.toISOString(),
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.delete");
  }
}
