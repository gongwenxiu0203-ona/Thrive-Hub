import type { Prisma } from "@prisma/client";
import { normalizeFinanceUrls } from "@/lib/financeApproval";

/** Runs in the request creation transaction: any invalid ownership rolls everything back. */
export async function linkBillingRequestAttachments(tx: Prisma.TransactionClient, userId: string, requestId: string, input?: string[]) {
  if (input?.some(url => typeof url !== "string" || (url.trim() && !/^\/uploads\/[^/]+$/.test(url.trim()) && !/^https:\/\//i.test(url.trim())))) throw new Error("客户确认金额截图请使用本地上传文件或 HTTPS 链接。");
  const urls = normalizeFinanceUrls(input);
  const localUrls = urls.filter(url => url.startsWith("/uploads/"));
  const staged = localUrls.length ? await tx.financeAttachment.findMany({ where: { fileUrl: { in: localUrls }, entityType: "BILLING_STAGED", entityId: userId, uploadedById: userId } }) : [];
  if (new Set(staged.map(file => file.fileUrl)).size !== localUrls.length) throw new Error("部分客户确认金额截图不属于本次上传，请重新上传后提交。");
  if (staged.length) {
    const linked = await tx.financeAttachment.updateMany({ where: { id: { in: staged.map(file => file.id) }, entityType: "BILLING_STAGED", entityId: userId, uploadedById: userId }, data: { entityType: "BILLING_REQUEST", entityId: requestId, attachmentType: "CUSTOMER_AMOUNT_CONFIRMATION" } });
    if (linked.count !== staged.length) throw new Error("客户确认金额截图已关联其他申请，请重新上传。");
  }
  const externalUrls = urls.filter(url => !url.startsWith("/uploads/"));
  if (externalUrls.length) await tx.financeAttachment.createMany({ data: externalUrls.map(fileUrl => ({ entityType: "BILLING_REQUEST", entityId: requestId, attachmentType: "CUSTOMER_AMOUNT_CONFIRMATION", fileUrl, uploadedById: userId })) });
}
