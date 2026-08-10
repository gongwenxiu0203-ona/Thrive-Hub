"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasBiPermission } from "@/lib/biAuthorization";
import { customerScope, salesScope } from "@/lib/dataScope";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  type SalesRecordFilterParams,
} from "@/lib/salesRecordFilters";
import { activeSalesRecordWhere } from "@/lib/activeSalesScope";

export type SalesRecordUndoSnapshot = {
  id: string;
  customerId: string | null;
  brand: string;
};

export type SalesBulkMutationResult = {
  count: number;
  undoCustomerSnapshots?: SalesRecordUndoSnapshot[];
  undoDeleteIds?: string[];
  logId?: string;
};

export type SalesBulkOperationLogRow = {
  id: string;
  actionType: string;
  summary: string;
  recordCount: number;
  operatorName: string;
  createdAt: string;
  revertedAt: string | null;
};

const BI_SALES_DETAIL_LOG_MODULE = "BI_SALES_DETAIL";

function bulkActionLabel(actionType: string) {
  if (actionType === "CUSTOMER_UPDATE") return "批量修改关联客户";
  if (actionType === "DELETE") return "批量删除明细";
  return actionType;
}

async function createSalesBulkLog({
  sessionUserId,
  actionType,
  summary,
  recordCount,
  snapshot,
}: {
  sessionUserId: string;
  actionType: "CUSTOMER_UPDATE" | "DELETE";
  summary: string;
  recordCount: number;
  snapshot: unknown;
}) {
  return prisma.bulkOperationLog.create({
    data: {
      module: BI_SALES_DETAIL_LOG_MODULE,
      actionType,
      summary,
      recordCount,
      snapshotJson: JSON.stringify(snapshot),
      operatorId: sessionUserId,
    },
    select: { id: true },
  });
}

async function requireBi(userId: string, level: "EDIT" | "MANAGE") {
  if (!(await hasBiPermission(userId, "bi.manage", level))) {
    throw new Error("无权执行该 BI 操作");
  }
}

async function salesWhereFromFilterParams(
  filterParams: SalesRecordFilterParams,
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const types = csvFilterValues(filterParams, "types").filter((v) => v !== EMPTY_FILTER_VALUE);
  let typeAffNames: string[] | undefined;
  if (types.length) {
    const affLibrary = await prisma.affiliate.findMany({
      where: { affiliateType: { in: types }, deletedAt: null },
      select: { platformAffiliateName: true },
    });
    typeAffNames = affLibrary.map((a) => a.platformAffiliateName.trim()).filter(Boolean);
  }
  return {
    AND: [
      activeSalesRecordWhere(),
      salesScope(session, session.role === "ADMIN" ? "all" : "mine"),
      buildSalesRecordWhereFromParams(filterParams, typeAffNames),
    ],
  };
}

export async function deleteBatch(batchId: string) {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const batch = await prisma.salesBatch.findFirst({
    where: {
      id: batchId,
      OR: [
        { uploaderId: session.userId },
        { customer: customerScope(session, session.role === "ADMIN" ? "all" : "mine") },
      ],
    },
  });
  if (!batch) throw new Error("批次不存在或无权操作");
  // 软删除：进回收站（恢复后销售记录仍在；到期物理清理会级联删除记录）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.salesBatch.update as any)({ where: { id: batchId }, data: { deletedAt: new Date() } });
  revalidatePath("/bi");
}

