import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { convertRow, getMappableFields, FIELD_HINTS } from "@/lib/salesImport";
import { parseSheet } from "@/lib/excel";
import { readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { hasBiPermission } from "@/lib/biAuthorization";
import { customerScope } from "@/lib/dataScope";

// Allow up to 5 minutes for large xlsx parsing + DB writes
export const maxDuration = 300;

// Step 2 of the BI import flow.
//
// Body: { tempId, mapping, platform, customerId?, fileName? }
// Reads parsed rows from the server-side temp file created in step 1 (parse),
// converts them, then writes to DB inside a single transaction.
// Temp file is deleted after processing (success or validation failure).

type Row = Record<string, unknown>;

const TEMP_PREFIX = "sales-parse-";
// Temp files are now raw binary (file buffer), not parsed JSON.
// The .bin extension matches what parse/route.ts writes.
const TEMP_EXT = ".bin";
/** Max records per createMany call — avoids DB variable-count limits. */
const CHUNK_SIZE = 500;

/** Validate UUID format to prevent path traversal. */
function isSafeUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

function tempFilePath(tempId: string): string {
  return path.join(os.tmpdir(), `${TEMP_PREFIX}${tempId}${TEMP_EXT}`);
}

async function readTempRows(tempId: string): Promise<Row[] | null> {
  if (!isSafeUUID(tempId)) return null;
  try {
    // Read the raw binary buffer saved by Step 1 (parse) and do the full
    // xlsx parse here. This is where the CPU-intensive work now happens,
    // keeping Step 1 near-instant for large files.
    const buf = await readFile(tempFilePath(tempId));
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    return parseSheet(arrayBuffer) as Row[];
  } catch {
    return null;
  }
}

function deleteTempFile(tempId: string): void {
  if (!isSafeUUID(tempId)) return;
  unlink(tempFilePath(tempId)).catch(() => {});
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

    if (!(await hasBiPermission(session.userId, "bi.import", "EDIT"))) {
      return NextResponse.json({ error: "无权导入 BI 数据" }, { status: 403 });
    }

    let body: {
      tempId?: string;
      mapping?: Record<string, string>;
      platform?: string;
      customerId?: string | null;
      fileName?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
    }

    const tempId = body.tempId ?? "";
    const mapping = body.mapping ?? {};
    const platform = (body.platform ?? "").trim();
    const customerId = body.customerId || null;
    const fileName = body.fileName;

    if (!tempId) {
      return NextResponse.json({ error: "缺少上传会话标识" }, { status: 400 });
    }
    if (!customerId) {
      return NextResponse.json({ error: "请选择关联客户后再导入" }, { status: 400 });
    }

    // Read parsed rows from temp file (written by parse step).
    const rows = await readTempRows(tempId);
    if (!rows) {
      return NextResponse.json(
        {
          error:
            "上传会话已过期或无效，请重新选择文件并映射字段后再次导入",
        },
        { status: 400 },
      );
    }

    if (rows.length === 0) {
      deleteTempFile(tempId);
      return NextResponse.json({ error: "没有可导入的数据行" }, { status: 400 });
    }

    // Required user-mapped fields (skip fields with auto-fallback, e.g. brand / affiliatePlatform / commissionRate).
    const required = getMappableFields().filter((f) => f.required);
    const missing = required.filter((f) => !mapping[f.key] && !FIELD_HINTS[f.key]);
    if (missing.length > 0) {
      deleteTempFile(tempId);
      return NextResponse.json(
        {
          error: `以下必填字段尚未映射：${missing
            .map((f) => `「${f.label}」`)
            .join("、")}`,
        },
        { status: 400 },
      );
    }

    // Load look-up tables once.
    const accessibleCustomerWhere = customerScope(
      session,
      session.role === "ADMIN" || session.role === "USER" ? "all" : "mine",
    );
    const [customer, affiliates, asinMappings] = await Promise.all([
      customerId
        ? prisma.customer.findFirst({
            where: { AND: [{ id: customerId, deletedAt: null }, accessibleCustomerWhere] },
          })
        : Promise.resolve(null),
      prisma.affiliate.findMany({
        where: { deletedAt: null },
        select: {
          platformAffiliateName: true,
          internalAffiliateName: true,
          affiliateType: true,
        },
      }),
      prisma.asinMapping.findMany({
        select: {
          brand: true,
          store: true,
          region: true,
          asin: true,
          parentAsin: true,
          storeProductLabel: true,
        },
      }),
    ]);

    if (!customer) {
      deleteTempFile(tempId);
      return NextResponse.json(
        { error: "客户不存在或无权对该客户导入" },
        { status: 404 },
      );
    }

    const affMap = new Map<
      string,
      { type: string; internalName: string | null }
    >();
    for (const a of affiliates) {
      affMap.set(a.platformAffiliateName.toLowerCase().trim(), {
        type: a.affiliateType ?? "",
        internalName: a.internalAffiliateName,
      });
    }
    const asinMap = new Map<
      string,
      { parentAsin: string | null; storeProductLabel: string | null }
    >();
    for (const m of asinMappings) {
      const key = [m.brand, m.store, m.region, m.asin]
        .map((x) => (x ?? "").toString().trim().toLowerCase())
        .join("||");
      asinMap.set(key, {
        parentAsin: m.parentAsin,
        storeProductLabel: m.storeProductLabel,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: any[] = [];
    const skipped: number[] = [];

    const customerBrandName = customer?.brandName ?? null;
    for (let i = 0; i < rows.length; i++) {
      const result = convertRow(rows[i], mapping, platform, customerId, customerBrandName);
      if (!result) {
        skipped.push(i + 2);
        continue;
      }
      const r = result.record;

      // Brand fallback to customer.
      if (!r.brand && customer) r.brand = customer.brandName ?? "";

      // Affiliate type / internal name lookup.
      const affKey = (r.affiliateName ?? "").toLowerCase().trim();
      if (affKey) {
        const a = affMap.get(affKey);
        if (a) {
          r.affiliateType = a.type;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r as any).internalAffiliateName = a.internalName;
        }
      }

      // Parent Asin / Store-Product Label lookup.
      const asinKey = [r.brand, r.store, r.region, r.asin]
        .map((x) => (x ?? "").toString().trim().toLowerCase())
        .join("||");
      const am = asinMap.get(asinKey);
      if (am) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r as any).parentAsin = am.parentAsin;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r as any).storeProductLabel = am.storeProductLabel;
      }

      records.push(r);
    }

    if (records.length === 0) {
      deleteTempFile(tempId);
      return NextResponse.json(
        {
          error:
            "未能识别任何有效数据行。请确认「订单日期 / 联盟商名称 / 销售金额」列已正确映射且数据非空。",
          skipped,
        },
        { status: 400 },
      );
    }

    // Write batch + records in a single transaction for data consistency.
    // Chunk createMany to stay within DB variable-count limits (SQLite ≤ 32766).
    const batchId = await prisma.$transaction(
      async (tx) => {
        const batch = await tx.salesBatch.create({
          data: {
            fileName: fileName || `${platform || "未知平台"}-导入数据.xlsx`,
            affiliatePlatform: platform || null,
            customerId,
            uploaderId: session.userId,
            recordCount: 0,
          },
        });

        const withBatch = records.map((r) => ({ ...r, batchId: batch.id }));
        for (let i = 0; i < withBatch.length; i += CHUNK_SIZE) {
          await tx.salesRecord.createMany({
            data: withBatch.slice(i, i + CHUNK_SIZE),
          });
        }

        await tx.salesBatch.update({
          where: { id: batch.id },
          data: { recordCount: records.length },
        });

        await tx.adminAuditLog.create({
          data: {
            actorId: session.userId,
            action: "IMPORT",
            module: "BI",
            targetType: "SalesBatch",
            targetId: batch.id,
            targetLabel: fileName || platform || null,
            summary: `导入 BI 销售数据 ${records.length} 条`,
            metadataJson: JSON.stringify({
              customerId,
              platform,
              importedCount: records.length,
              skippedCount: skipped.length,
            }),
          },
        });

        return batch.id;
      },
      { timeout: 120_000 }, // 2 min — full xlsx parse now happens in upload step
    );

    // Clean up temp file after successful import.
    deleteTempFile(tempId);

    // Auto-add unknown affiliates to the library (status: 待开发)
    let newAffiliateCount = 0;
    try {
      const uniqueNames = [...new Set(records.map((r) => r.affiliateName as string).filter(Boolean))];
      if (uniqueNames.length > 0) {
        const existing = await prisma.affiliate.findMany({
          where: { platformAffiliateName: { in: uniqueNames }, deletedAt: null },
          select: { platformAffiliateName: true },
        });
        const existingSet = new Set(existing.map((a) => a.platformAffiliateName));
        const toCreate = uniqueNames.filter((n) => !existingSet.has(n));
        if (toCreate.length > 0) {
          for (const name of toCreate) {
            try {
              await prisma.affiliate.create({
                data: {
                  platformAffiliateName: name,
                  developmentStatus: "待开发 Not Yet Contacted",
                  affiliateType: "待定",
                  tags: "[]",
                },
              });
              newAffiliateCount++;
            } catch {
              // Another import may have created the affiliate after our lookup.
            }
          }
        }
      }
    } catch (e) {
      // Non-fatal: log but don't fail the import
      console.error("[sales/upload] auto-add affiliate error:", e);
    }

    return NextResponse.json({
      imported: records.length,
      skipped,
      errors: [],
      batchId,
      newAffiliateCount,
    });
  } catch (err) {
    console.error("[sales/upload] unhandled error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `服务器错误：${msg}` }, { status: 500 });
  }
}
