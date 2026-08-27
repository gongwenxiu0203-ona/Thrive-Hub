import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

function tombstone(kind: "CONTRACT" | "INVOICE", id: string, number: string) {
  return `__DELETED__${kind}__${id}__${number}`;
}

/**
 * Active and void records keep their number. A soft-deleted record is renamed
 * inside the caller's transaction so its former business number can be reused.
 */
export async function releaseDeletedContractNumber(
  tx: Tx,
  contractNo: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await tx.contract.findUnique({
    where: { contractNo },
    select: { id: true, deletedAt: true },
  });
  if (!existing || existing.id === excludeId) return true;
  if (!existing.deletedAt) return false;
  await tx.contract.update({
    where: { id: existing.id },
    data: { contractNo: tombstone("CONTRACT", existing.id, contractNo) },
  });
  return true;
}

export async function releaseDeletedInvoiceNumber(
  tx: Tx,
  invoiceNo: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await tx.invoice.findUnique({
    where: { invoiceNo },
    select: { id: true, deletedAt: true },
  });
  if (!existing || existing.id === excludeId) return true;
  if (!existing.deletedAt) return false;
  await tx.invoice.update({
    where: { id: existing.id },
    data: { invoiceNo: tombstone("INVOICE", existing.id, invoiceNo), pdfUrl: null },
  });
  return true;
}

export function deletedContractNumber(contractNo: string, id: string) {
  return tombstone("CONTRACT", id, contractNo);
}

export function deletedInvoiceNumber(invoiceNo: string, id: string) {
  return tombstone("INVOICE", id, invoiceNo);
}