export async function bulkUpdateSalesRecordsCustomer(recordIds: string[], customerId: string): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "EDIT");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要修改的数据记录");
  if (!customerId) throw new Error("请选择要关联的客户");
  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id: customerId, deletedAt: null }, customerScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    select: { brandName: true },
  });
  if (!customer) throw new Error("客户不存在或已删除");

  const snapshots = await prisma.salesRecord.findMany({
    where: { AND: [{ id: { in: ids }, deletedAt: null }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    select: { id: true, customerId: true, brand: true },
  });
  const result = await prisma.salesRecord.updateMany({
    where: { AND: [{ id: { in: ids }, deletedAt: null }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    data: {
      customerId,
      brand: customer.brandName,
    },
  });
  const log = await createSalesBulkLog({
    sessionUserId: session.userId,
    actionType: "CUSTOMER_UPDATE",
    summary: `批量关联客户为「${customer.brandName}」（当前页选中）`,
    recordCount: result.count,
    snapshot: { snapshots },
  });
  revalidatePath("/bi");
  return { count: result.count, undoCustomerSnapshots: snapshots, logId: log.id };
}

export async function bulkUpdateSalesRecordsCustomerByFilter(
  filterParams: SalesRecordFilterParams,
  customerId: string,
): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "EDIT");
  if (!customerId) throw new Error("请选择要关联的客户");
  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id: customerId, deletedAt: null }, customerScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    select: { brandName: true },
  });
  if (!customer) throw new Error("客户不存在或已删除");

  const where = await salesWhereFromFilterParams(filterParams, session);
  const snapshots = await prisma.salesRecord.findMany({
    where,
    select: { id: true, customerId: true, brand: true },
  });
  if (!snapshots.length) throw new Error("当前筛选下没有可修改的数据记录");
  const result = await prisma.salesRecord.updateMany({
    where,
    data: { customerId, brand: customer.brandName },
  });
  const log = await createSalesBulkLog({
    sessionUserId: session.userId,
    actionType: "CUSTOMER_UPDATE",
    summary: `批量关联客户为「${customer.brandName}」（当前筛选全部）`,
    recordCount: result.count,
    snapshot: { snapshots },
  });
  revalidatePath("/bi");
  return { count: result.count, undoCustomerSnapshots: snapshots, logId: log.id };
}

