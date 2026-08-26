import { projectDataPrisma as db } from "@/lib/projectDataPrisma";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BITABLE_PAGES = 20;
const MAX_SHEET_ROWS = 5_000;

type Source = {
  id: string;
  projectId: string;
  sourceType: string;
  sourceUrl: string | null;
  appToken: string | null;
  tableId: string | null;
  viewId: string | null;
  headerRowIndex: number;
  configuration: string;
};

type SourceRow = { externalId?: string; values: Record<string, unknown> };

type TokenCache = { token: string; expiresAt: number };
const globalCache = globalThis as typeof globalThis & {
  __feishuTokenCache?: TokenCache;
  __feishuDiscountSyncLocks?: Set<string>;
};
const syncLocks = (globalCache.__feishuDiscountSyncLocks ??= new Set<string>());

function credentials() {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("服务器未配置 FEISHU_APP_ID 或 FEISHU_APP_SECRET。");
  }
  return { appId, appSecret };
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = (await response.json()) as T & {
      code?: number;
      msg?: string;
    };
    if (
      !response.ok ||
      (typeof payload.code === "number" && payload.code !== 0)
    ) {
      throw new Error(
        `飞书接口失败 [${payload.code ?? response.status}]：${payload.msg || response.statusText}`,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("飞书接口请求超时。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function tenantToken() {
  const cached = globalCache.__feishuTokenCache;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { appId, appSecret } = credentials();
  const payload = await requestJson<{
    tenant_access_token: string;
    expire: number;
  }>(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!payload.tenant_access_token)
    throw new Error("飞书未返回 tenant_access_token。");
  globalCache.__feishuTokenCache = {
    token: payload.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, payload.expire || 3600) * 1000,
  };
  return payload.tenant_access_token;
}

async function feishuGet<T>(url: string): Promise<T> {
  const token = await tenantToken();
  return requestJson<T>(url, { headers: { Authorization: `Bearer ${token}` } });
}

function fromWiki(source: Source) {
  try {
    return new URL(source.sourceUrl || "").pathname
      .split("/")
      .filter(Boolean)
      .includes("wiki");
  } catch {
    return false;
  }
}

async function resolveWikiToken(source: Source, expected: "bitable" | "sheet") {
  if (!source.appToken) throw new Error("数据源缺少 App Token。");
  if (!fromWiki(source)) return source.appToken;
  const payload = await feishuGet<{
    data?: { node?: { obj_token?: string; obj_type?: string } };
  }>(
    `${FEISHU_BASE}/wiki/v2/spaces/get_node?token=${encodeURIComponent(source.appToken)}`,
  );
  const node = payload.data?.node;
  if (!node?.obj_token) throw new Error("Wiki 节点未返回实际文档 Token。");
  const type = String(node.obj_type || "").toLowerCase();
  if (
    expected === "bitable" &&
    type &&
    !type.includes("bitable") &&
    !type.includes("base")
  ) {
    throw new Error(`Wiki 节点不是多维表格（${node.obj_type}）。`);
  }
  if (expected === "sheet" && type && !type.includes("sheet")) {
    throw new Error(`Wiki 节点不是电子表格（${node.obj_type}）。`);
  }
  return node.obj_token;
}

function valueToString(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "number" &&
    value > 946684800000 &&
    value < 4102444800000
  ) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (Array.isArray(value))
    return value.map(valueToString).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    const link = item.link ?? item.url ?? item.href;
    const label = item.text ?? item.name ?? item.formattedValue ?? item.value;
    if (link)
      return label ? `${valueToString(label)} (${String(link)})` : String(link);
    if (label != null) return valueToString(label);
    return JSON.stringify(value);
  }
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .trim();
}

async function readBitable(source: Source): Promise<SourceRow[]> {
  if (!source.tableId) throw new Error("数据源缺少 Table ID。");
  const appToken = await resolveWikiToken(source, "bitable");
  const rows: SourceRow[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_BITABLE_PAGES; page += 1) {
    const params = new URLSearchParams({ page_size: "500" });
    if (source.viewId) params.set("view_id", source.viewId);
    if (pageToken) params.set("page_token", pageToken);
    const payload = await feishuGet<{
      data?: {
        items?: Array<{ record_id?: string; fields?: Record<string, unknown> }>;
        has_more?: boolean;
        page_token?: string;
      };
    }>(
      `${FEISHU_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(source.tableId)}/records?${params}`,
    );
    for (const item of payload.data?.items || []) {
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item.fields || {}))
        values[key] = valueToString(value);
      rows.push({ externalId: item.record_id, values });
    }
    if (!payload.data?.has_more || !payload.data.page_token) break;
    pageToken = payload.data.page_token;
  }
  return rows;
}

