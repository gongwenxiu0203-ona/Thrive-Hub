import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_FONT =
  "'Noto Sans CJK SC','Noto Sans SC','Microsoft YaHei','WenQuanYi Micro Hei',Arial,sans-serif";

export type ReconciliationStatementRow = {
  id: string;
  stream: "FIXED_FEE" | "SALES_COMMISSION";
  createdAt: Date;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  currency: string;
  actualSalesAmount: number | null;
  commissionRate: number | null;
  contractNo?: string | null;
};

export type ReconciliationBiDetail = {
  id: string;
  orderDate: Date;
  affiliatePlatform: string;
  affiliateName: string;
  internalAffiliateName: string | null;
  asin: string | null;
  parentAsin: string | null;
  storeProductLabel: string | null;
  orders: number;
  unitsSold: number;
  revenue: number;
};

export type ReconciliationBiSection = {
  reconciliationId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  lockedSalesAmount: number;
  currentBiSalesAmount: number;
  difference: number;
  recordCount: number;
  orderCount: number;
  unitsSold: number;
  details: ReconciliationBiDetail[];
};

export type ReconciliationStatementData = {
  statementNo: string;
  customerName: string;
  generatedAt: Date;
  rows: ReconciliationStatementRow[];
  biSections: ReconciliationBiSection[];
};

type StatementPage = {
  rows: ReconciliationStatementRow[];
  first: boolean;
  summary: boolean;
};

type BiStatementPage = {
  section: ReconciliationBiSection;
  details: ReconciliationBiDetail[];
  first: boolean;
};

let logoDataPromise: Promise<string> | null = null;

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function normalizeCurrency(value: string): string {
  const currency = value.trim();
  if (currency === "人民币" || currency === "RMB" || currency === "CNY") return "CNY";
  if (currency === "美金" || currency === "美元" || currency === "USD") return "USD";
  return currency || "CNY";
}

