import type { SessionPayload } from "@/lib/auth";
import type { PermLevel } from "@/lib/featurePermissions";
import { prisma } from "@/lib/prisma";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import {
  contractScope,
  customerScope,
  taskScope,
  type ViewScope,
} from "@/lib/dataScope";

export const ATTACHMENT_ENTITY_TYPES = [
  "CUSTOMER",
  "CUSTOMER_DEMO",
  "TASK",
  "CONTRACT",
  "AFFILIATE",
] as const;

export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];
const ENTITY_TYPE_SET = new Set<string>(ATTACHMENT_ENTITY_TYPES);

export class AttachmentEntityNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Attachment entity not found or outside accessible scope");
    this.name = "AttachmentEntityNotFoundError";
  }
}

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return ENTITY_TYPE_SET.has(value);
}

function entityViewScope(session: Pick<SessionPayload, "role">): ViewScope {
  return session.role === "ADMIN" ? "all" : "mine";
}

export async function requireAttachmentEntityAccess(
  session: SessionPayload,
  entityType: AttachmentEntityType,
  entityId: string,
  required: PermLevel,
): Promise<void> {
  const view = entityViewScope(session);
  let exists = false;

  switch (entityType) {
    case "CUSTOMER":
    case "CUSTOMER_DEMO": {
      await requireFeaturePermission(session, "customers", required);
      const customer = await prisma.customer.findFirst({
        where: {
          id: entityId,
          ...customerScope(session, view),
          deletedAt: null,
        },
        select: { id: true },
      });
      exists = Boolean(customer);
      break;
    }
    case "TASK": {
      await requireFeaturePermission(session, "tasks", required);
      const task = await prisma.task.findFirst({
        where: {
          id: entityId,
          ...taskScope(session, view),
          deletedAt: null,
        },
        select: { id: true },
      });
      exists = Boolean(task);
      break;
    }
    case "CONTRACT": {
      await requireFeaturePermission(session, "contracts", required);
      const contract = await prisma.contract.findFirst({
        where: {
          id: entityId,
          ...contractScope(session, view),
          deletedAt: null,
        },
        select: { id: true },
      });
      exists = Boolean(contract);
      break;
    }
    case "AFFILIATE": {
      await requireFeaturePermission(session, "affiliates", required);
      const affiliate = await prisma.affiliate.findFirst({
        where: { id: entityId, deletedAt: null },
        select: { id: true },
      });
      exists = Boolean(affiliate);
      break;
    }
  }

  if (!exists) throw new AttachmentEntityNotFoundError();
}
