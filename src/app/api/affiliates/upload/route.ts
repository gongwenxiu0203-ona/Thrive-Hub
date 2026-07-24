import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { UPLOADABLE_AFFILIATE_FIELDS, mightBeDuplicate, normalizeRegion } from "@/lib/affiliateFields";

// Allow up to 5 minutes for large xlsx parsing + DB writes
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(auth.userId, "affiliates"), "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mappingRaw = formData.get("mapping") as string | null; // JSON: {colIndex: systemKey}

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as string[][];

  if (rows.length < 2) {
    return NextResponse.json({ error: "文件无数据行" }, { status: 400 });
  }

  // Parse column mapping: colIndex -> systemKey
  let mapping: Record<number, string> = {};
  if (mappingRaw) {
    mapping = JSON.parse(mappingRaw);
  } else {
    // Auto-detect: match header row against field labels (case-insensitive)
    const headerRow = rows[0];
    for (let ci = 0; ci < headerRow.length; ci++) {
      const h = String(headerRow[ci]).trim().toLowerCase();
      for (const f of UPLOADABLE_AFFILIATE_FIELDS) {
        if (f.label.toLowerCase() === h || f.key.toLowerCase() === h) {
          mapping[ci] = f.key;
          break;
        }
      }
    }
  }

  // Create a batch record
  const batch = await prisma.affiliateBatch.create({
    data: { fileName: file.name, uploaderId: auth.userId, recordCount: 0 },
  });

  // Load existing affiliate names for dedup check
  const existing = await prisma.affiliate.findMany({ where: { deletedAt: null } });

  const dataRows = rows.slice(1); // skip header
  const results: {
    row: number;
    status: "created" | "merged" | "duplicate_warning";
    name: string;
    duplicateOf?: string;
    mergedFields?: string[];
  }[] = [];

  const serialise = (v: unknown) =>
    typeof v === "string" ? v : JSON.stringify(v ?? []);

  const normalizeName = (value: string) => value.trim().toLowerCase();
  const isBlank = (value: unknown) => value == null || String(value).trim() === "";
  const mergeJsonArray = (current: string | null | undefined, incoming: string) => {
    let base: unknown[] = [];
    let add: unknown[] = [];
    try {
      const parsed = JSON.parse(current ?? "[]");
      if (Array.isArray(parsed)) base = parsed;
    } catch { /* ignore */ }
    try {
      const parsed = JSON.parse(incoming || "[]");
      if (Array.isArray(parsed)) add = parsed;
    } catch { /* ignore */ }
    const seen = new Set(base.map((item) => JSON.stringify(item)));
    for (const item of add) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        base.push(item);
      }
    }
    return JSON.stringify(base);
  };

  for (let ri = 0; ri < dataRows.length; ri++) {
    const row = dataRows[ri];
    // Build field map from column mapping
    const fields: Record<string, string> = {};
    for (const [ci, key] of Object.entries(mapping)) {
      fields[key] = String(row[Number(ci)] ?? "").trim();
    }

    const name = fields["platformAffiliateName"];
    if (!name) continue;

    const parseNum = (k: string) => {
      const v = parseFloat(fields[k] ?? "");
      return isNaN(v) ? null : v;
    };

    // Parse multi-select: stored as comma-separated in xlsx
    const parseMulti = (k: string) => {
      const v = fields[k] ?? "";
      if (!v) return "[]";
      return JSON.stringify(v.split(/[,，]/).map((s) => s.trim()).filter(Boolean));
    };

    // Combine virtual {platform}Placement + {platform}Flatfee columns into
    // a single-entry JSON for the *Placements field. Returns "[]" if no placement.
    const buildPlacements = (placementKey: string, flatfeeKey: string) => {
      const p = (fields[placementKey] ?? "").trim();
      if (!p) return "[]";
      const fee = parseFloat(fields[flatfeeKey] ?? "");
      return JSON.stringify([{ placement: p, flatfee: isNaN(fee) ? null : fee }]);
    };

    const createData = {
      batchId: batch.id,
      region: fields["region"] ? normalizeRegion(fields["region"]) : null,
      platformAffiliateName: name,
      internalAffiliateName: fields["internalAffiliateName"] || null,
      source: fields["source"] || null,
      category: fields["category"] || null,
      affiliateType: fields["affiliateType"] || "待定",
      tags: parseMulti("tags"),
      websiteLink: fields["websiteLink"] || null,
      websiteTraffic: parseNum("websiteTraffic"),
      websitePlacements: buildPlacements("websitePlacement", "websiteFlatfee"),
      websiteNote: fields["websiteNote"] || null,
      instagramLink: fields["instagramLink"] || null,
      insFollowers: parseNum("insFollowers"),
      instagramPlacements: buildPlacements("instagramPlacement", "instagramFlatfee"),
      insNote: fields["insNote"] || null,
      facebookLink: fields["facebookLink"] || null,
      fbFollowers: parseNum("fbFollowers"),
      facebookPlacements: buildPlacements("facebookPlacement", "facebookFlatfee"),
      fbNote: fields["fbNote"] || null,
      youtubeLink: fields["youtubeLink"] || null,
      youtubeFollowers: parseNum("youtubeFollowers"),
      youtubePlacements: buildPlacements("youtubePlacement", "youtubeFlatfee"),
      tiktokLink: fields["tiktokLink"] || null,
      tiktokFollowers: parseNum("tiktokFollowers"),
      tiktokPlacements: buildPlacements("tiktokPlacement", "tiktokFlatfee"),
      amazonStorefrontLink: fields["amazonStorefrontLink"] || null,
      topCreator: fields["topCreator"] || null,
      storefrontFlatfee: parseNum("storefrontFlatfee"),
      storefrontNote: fields["storefrontNote"] || null,
      ltkLink: fields["ltkLink"] || null,
      ltkFlatfee: parseNum("ltkFlatfee"),
      pinterestLink: fields["pinterestLink"] || null,
      pinterestFlatfee: parseNum("pinterestFlatfee"),
      flatfeeSupplementary: fields["flatfeeSupplementary"] || null,
      note: fields["note"] || null,
      contactInfo: fields["contactInfo"] || null,
      brand: fields["brand"] || null,
      developmentStatus: fields["developmentStatus"] || null,
      developmentDesc: fields["developmentDesc"] || null,
      contactEmail: fields["contactEmail"] || null,
      personInChargeName: fields["personInChargeName"] || null,
      cooperationMode: parseMulti("cooperationMode"),
      sampleShipping: fields["sampleShipping"] || null,
    };

    const exactMatch = existing.find((e) => normalizeName(e.platformAffiliateName) === normalizeName(name));
    const dupMatch = existing.find((e) => mightBeDuplicate(e.platformAffiliateName, name));

    if (exactMatch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {};
      const mergedFields: string[] = [];
      for (const [key, value] of Object.entries(createData)) {
        if (key === "batchId" || key === "platformAffiliateName") continue;
        if (["tags", "cooperationMode", "websitePlacements", "instagramPlacements", "facebookPlacements", "youtubePlacements", "tiktokPlacements"].includes(key)) {
          const merged = mergeJsonArray((exactMatch as any)[key], String(value ?? "[]"));
          if (merged !== ((exactMatch as any)[key] ?? "[]")) {
            updateData[key] = merged;
            mergedFields.push(key);
          }
          continue;
        }
        if (key === "affiliateType") {
          if ((isBlank((exactMatch as any)[key]) || (exactMatch as any)[key] === "待定") && !isBlank(value)) {
            updateData[key] = value;
            mergedFields.push(key);
          }
          continue;
        }
        if (isBlank((exactMatch as any)[key]) && !isBlank(value)) {
          updateData[key] = value;
          mergedFields.push(key);
        }
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.affiliate.update({ where: { id: exactMatch.id }, data: updateData });
        Object.assign(exactMatch, updateData);
      }
      results.push({ row: ri + 2, status: "merged", name, duplicateOf: exactMatch.platformAffiliateName, mergedFields });
      continue;
    }

    await prisma.affiliate.create({ data: createData });

    const isDupWarning = !!dupMatch;
    results.push({
      row: ri + 2,
      status: isDupWarning ? "duplicate_warning" : "created",
      name,
      duplicateOf: dupMatch?.platformAffiliateName,
    });

    // Update local cache for subsequent dedup checks
    existing.push({ ...createData, id: "new", deletedAt: null, createdAt: new Date(), updatedAt: new Date(), customerCooperations: "[]", brandEntries: "[]", promoContents: "[]", promotionPlacements: "[]", mediaKitItems: "[]" } as any);
  }

  const created = results.filter((r) => r.status === "created").length;
  const merged = results.filter((r) => r.status === "merged").length;
  const warnings = results.filter((r) => r.status === "duplicate_warning").length;

  // Update batch record count
  await prisma.affiliateBatch.update({
    where: { id: batch.id },
    data: { recordCount: created + warnings + merged },
  });

  return NextResponse.json({ created, merged, warnings, results });
}