function headerText(value: unknown) {
  return valueToString(value).trim();
}

async function readSheet(source: Source): Promise<SourceRow[]> {
  if (!source.tableId) throw new Error("数据源缺少 Sheet ID。");
  const spreadsheetToken = await resolveWikiToken(source, "sheet");
  const all: unknown[][] = [];
  for (let start = 1; start <= MAX_SHEET_ROWS; start += 100) {
    const end = Math.min(MAX_SHEET_ROWS, start + 99);
    const range = `${source.tableId}!A${start}:ZZ${end}`;
    const payload = await feishuGet<{
      data?: { valueRange?: { values?: unknown[][] } };
    }>(
      `${FEISHU_BASE}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${encodeURIComponent(range)}?valueRenderOption=FormattedValue`,
    );
    const values = payload.data?.valueRange?.values || [];
    all.push(...values);
    if (values.length < 100) break;
  }
  const headerIndex = Math.max(0, Math.min(4, source.headerRowIndex - 1));
  const headers = (all[headerIndex] || []).map(headerText);
  if (!headers.some(Boolean))
    throw new Error(`第 ${source.headerRowIndex} 行未识别到表头。`);
  return all.slice(headerIndex + 1).flatMap((row) => {
    const values: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) values[header] = valueToString(row[index]);
    });
    return Object.values(values).some(Boolean) ? [{ values }] : [];
  });
}

export async function inspectFeishuDiscountSource(source: Source) {
  const rows =
    source.sourceType === "feishu_sheets"
      ? await readSheet(source)
      : await readBitable(source);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row.values)))];
  const sample =
    rows.find((row) => Object.values(row.values).some(Boolean))?.values || {};
  return { headers, sample, rowCount: rows.length };
}

