import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { recalcReconciliation } from "@/lib/reconciliationCalc";

// GET /api/finance/reconciliations/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "READ", req);
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

    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rec);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 货币字段任何状态可改
    const currencyFields = ["fixedFeeCurrency", "commissionCurrency"];
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
      for (const key of draftOnlyFields) {
        if (key in body) {
          if (key === "periodStart" || key === "periodEnd") {
            data[key] = new Date(body[key]);
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

    const result = await prisma.customerReconciliation.update({ where: { id }, data });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
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
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.customerReconciliation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
