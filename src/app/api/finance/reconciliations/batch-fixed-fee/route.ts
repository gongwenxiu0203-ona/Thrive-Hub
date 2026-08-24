import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/appError";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { requireSession } from "@/lib/session";

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", request);
    const body = await request.json().catch(() => ({}));
    const rawIds: unknown[] = Array.isArray(body.reconciliationIds)
      ? body.reconciliationIds
      : [];
    const ids: string[] = [
      ...new Set(
        rawIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ];
    const amount = Number(body.feeAmount);
    const currency = String(body.currency ?? "USD")
      .trim()
      .toUpperCase();
    if (!ids.length || ids.length > 100)
      return NextResponse.json(
        { error: "请选择 1 至 100 条固费对账记录。" },
        { status: 400 },
      );
    if (!Number.isFinite(amount) || amount < 0)
      return NextResponse.json(
        { error: "请输入有效的固费金额。" },
        { status: 400 },
      );
    if (!/^[A-Z]{3,8}$/.test(currency))
      return NextResponse.json(
        { error: "币种请输入 USD、CNY、EUR 等货币代码。" },
        { status: 400 },
      );
    const records = await prisma.customerReconciliation.findMany({
      where: { AND: [{ id: { in: ids }, deletedAt: null }, access.scope] },
      select: { id: true, reconcileType: true, status: true },
    });
    if (records.length !== ids.length)
      return NextResponse.json(
        { error: "部分记录不存在或不在你的数据范围内。" },
        { status: 404 },
      );
    if (records.some((row) => row.reconcileType !== "FEE_ONLY"))
      return NextResponse.json(
        { error: "批量修改只支持固费对账记录。" },
        { status: 400 },
      );
    if (records.some((row) => !["DRAFT", "DISPUTED"].includes(row.status)))
      return NextResponse.json(
        { error: "只能修改尚未提交确认或处于异议状态的固费记录。" },
        { status: 409 },
      );
    const result = await prisma.customerReconciliation.updateMany({
      where: { id: { in: ids } },
      data: {
        feeAmount: Math.round(amount * 100) / 100,
        fixedFeeCurrency: currency,
        finalFeeAmount: null,
      },
    });
    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    if (error instanceof FeaturePermissionError)
      return NextResponse.json(
        { error: "无权批量修改固费对账。" },
        { status: 403 },
      );
    return errorResponse(error, "finance.reconciliation.batch-fixed-fee");
  }
}
