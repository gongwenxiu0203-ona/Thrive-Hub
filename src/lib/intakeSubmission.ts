import { MAIN_SITES, PROMO_PLATFORMS, PROMOTION_GOALS } from "@/lib/constants";
import { capitalizeBrandName } from "@/lib/customer";

export const INTAKE_FIELDS = ["brandName", "referrerName", "mainSites", "siteLinks", "competitor", "targetPlatforms", "platformGmv", "amazonAcos", "amazonAcosNote", "socialMediaInfo", "affiliateHistory", "affiliatePlatforms", "promotionGoals", "targetGmv", "channelBudget", "affiliateTeam", "contactName", "contactEmail", "contactPhone"] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];

export function normalizeIntakePayload(body: Record<string, unknown>) {
  const text = (key: string) => String(body[key] ?? "").trim().slice(0, 5000);
  const array = (key: string, allowed: readonly string[]) =>
    (Array.isArray(body[key]) ? body[key] as unknown[] : []).map(String).filter((v) => allowed.includes(v));
  const object = (key: string) => body[key] && typeof body[key] === "object" && !Array.isArray(body[key]) ? body[key] : {};
  return {
    brandName: capitalizeBrandName(text("brandName")), referrerName: text("referrerName"),
    mainSites: JSON.stringify(array("mainSites", MAIN_SITES)), siteLinks: JSON.stringify(object("siteLinks")), competitor: text("competitor") || null,
    targetPlatforms: JSON.stringify(array("targetPlatforms", PROMO_PLATFORMS)), platformGmv: JSON.stringify(object("platformGmv")),
    amazonAcos: text("amazonAcos") || null, amazonAcosNote: text("amazonAcosNote") || null, socialMediaInfo: text("socialMediaInfo") || null,
    affiliateHistory: text("affiliateHistory") || null, affiliatePlatforms: text("affiliatePlatforms") || null,
    promotionGoals: JSON.stringify(array("promotionGoals", PROMOTION_GOALS)), targetGmv: text("targetGmv") || null,
    channelBudget: text("channelBudget") || null, affiliateTeam: text("affiliateTeam") || null,
    contactName: text("contactName") || null, contactEmail: text("contactEmail") || null, contactPhone: text("contactPhone") || null,
  };
}

export function pickAppliedFields(payload: Record<string, unknown>, fields?: unknown) {
  const selected = Array.isArray(fields) ? fields.filter((f): f is IntakeField => typeof f === "string" && INTAKE_FIELDS.includes(f as IntakeField)) : [...INTAKE_FIELDS];
  return Object.fromEntries(selected.filter((key) => key in payload).map((key) => [key, payload[key]]));
}
