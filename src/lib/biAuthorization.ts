import { createHash, randomBytes } from "node:crypto";
import type { PermLevel } from "@/lib/featurePermissions";
import { resolveUserPermission } from "@/lib/permissionResolver";

const LEVEL: Record<PermLevel, number> = { NONE: 0, READ: 1, EDIT: 2, MANAGE: 3 };

export type BiPermissionFeature =
  | "bi.view"
  | "bi.import"
  | "bi.export"
  | "bi.manage";

export async function hasBiPermission(
  userId: string,
  feature: BiPermissionFeature,
  minimum: Exclude<PermLevel, "NONE">,
): Promise<boolean> {
  return LEVEL[await resolveUserPermission(userId, feature)] >= LEVEL[minimum];
}

type ClearConfirmation = {
  actorId: string;
  fingerprint: string;
  count: number;
  expiresAt: number;
};

const CLEAR_TOKEN_TTL_MS = 5 * 60 * 1000;
const clearConfirmations = new Map<string, ClearConfirmation>();

export function clearFilterFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function issueClearConfirmation(actorId: string, fingerprint: string, count: number) {
  const now = Date.now();
  for (const [token, item] of clearConfirmations) {
    if (item.expiresAt <= now) clearConfirmations.delete(token);
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + CLEAR_TOKEN_TTL_MS;
  clearConfirmations.set(token, { actorId, fingerprint, count, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export function consumeClearConfirmation(
  token: string,
  actorId: string,
  fingerprint: string,
  count: number,
): boolean {
  const item = clearConfirmations.get(token);
  if (!item) return false;
  clearConfirmations.delete(token);
  return item.expiresAt > Date.now() && item.actorId === actorId && item.fingerprint === fingerprint && item.count === count;
}