function parseNumber(value: unknown): number | null {
  const raw = valueToString(value).replace(/[,\s%$¥€£#₩₹]/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value: unknown): number | null {
  const raw = valueToString(value);
  const number = parseNumber(raw);
  if (number == null) return null;
  return !raw.includes("%") && Math.abs(number) <= 1 && raw.includes(".")
    ? number * 100
    : number;
}

function parseDate(value: unknown): Date | null {
  const raw = valueToString(value);
  if (!raw || raw.startsWith("=")) return null;
  const number = Number(raw);
  if (Number.isFinite(number) && number > 20000 && number < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30));
    date.setUTCDate(
      date.getUTCDate() + Math.floor(number) - (number >= 60 ? 1 : 0),
    );
    return date;
  }
  if (
    Number.isFinite(number) &&
    number > 946684800000 &&
    number < 4102444800000
  )
    return new Date(number);
  const short = raw.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (short) {
    const year = short[3]
      ? short[3].length === 2
        ? 2000 + Number(short[3])
        : Number(short[3])
      : new Date().getFullYear();
    return new Date(Date.UTC(year, Number(short[1]) - 1, Number(short[2])));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mappedValue(values: Record<string, unknown>, sourceField: string) {
  if (sourceField === "__empty__") return "";
  if (sourceField.startsWith("__manual__:"))
    return sourceField.slice("__manual__:".length);
  return values[sourceField];
}

function externalKey(fields: Record<string, unknown>, fallback: string) {
  const parts = [
    fields.brand,
    fields.asin || fields.productLink,
    fields.platform,
    fields.store,
    fields.dealType,
    fields.startDate,
    fields.endDate,
  ].map((value) => valueToString(value).trim().toUpperCase());
  return parts.some(Boolean) ? parts.join("|") : fallback;
}

export async function syncFeishuDiscountSource(
  source: Source,
  operatorId: string,
) {
  if (syncLocks.has(source.id))
    throw new Error("该数据源正在同步，请勿重复提交。");
  syncLocks.add(source.id);
  try {
    const mappings = await db.projectDiscountFieldMapping.findMany({
      where: { sourceId: source.id },
    });
    if (!mappings.length) throw new Error("请先配置字段映射，再执行同步。");
    const rawRows =
      source.sourceType === "feishu_sheets"
        ? await readSheet(source)
        : await readBitable(source);
    const configuration = (() => {
      try {
        return JSON.parse(source.configuration || "{}");
      } catch {
        return {};
      }
    })() as Record<string, unknown>;
    const currency = String(configuration.currency || "USD").toUpperCase();
    const prepared = rawRows.map((row, index) => {
      const fields: Record<string, unknown> = {};
      for (const mapping of mappings)
        fields[mapping.targetField] = mappedValue(
          row.values,
          mapping.sourceField,
        );
      const originalPrice = parseNumber(fields.originalPrice);
      const discountPrice = parseNumber(fields.discountPrice);
      let discountRate = parsePercent(fields.discountRate);
      if (discountRate == null && originalPrice && discountPrice != null)
        discountRate =
          Math.round(
            ((originalPrice - discountPrice) / originalPrice) * 10_000,
          ) / 100;
      const startDate = parseDate(fields.startDate);
      const endDate = parseDate(fields.endDate);
      const lastUpdated = parseDate(fields.lastUpdated);
      const externalRecordId =
        source.sourceType === "feishu_sheets"
          ? externalKey(fields, `row-${index + 1}`)
          : row.externalId || externalKey(fields, `row-${index + 1}`);
      return {
        externalRecordId,
        occurredAt: startDate || lastUpdated || new Date(),
        currency,
        grossAmount: originalPrice || 0,
        discountAmount:
          originalPrice != null && discountPrice != null
            ? Math.max(0, originalPrice - discountPrice)
            : 0,
        netAmount: discountPrice ?? originalPrice ?? 0,
        rawData: JSON.stringify(row.values),
        salesType: null,
        productCategory: valueToString(fields.productCategory) || null,
        asin: valueToString(fields.asin) || null,
        productLink:
          valueToString(fields.productLink).match(/https?:\/\/[^)\s]+/)?.[0] ||
          valueToString(fields.productLink) ||
          null,
        originalPrice,
        discountPrice,
        discountRate,
        startDate,
        endDate,
        promoCode: valueToString(fields.promoCode) || null,
        accCampaignId: valueToString(fields.accCampaignId) || null,
        accGoldRatio: parsePercent(fields.accGoldRatio),
        lastUpdated,
        dealType: valueToString(fields.dealType) || null,
        brand: valueToString(fields.brand) || null,
        platform: valueToString(fields.platform) || null,
        store: valueToString(fields.store) || null,
      };
    });
    const uniquePrepared = [
      ...new Map(
        prepared.map((item) => [item.externalRecordId, item]),
      ).values(),
    ];
    const existing = await db.projectDiscountRecord.findMany({
      where: { sourceId: source.id },
      select: { id: true, externalRecordId: true },
    });
    const existingMap = new Map(
      existing.map((item) => [item.externalRecordId, item.id]),
    );
    const incomingIds = new Set(
      uniquePrepared.map((item) => item.externalRecordId),
    );
    const staleIds = existing
      .filter((item) => !incomingIds.has(item.externalRecordId || ""))
      .map((item) => item.id);
    let addedCount = 0;
    let updatedCount = 0;
    await db.$transaction(async (tx) => {
      for (const item of uniquePrepared) {
        const currentId = existingMap.get(item.externalRecordId);
        if (currentId) {
          await tx.projectDiscountRecord.update({
            where: { id: currentId },
            data: item,
          });
          updatedCount += 1;
        } else {
          await tx.projectDiscountRecord.create({
            data: { ...item, projectId: source.projectId, sourceId: source.id },
          });
          addedCount += 1;
        }
      }
      if (staleIds.length)
        await tx.projectDiscountRecord.deleteMany({
          where: { id: { in: staleIds } },
        });
      await tx.projectDiscountSource.update({
        where: { id: source.id },
        data: {
          syncStatus: "COMPLETED",
          syncError: null,
          lastSyncAt: new Date(),
          lastSyncCount: uniquePrepared.length,
          lastOperatedById: operatorId,
          lastOperatedAt: new Date(),
        },
      });
    });
    return {
      syncedCount: uniquePrepared.length,
      previousCount: existing.length,
      addedCount,
      updatedCount,
      deletedCount: staleIds.length,
    };
  } finally {
    syncLocks.delete(source.id);
  }
}
