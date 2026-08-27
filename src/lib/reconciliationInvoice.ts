import { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient;

export type ReconciliationInvoiceState = {
  invoiceId: string;
  invoiceNo: string;
  invoiceStatus: string;
  documentType: string;
  originalFileUrl: string | null;
  receivableStatus: string | null;
  receivedAmount: number | null;
  totalAmount: number;
  currencyTotals: Array<{ currency: string; amount: number }>;
};

function normalizeCurrency(value: string): string {
  const clean = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    人民币: "CNY",
    人民币元: "CNY",
    "￥": "CNY",
    RMB: "CNY",
    CNY: "CNY",
    美金: "USD",
    美元: "USD",
    "$": "USD",
    USD: "USD",
  };
  return aliases[clean] ?? clean;
}

/**
 * Legacy mutation entry point retained only so older imports fail safely.
 * Reconciliation records must now be loaded into the Invoice editor, where
 * the user confirms each item's currency and billing period before saving.
 */
export async function ensureInvoiceDraftForReconciliations(
  _tx: DbClient,
  _reconciliationIds: string[],
  _createdById: string,
): Promise<{ invoiceId: string; existing: boolean }> {
  throw new Error(
    "旧的对账自动建 Invoice 草稿入口已停用，请从 Invoice 新建页载入对账记录并确认项目币种与费用期间。",
  );
}

export async function getReconciliationInvoiceStateMap(
  db: Pick<DbClient, "invoiceReconciliation">,
  reconciliationIds: string[],
): Promise<Record<string, ReconciliationInvoiceState>> {
  const ids = Array.from(new Set(reconciliationIds.filter(Boolean)));
  if (!ids.length) return {};

  const links = await db.invoiceReconciliation.findMany({
    where: { reconciliationId: { in: ids }, invoice: { deletedAt: null } },
    select: {
      reconciliationId: true,
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          documentType: true,
          originalFileUrl: true,
          totalAmount: true,
          domesticDocument: { select: { originalFileUrl: true } },
          items: { select: { currency: true, amount: true } },
          accountsReceivable: {
            select: { status: true, receivedAmount: true },
          },
        },
      },
    },
  });

  return Object.fromEntries(
    links.map((link) => {
      const totals = new Map<string, number>();
      for (const item of link.invoice.items) {
        const currency = normalizeCurrency(item.currency);
        totals.set(currency, (totals.get(currency) ?? 0) + item.amount);
      }
      const currencyTotals = Array.from(
        totals,
        ([currency, amount]) => ({ currency, amount }),
      ).sort((left, right) => left.currency.localeCompare(right.currency));

      return [
        link.reconciliationId,
        {
          invoiceId: link.invoice.id,
          invoiceNo: link.invoice.invoiceNo,
          invoiceStatus: link.invoice.status,
          documentType: link.invoice.documentType,
          originalFileUrl: link.invoice.domesticDocument?.originalFileUrl ?? link.invoice.originalFileUrl ?? null,
          receivableStatus: link.invoice.accountsReceivable?.status ?? null,
          receivedAmount:
            link.invoice.accountsReceivable?.receivedAmount ?? null,
          totalAmount:
            currencyTotals.length === 1
              ? currencyTotals[0].amount
              : link.invoice.totalAmount,
          currencyTotals,
        },
      ];
    }),
  );
}
