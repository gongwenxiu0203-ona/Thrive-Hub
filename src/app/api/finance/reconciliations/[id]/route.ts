import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/appError";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { recalcReconciliation } from "@/lib/reconciliationCalc";
import { parseDateOnlyUtc } from "@/lib/dateRange";

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
    const hasCurrencyFields = currencyFields.some((key) => key in body);
    if (hasCurrencyFields && existing.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "已确认的对账记录已锁定，不能修改币种" },
        { status: 409 },
      );
    }
    const draftOnlyFields = [
      "periodStart", "periodEnd",
      "betType", "betOrderCount", "betSalesAmount",
      "actualOrders", "actualSalesAmount",
      "gmvBaseline", // EXCESS 模式手动填写
    ];

    const data: Record<string, unknown> = { updatedAt: new Date() };

    // 货币字段
    for (const key of currencyFields) {
      if (key in body) data[key] = body[key];
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
    const existing = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: { settlements: { select: { status: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "对账记录不存在或您无权访问" }, { status: 404 });
    }
    if (existing.status === "CONFIRMED") {
      return NextResponse.json({ error: "已确认的对账记录属于财务历史，不能删除" }, { status: 409 });
    }
    if (existing.settlements.some((settlement) => settlement.status === "SETTLED")) {
      return NextResponse.json({ error: "该对账记录已存在已结算款项，不能删除" }, { status: 409 });
    }

    await prisma.customerReconciliation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.delete");
  }
}
