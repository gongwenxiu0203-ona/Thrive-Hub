import { prisma } from "./prisma";
import { canonicalPlatform, canonicalRegion } from "./reconciliationBiDetails";
import { readReconciliationConfirmation } from "./reconciliationConfirmation";

type CommissionRecord = {
  id: string;
  customerId: string;
  periodStart: Date;
  periodEnd: Date;
  projectConfirmationId: string | null;
  ruleSnapshot: string | null;
  customer: { brandName: string };
  contract: { targetSite: string | null; promoPlatform: string | null };
  legacyBillingUnit?: { scopeSnapshot: string } | null;
};

type Scope = { brand: string; region: string; platforms: string[] };

function key(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9\p{L}\p{N}]+/gu, "");
}

function split(value: string | null) {
  return String(value ?? "").split(/[、,，;/]/).map((part) => part.trim()).filter(Boolean);
}

function scopes(record: CommissionRecord): Scope[] {
  const confirmation = readReconciliationConfirmation(record);
  if (record.projectConfirmationId) {
    if (!confirmation) return [];
    return confirmation.scopes.map((scope) => ({
      brand: confirmation.brand,
      region: canonicalRegion(scope.country),
      platforms: [...scope.programs, ...scope.thirdPartyPlatforms].map(canonicalPlatform).map(key).filter(Boolean),
    }));
  }
  let source = record.contract;
  if (record.legacyBillingUnit) {
    try {
      const snapshot = JSON.parse(record.legacyBillingUnit.scopeSnapshot) as { targetSite?: string | null; promoPlatform?: string | null };
      source = { targetSite: snapshot.targetSite ?? null, promoPlatform: snapshot.promoPlatform ?? null };
    } catch { source = { targetSite: null, promoPlatform: null }; }
  }
  const platforms = split(source.promoPlatform).map(canonicalPlatform).map(key).filter(Boolean);
  return split(source.targetSite).map((site) => ({
    brand: record.customer.brandName,
    region: canonicalRegion(site),
    platforms,
  }));
}

/** Unknown coverage is ambiguous, not proof that two streams are disjoint. */
export function hasAmbiguousCommissionScopeOverlap(a: CommissionRecord, b: CommissionRecord) {
  const first = scopes(a);
  const second = scopes(b);
  if (!first.length || !second.length) return true;
  return first.some((left) => second.some((right) => {
    if (!left.brand || !right.brand || !left.region || !right.region) return true;
    if (key(left.brand) !== key(right.brand) || left.region !== right.region) return false;
    // A missing platform filter represents every platform, not no platforms.
    return !left.platforms.length || !right.platforms.length
      || left.platforms.some((platform) => right.platforms.includes(platform));
  }));
}

export async function findAmbiguousCommissionOverlap(record: CommissionRecord) {
  const others = await prisma.customerReconciliation.findMany({
    where: {
      id: { not: record.id }, customerId: record.customerId, deletedAt: null,
      reconcileType: { in: ["COMMISSION_ONLY", "BOTH"] },
      planStatus: { not: "CANCELLED" },
      periodStart: { lte: record.periodEnd }, periodEnd: { gte: record.periodStart },
    },
    select: {
      id: true, customerId: true, periodStart: true, periodEnd: true,
      projectConfirmationId: true, ruleSnapshot: true,
      customer: { select: { brandName: true } },
      contract: { select: { targetSite: true, promoPlatform: true } },
      legacyBillingUnit: { select: { scopeSnapshot: true } },
    },
  });
  return others.find((other) => hasAmbiguousCommissionScopeOverlap(record, other)) ?? null;
}
