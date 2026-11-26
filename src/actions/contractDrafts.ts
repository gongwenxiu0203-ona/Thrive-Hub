"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { creationReferenceCustomerScope, isStaff } from "@/lib/dataScope";

export async function createReservedContractDraft(payload: { type: string; customerId: string; ownerId?: string }) {
  const session = await requireSession();
  await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
  if (!isStaff(session.role) || !["BRAND", "CHANNEL", "TRANSACTIONAL"].includes(payload.type)) return { ok: false, error: "合同类型或账号无效" };
  const customer = await prisma.customer.findFirst({ where: { id: payload.customerId, deletedAt: null, ...creationReferenceCustomerScope(session) }, select: { id: true, businessOwnerId: true, backendOwnerId: true } });
  if (!customer) return { ok: false, error: "请选择有效关联客户" };
  const candidates = payload.ownerId ? [payload.ownerId] : [customer.businessOwnerId, customer.backendOwnerId, session.userId].filter((id): id is string => Boolean(id));
  const owners = await prisma.user.findMany({ where: { id: { in: candidates }, status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } });
  const owner = candidates.map(id => owners.find(user => user.id === id)).find(Boolean);
  if (!owner) return { ok: false, error: "请选择有效内部负责人" };
  const ownerId = owner.id;
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date());
  const prefix = `${payload.type === "BRAND" ? "THRAIVE" : payload.type === "CHANNEL" ? "CHANNEL" : "COMPANY"}-${year}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const contract = await prisma.$transaction(async tx => {
        const rows = await tx.contract.findMany({ where: { contractNo: { startsWith: prefix } }, select: { contractNo: true } });
        const max = rows.reduce((n, row) => Math.max(n, parseInt(row.contractNo.slice(prefix.length), 10) || 0), 0);
        const created = await tx.contract.create({ data: { contractNo: `${prefix}${String(max + 1).padStart(3, "0")}`, type: payload.type, customerId: customer.id, ownerId, createdById: session.userId, status: "DRAFT", uploadType: "RESERVED" } });
        await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: created.id, action: "RESERVE_CONTRACT_NUMBER", toStatus: "DRAFT", actorId: session.userId, note: "创建预留编号草稿，尚未选择合同制作方式", metadata: JSON.stringify({ type: payload.type, customerId: customer.id, ownerId, contractNo: created.contractNo }) } });
        return created;
      });
      revalidatePath("/contracts");
      return { ok: true, id: contract.id, contractId: contract.id, contractNo: contract.contractNo };
    } catch (error) {
      if (["P2002", "P2034"].includes((error as { code?: string }).code ?? "")) continue;
      throw error;
    }
  }
  return { ok: false, error: "编号分配繁忙，请重试" };
}
