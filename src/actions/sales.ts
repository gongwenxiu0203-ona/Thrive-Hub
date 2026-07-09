"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  type SalesRecordFilterParams,
} from "@/lib/salesRecordFilters";

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

async function salesWhereFromFilterParams(filterParams: SalesRecordFilterParams) {
  const types = csvFilterValues(filterParams, "types").filter((v) => v !== EMPTY_FILTER_VALUE);
  let typeAffNames: string[] | undefined;
  if (types.length) {
    const affLibrary = await prisma.affiliate.findMany({
      where: { affiliateType: { in: types } },
      select: { platformAffiliateName: true },
    });
    typeAffNames = affLibrary.map((a) => a.platformAffiliateName.trim()).filter(Boolean);
  }
  return {
    AND: [
      { deletedAt: null, batch: { deletedAt: null } },
      buildSalesRecordWhereFromParams(filterParams, typeAffNames),
    ],
  };
}

export async function deleteBatch(batchId: string) {
  const session = await requireSession();
  if (!isStaff(session.role)) {
    const batch = await prisma.salesBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.uploaderId !== session.userId) {
      throw new Error("仅上传者或内部员工可删除该批次");
    }
  }
  // 软删除：进回收站（恢复后销售记录仍在；到期物理清理会级联删除记录）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.salesBatch.update as any)({ where: { id: batchId }, data: { deletedAt: new Date() } });
  revalidatePath("/bi");
}

export async function bulkUpdateSalesRecordsCustomer(recordIds: string[], customerId: string): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("仅内部员工可批量修改推广数据关联客户");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要修改的数据记录");
  if (!customerId) throw new Error("请选择要关联的客户");
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { brandName: true },
  });
  if (!customer) throw new Error("客户不存在或已删除");

  const snapshots = await prisma.salesRecord.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, customerId: true, brand: true },
  });
  const result = await prisma.salesRecord.updateMany({
    where: { id: { in: ids }, deletedAt: null },
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
  if (!isStaff(session.role)) throw new Error("仅内部员工可批量修改推广数据关联客户");
  if (!customerId) throw new Error("请选择要关联的客户");
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { brandName: true },
  });
  if (!customer) throw new Error("客户不存在或已删除");

  const where = await salesWhereFromFilterParams(filterParams);
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
  if (!isStaff(session.role)) throw new Error("仅内部员工可删除推广数据明细");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要删除的数据记录");
  const rows = await prisma.salesRecord.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  const result = await prisma.salesRecord.updateMany({
    where: { id: { in: ids }, deletedAt: null },
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
  if (!isStaff(session.role)) throw new Error("仅内部员工可删除推广数据明细");
  const where = await salesWhereFromFilterParams(filterParams);
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
  if (!isStaff(session.role)) throw new Error("仅内部员工可撤回推广数据批量修改");
  const rows = snapshots.filter((s) => s.id);
  if (!rows.length) throw new Error("没有可撤回的批量修改");
  const groups = new Map<string, SalesRecordUndoSnapshot[]>();
  for (const row of rows) {
    const key = `${row.customerId ?? ""}\u0000${row.brand}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    await prisma.salesRecord.updateMany({
      where: { id: { in: group.map((row) => row.id) } },
      data: { customerId: group[0].customerId, brand: group[0].brand },
    });
  }
  revalidatePath("/bi");
  return { count: rows.length };
}

export async function undoBulkDeleteSalesRecords(recordIds: string[]): Promise<SalesBulkMutationResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("仅内部员工可撤回推广数据批量删除");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("没有可撤回的批量删除");
  const result = await prisma.salesRecord.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: null },
  });
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { count: result.count };
}

export async function getSalesBulkOperationLogs(): Promise<SalesBulkOperationLogRow[]> {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("仅内部员工可查看批量操作日志");
  const logs = await prisma.bulkOperationLog.findMany({
    where: { module: BI_SALES_DETAIL_LOG_MODULE },
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
  if (!isStaff(session.role)) throw new Error("仅内部员工可撤销批量操作日志");
  const ids = [...new Set(logIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要撤销的操作日志");

  const logs = await prisma.bulkOperationLog.findMany({
    where: {
      id: { in: ids },
      module: BI_SALES_DETAIL_LOG_MODULE,
      revertedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!logs.length) throw new Error("所选日志均已撤销或不存在");

  let restored = 0;
  const now = new Date();
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
        const result = await prisma.salesRecord.updateMany({
          where: { id: { in: group.map((row) => row.id) } },
          data: { customerId: group[0].customerId, brand: group[0].brand },
        });
        restored += result.count;
      }
    } else if (log.actionType === "DELETE") {
      const recordIds = [...new Set((snapshot.ids ?? []).filter(Boolean))];
      if (recordIds.length) {
        const result = await prisma.salesRecord.updateMany({
          where: { id: { in: recordIds } },
          data: { deletedAt: null },
        });
        restored += result.count;
      }
    }
    await prisma.bulkOperationLog.update({
      where: { id: log.id },
      data: { revertedAt: now, revertedById: session.userId },
    });
  }

  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { count: restored };
}
