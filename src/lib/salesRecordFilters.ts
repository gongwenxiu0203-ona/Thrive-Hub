import type { Prisma } from "@prisma/client";
import { parseDateOnlyEnd, parseDateOnlyStart } from "@/lib/dateRange";

export const EMPTY_FILTER_VALUE = "__EMPTY__";

export const SALES_RECORD_FILTER_KEYS = [
  "platforms",
  "programs",
  "brands",
  "regions",
  "stores",
  "affiliateNames",
  "types",
  "asins",
  "parentAsins",
  "labels",
  "from",
  "to",
  "rateMin",
  "rateMax",
] as const;

export type SalesRecordFilterParams = Record<string, string | undefined>;

export function csvFilterValues(sp: SalesRecordFilterParams, key: string): string[] {
  return (sp[key] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasEmptyFilter(values: string[]): boolean {
  return values.includes(EMPTY_FILTER_VALUE);
}

function appendStringFilter(
  clauses: Prisma.SalesRecordWhereInput[],
  field: keyof Prisma.SalesRecordWhereInput,
  values: string[],
  nullable = true,
) {
  const nonEmpty = values.filter((v) => v !== EMPTY_FILTER_VALUE);
  const wantsEmpty = hasEmptyFilter(values);
  if (!nonEmpty.length && !wantsEmpty) return;

  const or: Prisma.SalesRecordWhereInput[] = [];
  if (nonEmpty.length) or.push({ [field]: { in: nonEmpty } } as Prisma.SalesRecordWhereInput);
  if (wantsEmpty) {
    if (nullable) or.push({ [field]: null } as Prisma.SalesRecordWhereInput);
    or.push({ [field]: "" } as Prisma.SalesRecordWhereInput);
  }
  clauses.push(or.length === 1 ? or[0] : { OR: or });
}

export function buildSalesRecordWhereFromParams(
  sp: SalesRecordFilterParams,
  typeAffNames?: string[],
): Prisma.SalesRecordWhereInput {
  const clauses: Prisma.SalesRecordWhereInput[] = [];

  appendStringFilter(clauses, "affiliatePlatform", csvFilterValues(sp, "platforms"), false);
  appendStringFilter(clauses, "affiliateProgram", csvFilterValues(sp, "programs"));
  appendStringFilter(clauses, "brand", csvFilterValues(sp, "brands"), false);
  appendStringFilter(clauses, "region", csvFilterValues(sp, "regions"));
  appendStringFilter(clauses, "store", csvFilterValues(sp, "stores"));
  appendStringFilter(clauses, "affiliateName", csvFilterValues(sp, "affiliateNames"), false);

  const types = csvFilterValues(sp, "types");
  if (types.length) {
    const nonEmptyTypes = types.filter((v) => v !== EMPTY_FILTER_VALUE);
    const wantsEmptyType = hasEmptyFilter(types);
    const or: Prisma.SalesRecordWhereInput[] = [];
    if (typeAffNames !== undefined && typeAffNames.length > 0) {
      or.push({ affiliateName: { in: typeAffNames } });
    }
    if (nonEmptyTypes.length) or.push({ affiliateType: { in: nonEmptyTypes } });
    if (wantsEmptyType) {
      or.push({ affiliateType: null });
      or.push({ affiliateType: "" });
    }
    if (or.length) clauses.push(or.length === 1 ? or[0] : { OR: or });
  }

  appendStringFilter(clauses, "asin", csvFilterValues(sp, "asins"));
  appendStringFilter(clauses, "parentAsin", csvFilterValues(sp, "parentAsins"));
  appendStringFilter(clauses, "storeProductLabel", csvFilterValues(sp, "labels"));

  if (sp.from || sp.to) {
    const orderDate: Prisma.DateTimeFilter = {};
    if (sp.from) {
      const start = parseDateOnlyStart(sp.from);
      if (start) orderDate.gte = start;
    }
    if (sp.to) {
      const end = parseDateOnlyEnd(sp.to);
      if (end) orderDate.lte = end;
    }
    if (Object.keys(orderDate).length) clauses.push({ orderDate });
  }

  if (sp.rateMin || sp.rateMax) {
    const commissionRate: Prisma.FloatFilter = {};
    if (sp.rateMin) commissionRate.gte = Number(sp.rateMin) / 100;
    if (sp.rateMax) commissionRate.lte = Number(sp.rateMax) / 100;
    clauses.push({ commissionRate });
  }

  return clauses.length ? { AND: clauses } : {};
}

export function exportSalesFilterQueryString(sp: SalesRecordFilterParams): string {
  const params = new URLSearchParams();
  for (const k of SALES_RECORD_FILTER_KEYS) {
    if (sp[k]) params.set(k, sp[k]!);
  }
  return params.toString();
}
