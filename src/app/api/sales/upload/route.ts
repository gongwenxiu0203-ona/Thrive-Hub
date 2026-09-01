import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/appError";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { convertRow, getMappableFields, FIELD_HINTS } from "@/lib/salesImport";
import { parseSheetChunksFromFile } from "@/lib/excelStream";
import { unlink, stat } from "fs/promises";
import path from "path";
import os from "os";
import { hasBiPermission } from "@/lib/biAuthorization";
import { customerScope } from "@/lib/dataScope";

// Allow up to 10 minutes for 500k+ row streaming imports + DB writes.
export const maxDuration = 600;

// Step 2 of the BI import flow.
//
// Body: { tempId, mapping, platform, customerId?, fileName? }
// Reads parsed rows from the server-side temp file created in step 1 (parse),
// converts them, then writes to DB inside a single transaction.
// Temp file is deleted after processing (success or validation failure).

const TEMP_PREFIX = "sales-parse-";
// Temp files are now raw binary (file buffer), not parsed JSON.
// The .bin extension matches what parse/route.ts writes.
const TEMP_EXT = ".bin";
const MAX_UPLOAD_BYTES = 105 * 1024 * 1024;
/** Max records per createMany call — avoids DB variable-count limits. */
const CHUNK_SIZE = 500;
const PARSE_CHUNK_SIZE = 1_000;

/** Validate UUID format to prevent path traversal. */
function isSafeUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

function tempFilePath(tempId: string): string {
  return path.join(os.tmpdir(), `${TEMP_PREFIX}${tempId}${TEMP_EXT}`);
}

async function validTempFilePath(tempId: string): Promise<string | null> {
  if (!isSafeUUID(tempId)) return null;
  try {
    const fileStat = await stat(tempFilePath(tempId));
    if (fileStat.size <= 0 || fileStat.size > MAX_UPLOAD_BYTES) return null;
    return tempFilePath(tempId);
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

    // Keep a single reference to the raw file buffer. parseSheetChunks avoids
    // the former ArrayBuffer copy and does not materialize a second full-file
    // Row[] allocation.
    const rawFilePath = await validTempFilePath(tempId);
    if (!rawFilePath) {
      return NextResponse.json(
        {
          error:
            "上传会话已过期或无效，请重新选择文件并映射字段后再次导入",
        },
        { status: 400 },
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

    const skipped: number[] = [];
    const customerBrandName = customer?.brandName ?? null;
    const importedAffiliateNames = new Map<string, string>();
    let importedCount = 0;
    let logicalRowIndex = 0;

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

        for await (const rawRows of parseSheetChunksFromFile(rawFilePath, fileName || "upload.xlsx", PARSE_CHUNK_SIZE)) {
          const pendingRecords = [];
          for (const rawRow of rawRows) {
            const sourceRowNumber = logicalRowIndex + 2;
            logicalRowIndex += 1;
            const result = convertRow(
              rawRow,
              mapping,
              platform,
              customerId,
              customerBrandName,
            );
            if (!result) {
              skipped.push(sourceRowNumber);
              continue;
            }
            const record = result.record;

            if (!record.brand) record.brand = customer.brandName ?? "";

            const affiliateName = (record.affiliateName ?? "").trim();
            const affKey = affiliateName.toLowerCase();
            if (affKey) {
              importedAffiliateNames.set(affKey, affiliateName);
              const affiliate = affMap.get(affKey);
              if (affiliate) {
                record.affiliateType = affiliate.type;
                record.internalAffiliateName = affiliate.internalName;
              }
            }

            const asinKey = [record.brand, record.store, record.region, record.asin]
              .map((value) => (value ?? "").toString().trim().toLowerCase())
              .join("||");
            const asinMapping = asinMap.get(asinKey);
            if (asinMapping) {
              record.parentAsin = asinMapping.parentAsin;
              record.storeProductLabel = asinMapping.storeProductLabel;
            }

            pendingRecords.push({ ...record, batchId: batch.id });
          }

          for (let index = 0; index < pendingRecords.length; index += CHUNK_SIZE) {
            const chunk = pendingRecords.slice(index, index + CHUNK_SIZE);
            await tx.salesRecord.createMany({ data: chunk });
            importedCount += chunk.length;
          }
        }

        if (importedCount === 0) {
          throw new Error("NO_VALID_SALES_ROWS");
        }

        await tx.salesBatch.update({
          where: { id: batch.id },
          data: { recordCount: importedCount },
        });

        await tx.adminAuditLog.create({
          data: {
            actorId: session.userId,
            action: "IMPORT",
            module: "BI",
            targetType: "SalesBatch",
            targetId: batch.id,
            targetLabel: fileName || platform || null,
            summary: `导入 BI 销售数据 ${importedCount} 条`,
            metadataJson: JSON.stringify({
              customerId,
              platform,
              importedCount,
              skippedCount: skipped.length,
            }),
          },
        });

        return batch.id;
      },
      // Preserve atomicity while allowing 500k+ row imports to finish.
      { maxWait: 10_000, timeout: 9 * 60 * 1000 },
    );

    // Clean up temp file only after the atomic sales transaction succeeds.
    deleteTempFile(tempId);

    // Auto-add unknown affiliates to the library (status: 待开发)
    let newAffiliateCount = 0;
    try {
      const toCreate = [...importedAffiliateNames]
        .filter(([normalizedName]) => !affMap.has(normalizedName))
        .map(([, name]) => ({
          platformAffiliateName: name,
          developmentStatus: "待开发 Not Yet Contacted",
          affiliateType: "待定",
          tags: "[]",
        }));
      if (toCreate.length > 0) {
        // One bulk insert replaces a network/SQLite round trip per affiliate.
        // Affiliate currently has no unique-name constraint, so createMany is
        // equivalent to the previous pre-checked sequential create loop.
        const result = await prisma.affiliate.createMany({ data: toCreate });
        newAffiliateCount = result.count;
        for (const affiliate of toCreate) {
          affMap.set(affiliate.platformAffiliateName.toLowerCase().trim(), {
            type: affiliate.affiliateType,
            internalName: null,
          });
        }
      }
    } catch (e) {
      // Non-fatal: log but don't fail the import
      console.error("[sales/upload] auto-add affiliate error:", e);
    }

    return NextResponse.json({
      imported: importedCount,
      skipped,
      errors: [],
      batchId,
      newAffiliateCount,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NO_VALID_SALES_ROWS") {
      return NextResponse.json(
        {
          error:
            "未能识别任何有效数据行。请确认「订单日期 / 联盟商名称 / 销售金额」列已正确映射且数据非空。",
        },
        { status: 400 },
      );
    }
    return errorResponse(err, "sales.upload");
  }
}
