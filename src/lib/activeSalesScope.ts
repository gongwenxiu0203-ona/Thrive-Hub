import type { Prisma } from "@prisma/client";
import { shanghaiDateRangeFromUtcSentinels } from "@/lib/dateRange";

/**
 * Canonical scope for sales data that is active in BI-derived business flows.
 * Soft-deleted records and records belonging to a soft-deleted upload batch
 * must both stay available for recovery, but must not participate in totals.
 */
export function activeSalesRecordWhere(
  where: Prisma.SalesRecordWhereInput = {},
): Prisma.SalesRecordWhereInput {
  return {
    AND: [{ deletedAt: null, batch: { deletedAt: null } }, where],
  };
}

/** Build the shared customer-reconciliation BI scope. */
export function reconciliationSalesRecordWhere(input: {
  customerId: string;
  periodStart: Date;
  periodEnd: Date;
}): Prisma.SalesRecordWhereInput {
  return activeSalesRecordWhere({
    customerId: input.customerId,
    orderDate: shanghaiDateRangeFromUtcSentinels(
      input.periodStart,
      input.periodEnd,
    ),
  });
}
