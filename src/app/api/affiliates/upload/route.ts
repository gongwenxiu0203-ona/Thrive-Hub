import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { UPLOADABLE_AFFILIATE_FIELDS, mightBeDuplicate } from "@/lib/affiliateFields";

export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const existing = await prisma.affiliate.findMany({
    select: { id: true, platformAffiliateName: true },
  });

  const dataRows = rows.slice(1); // skip header
  const results: {
    row: number;
    status: "created" | "skipped" | "duplicate_warning";
    name: string;
    duplicateOf?: string;
  }[] = [];

  const serialise = (v: unknown) =>
    typeof v === "string" ? v : JSON.stringify(v ?? []);

  for (let ri = 0; ri < dataRows.length; ri++) {
    const row = dataRows[ri];
    // Build field map from column mapping
    const fields: Record<string, string> = {};
    for (const [ci, key] of Object.entries(mapping)) {
      fields[key] = String(row[Number(ci)] ?? "").trim();
    }

    const name = fields["platformAffiliateName"];
    if (!name) continue;

    // Check duplicates
    const dupMatch = existing.find((e) =>
      mightBeDuplicate(e.platformAffiliateName, name),
    );

    if (dupMatch && dupMatch.platformAffiliateName.toLowerCase() === name.toLowerCase()) {
      results.push({ row: ri + 2, status: "skipped", name, duplicateOf: dupMatch.platformAffiliateName });
      continue;
    }

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

    await prisma.affiliate.create({
      data: {
        batchId: batch.id,
        platformAffiliateName: name,
        internalAffiliateName: fields["internalAffiliateName"] || null,
        source: fields["source"] || null,
        category: fields["category"] || null,
        affiliateType: fields["affiliateType"] || null,
        tags: parseMulti("tags"),
        websiteLink: fields["websiteLink"] || null,
        websiteTraffic: parseNum("websiteTraffic"),
        websiteNote: fields["websiteNote"] || null,
        instagramLink: fields["instagramLink"] || null,
        insFollowers: parseNum("insFollowers"),
        insNote: fields["insNote"] || null,
        facebookLink: fields["facebookLink"] || null,
        fbFollowers: parseNum("fbFollowers"),
        fbNote: fields["fbNote"] || null,
        youtubeLink: fields["youtubeLink"] || null,
        youtubeFollowers: parseNum("youtubeFollowers"),
        tiktokLink: fields["tiktokLink"] || null,
        tiktokFollowers: parseNum("tiktokFollowers"),
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
        cooperationMode: parseMulti("cooperationMode"),
        sampleShipping: fields["sampleShipping"] || null,
      },
    });

    const isDupWarning = !!dupMatch;
    results.push({
      row: ri + 2,
      status: isDupWarning ? "duplicate_warning" : "created",
      name,
      duplicateOf: dupMatch?.platformAffiliateName,
    });

    // Update local cache for subsequent dedup checks
    existing.push({ id: "new", platformAffiliateName: name });
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const warnings = results.filter((r) => r.status === "duplicate_warning").length;

  // Update batch record count
  await prisma.affiliateBatch.update({
    where: { id: batch.id },
    data: { recordCount: created + warnings },
  });

  return NextResponse.json({ created, skipped, warnings, results });
}