export async function bulkDeleteSalesRecords(recordIds: string[]): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要删除的数据记录");
  const rows = await prisma.salesRecord.findMany({
    where: { AND: [{ id: { in: ids }, deletedAt: null }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    select: { id: true },
  });
  const result = await prisma.salesRecord.updateMany({
    where: { AND: [{ id: { in: ids }, deletedAt: null }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    data: { deletedAt: new Date() },
  });
  const undoDeleteIds = rows.map((r) => r.id);
  const log = await createSalesBulkLog({
    sessionUserId: session.userId,
    actionType: "DELETE",
    summary: "批量删除推广数据明细（当前页选中）",
    recordCount: result.count,
    snapshot: { ids: undoDeleteIds },
  });
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { count: result.count, undoDeleteIds, logId: log.id };
}

export async function bulkDeleteSalesRecordsByFilter(
  filterParams: SalesRecordFilterParams,
): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const where = await salesWhereFromFilterParams(filterParams, session);
  const rows = await prisma.salesRecord.findMany({
    where,
    select: { id: true },
  });
  if (!rows.length) throw new Error("当前筛选下没有可删除的数据记录");
  const result = await prisma.salesRecord.updateMany({
    where,
    data: { deletedAt: new Date() },
  });
  const undoDeleteIds = rows.map((r) => r.id);
  const log = await createSalesBulkLog({
    sessionUserId: session.userId,
    actionType: "DELETE",
    summary: "批量删除推广数据明细（当前筛选全部）",
    recordCount: result.count,
    snapshot: { ids: undoDeleteIds },
  });
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { count: result.count, undoDeleteIds, logId: log.id };
}

export async function undoBulkUpdateSalesRecordsCustomer(snapshots: SalesRecordUndoSnapshot[]): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const rows = snapshots.filter((s) => s.id);
  if (!rows.length) throw new Error("没有可撤回的批量修改");
  const groups = new Map<string, SalesRecordUndoSnapshot[]>();
  for (const row of rows) {
    const key = `${row.customerId ?? ""}\u0000${row.brand}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    if (group[0].customerId) {
      const target = await prisma.customer.findFirst({
        where: { AND: [{ id: group[0].customerId, deletedAt: null }, customerScope(session, session.role === "ADMIN" ? "all" : "mine")] },
        select: { id: true, brandName: true },
      });
      if (!target || target.brandName !== group[0].brand) throw new Error("撤回目标客户无权访问或快照无效");
    }
    await prisma.salesRecord.updateMany({
      where: { AND: [{ id: { in: group.map((row) => row.id) } }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
      data: { customerId: group[0].customerId, brand: group[0].brand },
    });
  }
  revalidatePath("/bi");
  return { count: rows.length };
}

export async function undoBulkDeleteSalesRecords(recordIds: string[]): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("没有可撤回的批量删除");
  const result = await prisma.salesRecord.updateMany({
    where: { AND: [{ id: { in: ids } }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
    data: { deletedAt: null },
  });
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { count: result.count };
}

export async function getSalesBulkOperationLogs(): Promise<SalesBulkOperationLogRow[]> {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const logs = await prisma.bulkOperationLog.findMany({
    where: { module: BI_SALES_DETAIL_LOG_MODULE, ...(session.role === "ADMIN" ? {} : { operatorId: session.userId }) },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { operator: { select: { name: true } } },
  });
  return logs.map((log) => ({
    id: log.id,
    actionType: bulkActionLabel(log.actionType),
    summary: log.summary,
    recordCount: log.recordCount,
    operatorName: log.operator.name,
    createdAt: log.createdAt.toISOString(),
    revertedAt: log.revertedAt ? log.revertedAt.toISOString() : null,
  }));
}

export async function undoSalesBulkOperationLogs(logIds: string[]): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  await requireBi(session.userId, "MANAGE");
  const ids = [...new Set(logIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要撤销的操作日志");

  const logs = await prisma.bulkOperationLog.findMany({
    where: {
      id: { in: ids },
      module: BI_SALES_DETAIL_LOG_MODULE,
      revertedAt: null,
      ...(session.role === "ADMIN" ? {} : { operatorId: session.userId }),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!logs.length) throw new Error("所选日志均已撤销或不存在");

  const now = new Date();
  const restored = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const log of logs) {
      const snapshot = JSON.parse(log.snapshotJson || "{}") as {
        snapshots?: SalesRecordUndoSnapshot[];
        ids?: string[];
      };
      if (log.actionType === "CUSTOMER_UPDATE") {
        const rows = (snapshot.snapshots ?? []).filter((row) => row.id);
        const groups = new Map<string, SalesRecordUndoSnapshot[]>();
        for (const row of rows) {
          const key = `${row.customerId ?? ""}\u0000${row.brand}`;
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        for (const group of groups.values()) {
          const targetCustomerId = group[0].customerId;
          if (targetCustomerId) {
            const target = await tx.customer.findFirst({
              where: {
                id: targetCustomerId,
                brandName: group[0].brand,
                deletedAt: null,
                ...customerScope(session, session.role === "ADMIN" ? "all" : "mine"),
              },
              select: { id: true },
            });
            if (!target) throw new Error("历史客户已不存在、品牌不匹配或无权访问");
          }
          const result = await tx.salesRecord.updateMany({
            where: { AND: [{ id: { in: group.map((row) => row.id) } }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
            data: { customerId: targetCustomerId, brand: group[0].brand },
          });
          count += result.count;
        }
      } else if (log.actionType === "DELETE") {
        const recordIds = [...new Set((snapshot.ids ?? []).filter(Boolean))];
        if (recordIds.length) {
          const result = await tx.salesRecord.updateMany({
            where: { AND: [{ id: { in: recordIds } }, salesScope(session, session.role === "ADMIN" ? "all" : "mine")] },
            data: { deletedAt: null },
          });
          count += result.count;
        }
      }
      await tx.bulkOperationLog.update({
        where: { id: log.id },
        data: { revertedAt: now, revertedById: session.userId },
      });
    }
    return count;
  });

  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { count: restored };
}