function formatMoney(value: number, currency: string): string {
  const normalized = normalizeCurrency(currency);
  if (/^[A-Z]{3}$/.test(normalized)) {
    try {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: normalized,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      // Fall through to the stable plain-text representation.
    }
  }
  return `${normalized} ${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function truncate(value: unknown, max: number): string {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function formatPercent(value: number | null): string {
  if (value == null) return "-";
  return `${(value * 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`;
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
async function logoDataUri(): Promise<string> {
  logoDataPromise ??= fs
    .readFile(path.join(process.cwd(), "public", "thraive-logo.png"))
    .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`);
  return logoDataPromise;
}

function paginate(rows: ReconciliationStatementRow[]): StatementPage[] {
  const firstCapacity = 8;
  const followingCapacity = 12;
  const pages: StatementPage[] = [];
  let offset = 0;
  let first = true;

  while (offset < rows.length) {
    const capacity = first ? firstCapacity : followingCapacity;
    const pageRows = rows.slice(offset, offset + capacity);
    offset += pageRows.length;
    pages.push({ rows: pageRows, first, summary: false });
    first = false;
  }

  if (pages.length === 0) pages.push({ rows: [], first: true, summary: true });
  const last = pages.at(-1)!;
  const capacity = last.first ? firstCapacity : followingCapacity;
  if (last.rows.length <= capacity - 3) {
    last.summary = true;
  } else {
    pages.push({ rows: [], first: false, summary: true });
  }
  return pages;
}

function totalsByCurrency(rows: ReconciliationStatementRow[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderHeader(logo: string, compact: boolean): string {
  const top = compact ? 50 : 60;
  return `
    <rect x="0" y="0" width="${PAGE_WIDTH}" height="34" fill="#334155"/>
    <rect x="0" y="34" width="18" height="128" fill="#6d55e8"/>
    <image href="${logo}" x="${MARGIN}" y="${top}" width="116" height="50" preserveAspectRatio="xMidYMid meet"/>
    <text x="${MARGIN + 136}" y="${top + 20}" font-family="${BODY_FONT}" font-size="15" font-weight="700" fill="#334155">THRAIVE · FINANCE OPERATIONS</text>
    <text x="${MARGIN + 136}" y="${top + 46}" font-family="${BODY_FONT}" font-size="14" fill="#667085">客户结算与销售数据核对中心</text>
    <text x="${PAGE_WIDTH - MARGIN}" y="${top + 22}" font-family="${BODY_FONT}" font-size="${compact ? 27 : 31}" font-weight="700" fill="#334155" text-anchor="end">客户对账运营报告</text>
    <text x="${PAGE_WIDTH - MARGIN}" y="${top + 49}" font-family="${BODY_FONT}" font-size="13" font-weight="700" letter-spacing="1.5" fill="#6d55e8" text-anchor="end">RECONCILIATION OPERATIONS REPORT</text>
    <line x1="${MARGIN}" y1="${top + 79}" x2="${PAGE_WIDTH - MARGIN}" y2="${top + 79}" stroke="#e7e0ef" stroke-width="2"/>
  `;
}
function renderCustomerBlock(statement: ReconciliationStatementData): string {
  const starts = statement.rows.map((row) => row.periodStart.getTime());
  const ends = statement.rows.map((row) => row.periodEnd.getTime());
  const range = statement.rows.length
    ? `${formatDate(new Date(Math.min(...starts)))} - ${formatDate(new Date(Math.max(...ends)))}`
    : "-";
  const commissionCount = statement.rows.filter((row) => row.stream === "SALES_COMMISSION").length;
  return `
    <rect x="${MARGIN}" y="178" width="${CONTENT_WIDTH}" height="200" rx="14" fill="#fbfaff" stroke="#dcd4e7"/>
    <text x="${MARGIN + 24}" y="215" font-family="${BODY_FONT}" font-size="13" font-weight="700" letter-spacing="1" fill="#5d43d4">CUSTOMER OVERVIEW</text>
    <text x="${MARGIN + 24}" y="258" font-family="${BODY_FONT}" font-size="28" font-weight="700" fill="#334155">${escapeXml(statement.customerName)}</text>
    <text x="${MARGIN + 24}" y="307" font-family="${BODY_FONT}" font-size="14" fill="#667085">覆盖周期</text>
    <text x="${MARGIN + 24}" y="340" font-family="${BODY_FONT}" font-size="18" font-weight="600" fill="#344054">${escapeXml(range)}</text>
    <line x1="620" y1="202" x2="620" y2="352" stroke="#dcd4e7"/>
    <text x="650" y="218" font-family="${BODY_FONT}" font-size="14" fill="#667085">报告编号</text>
    <text x="${PAGE_WIDTH - MARGIN - 24}" y="218" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#334155" text-anchor="end">${escapeXml(statement.statementNo)}</text>
    <text x="650" y="267" font-family="${BODY_FONT}" font-size="14" fill="#667085">生成时间</text>
    <text x="${PAGE_WIDTH - MARGIN - 24}" y="267" font-family="${BODY_FONT}" font-size="16" fill="#344054" text-anchor="end">${escapeXml(formatDateTime(statement.generatedAt))}</text>
    <text x="650" y="316" font-family="${BODY_FONT}" font-size="14" fill="#667085">对账记录 / 销售佣金</text>
    <text x="${PAGE_WIDTH - MARGIN - 24}" y="316" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#334155" text-anchor="end">${statement.rows.length} / ${commissionCount}</text>
  `;
}
function renderTableHeader(y: number): string {
  const columns = [72, 202, 352, 570, 778, 900, 1168];
  const centers = [137, 277, 461, 674, 839, 1034];
  const labels = ["费用类型", "创建时间", "对账周期", "实际销售额", "佣金比例", "待支付金额"];
  return `
    <rect x="${MARGIN}" y="${y}" width="${CONTENT_WIDTH}" height="58" rx="5" fill="#334155"/>
    ${columns.slice(1, -1).map((x) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 58}" stroke="#8f7cf0"/>`).join("")}
    ${labels.map((label, index) => `<text x="${centers[index]}" y="${y + 37}" font-family="${BODY_FONT}" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>`).join("")}
  `;
}
function renderRows(rows: ReconciliationStatementRow[], startY: number): { svg: string; bottom: number } {
  let y = startY;
  let svg = "";
  rows.forEach((row, index) => {
    const height = 86;
    const fill = index % 2 === 0 ? "#ffffff" : "#faf8ff";
    const isFixed = row.stream === "FIXED_FEE";
    const label = isFixed ? "固费" : "销售佣金";
    const accent = isFixed ? "#64748b" : "#5d43d4";
    const sales = row.actualSalesAmount == null ? "-" : formatMoney(row.actualSalesAmount, row.currency);
    svg += `
      <rect x="${MARGIN}" y="${y}" width="${CONTENT_WIDTH}" height="${height}" fill="${fill}" stroke="#e7e0ef"/>
      <rect x="88" y="${y + 25}" width="98" height="36" rx="18" fill="${accent}" fill-opacity="0.11"/>
      <text x="137" y="${y + 49}" font-family="${BODY_FONT}" font-size="15" font-weight="700" fill="${accent}" text-anchor="middle">${label}</text>
      <text x="277" y="${y + 35}" font-family="${BODY_FONT}" font-size="14" fill="#101828" text-anchor="middle">${escapeXml(formatDate(row.createdAt))}</text>
      <text x="277" y="${y + 59}" font-family="${BODY_FONT}" font-size="12" fill="#98a2b3" text-anchor="middle">${escapeXml(formatDateTime(row.createdAt).split(" ").at(-1) ?? "")}</text>
      <text x="461" y="${y + 35}" font-family="${BODY_FONT}" font-size="14" fill="#101828" text-anchor="middle">${escapeXml(formatDate(row.periodStart))}</text>
      <text x="461" y="${y + 59}" font-family="${BODY_FONT}" font-size="13" fill="#667085" text-anchor="middle">至 ${escapeXml(formatDate(row.periodEnd))}</text>
      <text x="756" y="${y + 49}" font-family="${BODY_FONT}" font-size="14" fill="#344054" text-anchor="end">${escapeXml(sales)}</text>
      <text x="839" y="${y + 49}" font-family="${BODY_FONT}" font-size="15" font-weight="700" fill="#344054" text-anchor="middle">${escapeXml(formatPercent(row.commissionRate))}</text>
      <text x="1144" y="${y + 49}" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#334155" text-anchor="end">${escapeXml(formatMoney(row.amount, row.currency))}</text>
    `;
    y += height;
  });
  return { svg, bottom: y };
}
function renderSummary(
  statement: ReconciliationStatementData,
  startY: number,
  summaryOnly = false,
): string {
  const totals = totalsByCurrency(statement.rows);
  const y = summaryOnly ? 280 : Math.max(startY + 28, 720);
  const totalLines = totals.length
    ? totals.map(([currency, total], index) => `
        <text x="790" y="${y + 46 + index * 39}" font-family="${BODY_FONT}" font-size="16" fill="#667085">${escapeXml(currency)} 待支付合计</text>
        <text x="${PAGE_WIDTH - MARGIN - 24}" y="${y + 46 + index * 39}" font-family="${BODY_FONT}" font-size="22" font-weight="700" fill="#334155" text-anchor="end">${escapeXml(formatMoney(total, currency))}</text>
      `).join("")
    : `<text x="${PAGE_WIDTH - MARGIN - 24}" y="${y + 46}" font-family="${BODY_FONT}" font-size="20" fill="#667085" text-anchor="end">-</text>`;
  const totalHeight = Math.max(90, 36 + Math.max(1, totals.length) * 39);
  const noteY = y + totalHeight + 42;
  return `
    <rect x="760" y="${y}" width="${PAGE_WIDTH - MARGIN - 760}" height="${totalHeight}" rx="10" fill="#f3efff" stroke="#dcd4e7"/>
    ${totalLines}
    <line x1="${MARGIN}" y1="${noteY - 18}" x2="${PAGE_WIDTH - MARGIN}" y2="${noteY - 18}" stroke="#e7e0ef"/>
    <text x="${MARGIN}" y="${noteY + 20}" font-family="${BODY_FONT}" font-size="18" font-weight="700" fill="#334155">运营核对说明</text>
    <text x="${MARGIN}" y="${noteY + 57}" font-family="${BODY_FONT}" font-size="15" fill="#475467">实际销售额采用对账锁定口径；销售佣金的当前 BI 销售额、差异及销售明细见后续附页。</text>
    <text x="${MARGIN}" y="${noteY + 87}" font-family="${BODY_FONT}" font-size="15" fill="#475467">不同币种分别汇总，不进行自动折算。本报告用于运营核对，不作为税务发票或付款凭证。</text>
    <rect x="${MARGIN}" y="${noteY + 118}" width="170" height="34" rx="17" fill="#f3efff"/>
    <text x="${MARGIN + 85}" y="${noteY + 141}" font-family="${BODY_FONT}" font-size="13" font-weight="700" fill="#5d43d4" text-anchor="middle">结算口径已锁定</text>
    <rect x="${MARGIN + 184}" y="${noteY + 118}" width="190" height="34" rx="17" fill="#f1f5f9"/>
    <text x="${MARGIN + 279}" y="${noteY + 141}" font-family="${BODY_FONT}" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle">BI 数据按导出时点</text>
  `;
}
function buildBiPages(sections: ReconciliationBiSection[]): BiStatementPage[] {
  const pages: BiStatementPage[] = [];
  for (const section of sections) {
    const firstDetails = section.details.slice(0, 15);
    pages.push({ section, details: firstDetails, first: true });
    let offset = firstDetails.length;
    while (offset < section.details.length) {
      const details = section.details.slice(offset, offset + 18);
      pages.push({ section, details, first: false });
      offset += details.length;
    }
  }
  return pages;
}

function renderBiOverview(section: ReconciliationBiSection): string {
  const differenceColor = Math.abs(section.difference) < 0.005 ? "#5d43d4" : "#c2413a";
  return `
    <text x="${MARGIN}" y="218" font-family="${BODY_FONT}" font-size="13" font-weight="700" letter-spacing="1" fill="#5d43d4">COMMISSION SALES CHECK</text>
    <text x="${MARGIN}" y="258" font-family="${BODY_FONT}" font-size="24" font-weight="700" fill="#334155">销售佣金 BI 核对</text>
    <text x="${PAGE_WIDTH - MARGIN}" y="256" font-family="${BODY_FONT}" font-size="15" fill="#667085" text-anchor="end">${escapeXml(formatDate(section.periodStart))} 至 ${escapeXml(formatDate(section.periodEnd))}</text>
    <rect x="${MARGIN}" y="286" width="256" height="110" rx="12" fill="#fbfaff" stroke="#dcd4e7"/>
    <text x="${MARGIN + 20}" y="320" font-family="${BODY_FONT}" font-size="13" fill="#667085">锁定销售额</text>
    <text x="${MARGIN + 20}" y="365" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#334155">${escapeXml(formatMoney(section.lockedSalesAmount, section.currency))}</text>
    <rect x="346" y="286" width="256" height="110" rx="12" fill="#fbfaff" stroke="#dcd4e7"/>
    <text x="366" y="320" font-family="${BODY_FONT}" font-size="13" fill="#667085">当前 BI 销售额</text>
    <text x="366" y="365" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#334155">${escapeXml(formatMoney(section.currentBiSalesAmount, section.currency))}</text>
    <rect x="620" y="286" width="230" height="110" rx="12" fill="#fff8f1" stroke="#ead8c4"/>
    <text x="640" y="320" font-family="${BODY_FONT}" font-size="13" fill="#667085">差异（当前 BI - 锁定）</text>
    <text x="640" y="365" font-family="${BODY_FONT}" font-size="19" font-weight="700" fill="${differenceColor}">${escapeXml(formatMoney(section.difference, section.currency))}</text>
    <rect x="868" y="286" width="300" height="110" rx="12" fill="#f7f8fa" stroke="#e7e0ef"/>
    <text x="888" y="320" font-family="${BODY_FONT}" font-size="13" fill="#667085">BI 明细 / 订单 / 销量</text>
    <text x="888" y="365" font-family="${BODY_FONT}" font-size="19" font-weight="700" fill="#334155">${section.recordCount} / ${formatNumber(section.orderCount)} / ${formatNumber(section.unitsSold)}</text>
  `;
}

function renderBiTableHeader(y: number): string {
  const columns = [72, 190, 360, 595, 875, 965, 1055, 1168];
  const centers = [131, 275, 477, 735, 920, 1010, 1111];
  const labels = ["订单日期", "联盟平台", "联盟商", "ASIN / 链接标签", "订单", "销量", "销售额"];
  return `
    <rect x="${MARGIN}" y="${y}" width="${CONTENT_WIDTH}" height="52" rx="5" fill="#5d43d4"/>
    ${columns.slice(1, -1).map((x) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 52}" stroke="#8f7cf0"/>`).join("")}
    ${labels.map((label, index) => `<text x="${centers[index]}" y="${y + 34}" font-family="${BODY_FONT}" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>`).join("")}
  `;
}

function renderBiRows(details: ReconciliationBiDetail[], currency: string, startY: number): string {
  if (details.length === 0) {
    return `
      <rect x="${MARGIN}" y="${startY}" width="${CONTENT_WIDTH}" height="112" fill="#faf8ff" stroke="#e7e0ef"/>
      <text x="${PAGE_WIDTH / 2}" y="${startY + 67}" font-family="${BODY_FONT}" font-size="16" fill="#667085" text-anchor="middle">该周期当前没有可用的 BI 销售明细</text>
    `;
  }
  let y = startY;
  let svg = "";
  details.forEach((detail, index) => {
    const fill = index % 2 === 0 ? "#ffffff" : "#faf8ff";
    const affiliateTop = truncate(detail.internalAffiliateName || detail.affiliateName, 18);
    const affiliateBottom = detail.internalAffiliateName ? truncate(detail.affiliateName, 21) : "";
    const productTop = truncate(detail.asin || detail.parentAsin || "-", 22);
    const productBottom = truncate(detail.storeProductLabel || "", 28);
    svg += `
      <rect x="${MARGIN}" y="${y}" width="${CONTENT_WIDTH}" height="72" fill="${fill}" stroke="#e7e0ef"/>
      <text x="131" y="${y + 43}" font-family="${BODY_FONT}" font-size="12" fill="#344054" text-anchor="middle">${escapeXml(formatDate(detail.orderDate))}</text>
      <text x="275" y="${y + 43}" font-family="${BODY_FONT}" font-size="12" fill="#344054" text-anchor="middle">${escapeXml(truncate(detail.affiliatePlatform, 20))}</text>
      <text x="477" y="${y + (affiliateBottom ? 29 : 43)}" font-family="${BODY_FONT}" font-size="12" font-weight="${affiliateBottom ? 700 : 400}" fill="#344054" text-anchor="middle">${escapeXml(affiliateTop)}</text>
      ${affiliateBottom ? `<text x="477" y="${y + 51}" font-family="${BODY_FONT}" font-size="11" fill="#667085" text-anchor="middle">${escapeXml(affiliateBottom)}</text>` : ""}
      <text x="735" y="${y + (productBottom ? 29 : 43)}" font-family="${BODY_FONT}" font-size="12" font-weight="600" fill="#344054" text-anchor="middle">${escapeXml(productTop)}</text>
      ${productBottom ? `<text x="735" y="${y + 51}" font-family="${BODY_FONT}" font-size="11" fill="#667085" text-anchor="middle">${escapeXml(productBottom)}</text>` : ""}
      <text x="920" y="${y + 43}" font-family="${BODY_FONT}" font-size="12" fill="#344054" text-anchor="middle">${formatNumber(detail.orders)}</text>
      <text x="1010" y="${y + 43}" font-family="${BODY_FONT}" font-size="12" fill="#344054" text-anchor="middle">${formatNumber(detail.unitsSold)}</text>
      <text x="1148" y="${y + 43}" font-family="${BODY_FONT}" font-size="12" font-weight="700" fill="#334155" text-anchor="end">${escapeXml(formatMoney(detail.revenue, currency))}</text>
    `;
    y += 72;
  });
  return svg;
}

function renderBiPageSvg(
  statement: ReconciliationStatementData,
  page: BiStatementPage,
  pageIndex: number,
  pageCount: number,
  logo: string,
): string {
  const tableY = page.first ? 438 : 232;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
    <rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#ffffff"/>
    ${renderHeader(logo, true)}
    ${page.first
      ? renderBiOverview(page.section)
      : `<text x="${MARGIN}" y="216" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#334155">${escapeXml(formatDate(page.section.periodStart))} 至 ${escapeXml(formatDate(page.section.periodEnd))} · BI 销售明细续表</text>`}
    ${renderBiTableHeader(tableY)}
    ${renderBiRows(page.details, page.section.currency, tableY + 52)}
    <line x1="${MARGIN}" y1="1660" x2="${PAGE_WIDTH - MARGIN}" y2="1660" stroke="#e7e0ef"/>
    <text x="${MARGIN}" y="1697" font-family="${BODY_FONT}" font-size="13" fill="#98a2b3">Thraive Hub · BI 销售核对 · ${escapeXml(statement.statementNo)}</text>
    <text x="${PAGE_WIDTH - MARGIN}" y="1697" font-family="${BODY_FONT}" font-size="13" fill="#98a2b3" text-anchor="end">第 ${pageIndex + 1} 页 / 共 ${pageCount} 页</text>
  </svg>`;
}
function renderPageSvg(
  statement: ReconciliationStatementData,
  page: StatementPage,
  pageIndex: number,
  pageCount: number,
  logo: string,
): string {
  const tableY = page.first ? 424 : 190;
  const summaryOnly = page.summary && page.rows.length === 0 && !page.first;
  const renderedRows = renderRows(page.rows, tableY + 58);
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
    <rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#ffffff"/>
    ${renderHeader(logo, !page.first)}
    ${page.first ? renderCustomerBlock(statement) : ""}
    ${summaryOnly ? "" : renderTableHeader(tableY)}
    ${summaryOnly ? "" : renderedRows.svg}
    ${page.summary ? renderSummary(statement, renderedRows.bottom, summaryOnly) : ""}
    <line x1="${MARGIN}" y1="1660" x2="${PAGE_WIDTH - MARGIN}" y2="1660" stroke="#eaecf0"/>
    <text x="${MARGIN}" y="1697" font-family="${BODY_FONT}" font-size="15" fill="#98a2b3">Thraive Hub · ${escapeXml(statement.statementNo)}</text>
    <text x="${PAGE_WIDTH - MARGIN}" y="1697" font-family="${BODY_FONT}" font-size="15" fill="#98a2b3" text-anchor="end">第 ${pageIndex + 1} 页 / 共 ${pageCount} 页</text>
  </svg>`;
}

export async function generateReconciliationStatementPdf(
  statement: ReconciliationStatementData,
): Promise<Uint8Array> {
  const sortedRows = [...statement.rows].sort((a, b) =>
    a.periodStart.getTime() - b.periodStart.getTime()
    || a.stream.localeCompare(b.stream)
    || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const normalized = { ...statement, rows: sortedRows };
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Reconciliation Operations Report ${statement.statementNo}`);
  pdf.setAuthor("HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED");
  pdf.setSubject(`${statement.customerName} 客户对账运营报告`);
  pdf.setCreator("Thraive Hub");
  pdf.setProducer("Thraive Hub");

  const logo = await logoDataUri();
  const pages = paginate(sortedRows);
  const biPages = buildBiPages(normalized.biSections);
  const pageCount = pages.length + biPages.length;
  for (let index = 0; index < pages.length; index += 1) {
    const svg = renderPageSvg(normalized, pages[index], index, pageCount, logo);
    const png = await sharp(Buffer.from(svg))
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
  }
  for (let index = 0; index < biPages.length; index += 1) {
    const svg = renderBiPageSvg(
      normalized,
      biPages[index],
      pages.length + index,
      pageCount,
      logo,
    );
    const png = await sharp(Buffer.from(svg))
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
  }
  return pdf.save({ useObjectStreams: true });
}

export function reconciliationStatementFilename(
  statement: Pick<ReconciliationStatementData, "customerName" | "generatedAt">,
): string {
  const date = statement.generatedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const safeName = `${statement.customerName}_客户对账运营报告_${date}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 150);
  return `${safeName || "reconciliation-operations-report"}.pdf`;
}
