/**
 * 合同 V4 DOCX 生成器（v3 — 全量精确修复）
 */
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";

// ── 乙方固定信息 ─────────────────────────────────────────────────────────────
export const PARTY_B = {
  name: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED",
  creditCode: "80456388",
  legalRep: "温志倩",
  address: "RM 29-33 5/F BEVERLEY COMMCTR 87-105 CHATHAM RD TSIMSHA TSUIHONG KONG",
  contact: "胡铭",
  phone: "18721724179",
  email: "ledo.h@thraiveagency.com",
  // 银行信息：完全按照用户提供的格式，不增删
  bankAccountName: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO   LIMITED",
  bank: "Citibank",
  accountNo: "70581350002448827",
  swift: "CITIUS33",
};

export interface ContractV4Data {
  contractNo: string;
  partyAName: string;
  partyACreditCode?: string | null;
  partyALegalRep?: string | null;
  partyAAddress?: string | null;
  partyAContact?: string | null;
  partyAPhone?: string | null;
  partyAEmail?: string | null;
  promoPlatform?: string | null;
  targetSite?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  taxType?: string | null;
  taxBearer?: string | null;
  feeAmount?: string | null;
  feeCurrency?: string | null;
  firstPeriodFee?: number | null;
  feeCycle?: string | null;
  commissionType?: string | null;
  commissionRate?: string | null;
  thresholdAmount?: string | null;
  thresholdCurrency?: string | null;
  tieredRules?: string | null;
  excessBaseMonths?: string | null;
  excessCommissionRate?: string | null;
  gmvSettlementCycle?: string | null;
  productList?: string | null;
  coopChannels?: string | null;
  partyBSignatureUrl?: string | null;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** XML 转义：防止甲方录入的 & < > 等字符破坏文档结构 */
function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(v: unknown, fallback = ""): string {
  if (v === null || v === undefined || v === "") return fallback;
  return escXml(String(v));
}

function fmtDatePart(d: Date | null | undefined, part: "year" | "month" | "day"): string {
  if (!d) return part === "year" ? "______" : "____";
  const date = new Date(d);
  if (part === "year") return String(date.getFullYear());
  if (part === "month") return String(date.getMonth() + 1).padStart(2, "0");
  return String(date.getDate()).padStart(2, "0");
}

/** 将 XML 按段落拆分（以 </w:p> 为界） */
function splitParas(xml: string): string[] { return xml.split("</w:p>"); }
function joinParas(paras: string[]): string { return paras.join("</w:p>"); }

/** 提取段落内所有 <w:t> 文本并拼接 */
function paraText(para: string): string {
  return [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");
}

function paraContains(para: string, kw: string): boolean {
  return paraText(para).includes(kw);
}

function paraHasCheckbox(para: string): boolean {
  return para.includes('w:font="Wingdings 2"');
}

// 空复选框的 Wingdings2 符号元素（模板里所有 □ 都是这个）
const EMPTY_BOX_SYM = '<w:sym w:font="Wingdings 2" w:char="00A3"/>';
// 勾选后展示为对号 √（用普通文本 ✓ 替换符号，确保渲染为对号）
const CHECK_MARK_RUN = '<w:t>✓</w:t>';

/** 将段落内第 n 个空复选框替换为对号 √ */
function checkNthBox(para: string, n: number): string {
  let count = 0;
  return para.split(EMPTY_BOX_SYM).reduce((acc, part, i, arr) => {
    if (i === 0) return part;
    count++;
    const sep = count === n ? CHECK_MARK_RUN : EMPTY_BOX_SYM;
    return acc + sep + part;
  });
}

/** 将段落内的空复选框按布尔数组逐个勾选（true=对号√） */
function checkBoxesByIndex(para: string, checks: boolean[]): string {
  let count = -1;
  return para.split(EMPTY_BOX_SYM).reduce((acc, part, i) => {
    if (i === 0) return part;
    count++;
    const sep = checks[count] === true ? CHECK_MARK_RUN : EMPTY_BOX_SYM;
    return acc + sep + part;
  });
}

/**
 * 填充段落内第 nth 个下划线空白行
 * 下划线空白的 XML 模式：<w:u w:val="single"/>...<w:t>   spaces   </w:t>
 */
function fillUnderlined(para: string, value: string, nth = 1): string {
  let count = 0;
  return para.replace(
    /(<w:u w:val="single"\/>(?:[^<]|<(?!\/w:rPr>))*?<\/w:rPr>)<w:t[^>]*>\s+<\/w:t>/g,
    (match, prefix) => {
      count++;
      return count === nth
        ? `${prefix}<w:t xml:space="preserve">${value}</w:t>`
        : match;
    }
  );
}

/**
 * 银行字段替换：移除 LABEL: 之后的所有内容（包括两个空白框和斜线），
 * 只保留 LABEL + 值
 */
function replaceBankField(para: string, label: string, value: string): string {
  const marker = `${label}：</w:t></w:r>`;
  const idx = para.indexOf(marker);
  if (idx === -1) return para;
  return (
    para.substring(0, idx + marker.length) +
    `<w:r><w:rPr><w:rFonts w:hint="eastAsia" w:asciiTheme="minorEastAsia" w:hAnsiTheme="minorEastAsia" w:cstheme="minorEastAsia"/><w:kern w:val="0"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`
  );
}

/** 简单文本替换（第 n 次出现） */
function replaceNth(xml: string, find: string, replace: string, n: number): string {
  let count = 0;
  return xml.replace(new RegExp(escapeRegex(find), "g"), (m) => {
    count++;
    return count === n ? replace : m;
  });
}

// ── 签名图片嵌入 ──────────────────────────────────────────────────────────────
const SIG_REL_ID = "rIdPartyBSig";
const SIG_MEDIA_PATH = "word/media/party-b-signature.png";

function buildSignatureDrawingXml(width = 1600000, height = 550000): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${width}" cy="${height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="999" name="PartyBSignature"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="999" name="PartyBSignature"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${SIG_REL_ID}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

async function embedSignature(zip: JSZip, sigPath: string): Promise<boolean> {
  if (!fs.existsSync(sigPath)) return false;
  const imgBuf = fs.readFileSync(sigPath);
  zip.file(SIG_MEDIA_PATH, imgBuf);

  // Add relationship
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (relsFile) {
    let rels = await relsFile.async("string");
    if (!rels.includes(SIG_REL_ID)) {
      rels = rels.replace(
        "</Relationships>",
        `<Relationship Id="${SIG_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/party-b-signature.png"/></Relationships>`
      );
      zip.file("word/_rels/document.xml.rels", rels);
    }
  }

  // Add content type if needed
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    if (!ct.includes('Extension="png"')) {
      ct = ct.replace(
        "</Types>",
        `<Default Extension="png" ContentType="image/png"/></Types>`
      );
      zip.file("[Content_Types].xml", ct);
    }
  }
  return true;
}

// ── 主生成函数 ────────────────────────────────────────────────────────────────

export async function generateContractDocx(data: ContractV4Data): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "public", "templates", "contract-v4-template.docx");
  const templateBuffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("模板文件结构异常");
  let xml = await docFile.async("string");

  const feeCurrency = data.feeCurrency === "美金" ? "美金" : "人民币";
  const isForeign = feeCurrency === "美金";
  const currSym = isForeign ? "$" : "¥";
  const commType = data.commissionType ?? "FIXED";
  const isMonthlyFee = (data.feeCycle ?? "季度预付") === "月付";
  const isMonthlyGMV = (data.gmvSettlementCycle ?? "月度") !== "季度";

  // 签名图片路径（优先合同专属，否则用全局默认）
  // 乙方签名：优先合同专属，否则用全局上传的签名文件
  const globalSig = path.join(process.cwd(), "public", "signature-party-b.png");
  const sigPath = data.partyBSignatureUrl
    ? path.join(process.cwd(), "public", data.partyBSignatureUrl.replace(/^\//, ""))
    : globalSig;
  const hasSignature = await embedSignature(zip, sigPath);
  const sigDrawingXml = hasSignature ? buildSignatureDrawingXml() : "";

  // ════════════════════════════════════════════════════════════════════════════
  // 主合同首页
  // ════════════════════════════════════════════════════════════════════════════

  // Issue 1: 不填写合同编号（保持原样）

  // 甲方基本信息（第1次出现）
  xml = replaceNth(xml, "甲方（客户）：________________________", `甲方（客户）：${fmt(data.partyAName)}`, 1);
  xml = replaceNth(xml, "统一社会信用代码：__________________", `统一社会信用代码：${fmt(data.partyACreditCode)}`, 1);
  xml = replaceNth(xml, "法定代表人：________________________", `法定代表人：${fmt(data.partyALegalRep)}`, 1);

  // 乙方固定信息
  xml = xml.replace("乙方（服务方）：____________________</w:t>",
    `乙方（服务方）：${PARTY_B.name}</w:t>`);
  xml = replaceNth(xml, "统一社会信用代码：__________________", `统一社会信用代码：${PARTY_B.creditCode}`, 1);
  xml = replaceNth(xml, "法定代表人：________________________", `法定代表人：${PARTY_B.legalRep}`, 1);

  // ════════════════════════════════════════════════════════════════════════════
  // 第一条：销售平台勾选（多选，含「其他」自定义平台）
  // ════════════════════════════════════════════════════════════════════════════
  const platformParts = (data.promoPlatform ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const hasAmazon = platformParts.some(p => /amazon|亚马逊/i.test(p));
  const hasIndie  = platformParts.some(p => p.includes("独立站"));
  const hasWalmart = platformParts.some(p => /walmart|沃尔玛/i.test(p));
  // 其他 = 不匹配三个标准平台的自定义文本
  const otherPlatform = platformParts.find(p =>
    !/amazon|亚马逊/i.test(p) && !p.includes("独立站") && !/walmart|沃尔玛/i.test(p)
  );
  {
    const paras = splitParas(xml);
    let firstClauseDone = false;
    let otherDone = false;
    const out = paras.map(p => {
      // #22：三个标准平台复选框
      if (!firstClauseDone && paraContains(p, "亚马逊平台（") && paraHasCheckbox(p)) {
        firstClauseDone = true;
        return checkBoxesByIndex(p, [hasAmazon, hasIndie, hasWalmart]);
      }
      // #23：其他平台（勾选 + 填入自定义文本）
      if (firstClauseDone && !otherDone && otherPlatform && paraContains(p, "其他：") && paraHasCheckbox(p)) {
        otherDone = true;
        let seg = checkNthBox(p, 1);
        seg = fillUnderlined(seg, escXml(otherPlatform), 1);
        return seg;
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 第二条：合作期限
  // ════════════════════════════════════════════════════════════════════════════
  xml = xml.replace(
    "合作期限自：______年____月____日起至______年____月____日止。",
    `合作期限自：${fmtDatePart(data.startDate,"year")}年${fmtDatePart(data.startDate,"month")}月${fmtDatePart(data.startDate,"day")}日起至${fmtDatePart(data.endDate,"year")}年${fmtDatePart(data.endDate,"month")}月${fmtDatePart(data.endDate,"day")}日止。`
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 第十三条：税费与收款信息
  // ════════════════════════════════════════════════════════════════════════════
  const isExcludingTax = (data.taxType ?? "不含税") !== "含税";
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      // 含税/不含税 Wingdings 复选框
      if (paraContains(p, "含税 / ") && paraHasCheckbox(p)) {
        // 顺序：checkbox=含税, checkbox=不含税
        return checkBoxesByIndex(p, [!isExcludingTax, isExcludingTax]);
      }
      // Issue 4①：税费承担方（下划线空白行）
      if (paraContains(p, "相关税费由") && paraContains(p, "承担")) {
        return fillUnderlined(p, fmt(data.taxBearer, "甲方"), 1);
      }
      // Issue 4②：乙方收款账户（精确替换）
      if (paraContains(p, "账户名称：")) return replaceBankField(p, "账户名称", PARTY_B.bankAccountName);
      if (paraContains(p, "开户银行：")) return replaceBankField(p, "开户银行", PARTY_B.bank);
      if (paraContains(p, "银行账号：")) return replaceBankField(p, "银行账号", PARTY_B.accountNo);
      if (paraContains(p, "SWIFT CODE")) return replaceBankField(p, "SWIFT CODE（如适用）", PARTY_B.swift);
      return p;
    });
    xml = joinParas(out);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 第十四条：通知与送达（重写状态机）
  // ════════════════════════════════════════════════════════════════════════════
  {
    const paras = splitParas(xml);
    let state = 0;
    // 0=before, 1=partyA_address, 2=partyA_contact, 3=partyA_email, 4=partyB_address, 5=partyB_contact, 6=done
    const out = paras.map(p => {
      if (state === 0 && paraContains(p, "甲方地址：")) {
        state = 1;
        return fillUnderlined(p, fmt(data.partyAAddress), 1);
      }
      if (state === 1 && paraContains(p, "甲方指定联系人：")) {
        state = 2;
        // 先填第2个空白（电话），再填第1个（联系人）——避免填第1个后索引位移
        let seg = fillUnderlined(p, fmt(data.partyAPhone), 2);
        seg = fillUnderlined(seg, fmt(data.partyAContact), 1);
        return seg;
      }
      if (state === 2 && paraContains(p, "电子邮箱：")) {
        state = 3;
        return fillUnderlined(p, fmt(data.partyAEmail), 1);
      }
      if (state === 3 && paraContains(p, "乙方地址：")) {
        state = 4;
        return fillUnderlined(p, PARTY_B.address, 1);
      }
      if (state === 4 && paraContains(p, "乙方指定联系人：")) {
        state = 5;
        let seg = fillUnderlined(p, PARTY_B.phone, 2);
        seg = fillUnderlined(seg, PARTY_B.contact, 1);
        return seg;
      }
      if (state === 5 && paraContains(p, "电子邮箱：")) {
        state = 6;
        return fillUnderlined(p, PARTY_B.email, 1);
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 主合同签字页（Issue 6：盖章空白不写，签字处嵌入签名图）
  // ════════════════════════════════════════════════════════════════════════════
  // 甲方：完全不填
  // 乙方盖章：不写内容（保留原来的空白）
  // 乙方法定代表人签字：嵌入签名图
  if (hasSignature) {
    // 第2次出现 法定代表人签字 = 乙方签字行（第1次=甲方，第2次=乙方）
    xml = replaceNth(xml,
      "法定代表人签字：______________",
      `法定代表人签字：</w:t></w:r><w:r>${sigDrawingXml}</w:r>`,
      2
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 项目确认书（SOW）
  // ════════════════════════════════════════════════════════════════════════════

  // Issue 7：SOW 第2行 乙方（服务方）：填入乙方公司名称
  // 主合同已经替换了第1次，这里处理第2次（SOW中）
  xml = replaceNth(xml, "乙方（服务方）：____________________</w:t>",
    `乙方（服务方）：${PARTY_B.name}</w:t>`, 1);

  // SOW 甲方（第2次出现）
  xml = replaceNth(xml, "甲方（客户）：", `甲方（客户）：${fmt(data.partyAName)}`, 2);

  // ── 1.2 目标站点（跨两段：第1段 美国站→西班牙，第2段 加拿大/澳洲/日本/其他）──
  const selectedSites = (data.targetSite ?? "").split(",").map(s => s.trim()).filter(Boolean);
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      // 第1段：含"目标站点"，5个复选框 → 美国站,德国站,英国站,法国,西班牙
      if (paraContains(p, "目标站点") && paraHasCheckbox(p)) {
        const sites = ["美国站","德国站","英国站","法国","西班牙"];
        return checkBoxesByIndex(p, sites.map(s => selectedSites.includes(s)));
      }
      // 第2段：含"加拿大"和"其他"，4个复选框 → 加拿大,澳洲,日本,其他(跳过)
      if (paraContains(p, "加拿大") && paraContains(p, "澳洲") && paraHasCheckbox(p)) {
        const sites = ["加拿大","澳洲","日本","__其他__"];
        return checkBoxesByIndex(p, sites.map(s => selectedSites.includes(s)));
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── 4.1 月度服务费 ────────────────────────────────────────────────────────
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      // 货币复选框 + 金额
      if (paraContains(p, "甲方应向乙方支付：") && paraContains(p, "元/月作为月度服务费")) {
        let seg = checkBoxesByIndex(p, [!isForeign, isForeign]); // 第1个=人民币, 第2个=美金
        const amtStr = data.feeAmount ? `${data.feeAmount} ` : "________ ";
        seg = seg.replace("________ 元/月作为月度服务费", `${amtStr}元/月作为月度服务费`);
        return seg;
      }
      // 支付周期复选框
      if (paraContains(p, "服务费按 ") && paraContains(p, "预付")) {
        return checkBoxesByIndex(p, [isMonthlyFee, !isMonthlyFee]); // 月付, 季度预付
      }
      // Issue 8：首期服务费 [  ] → 填入金额
      if (paraContains(p, "首期月度服务费用为")) {
        const feeVal = data.firstPeriodFee != null
          ? `${currSym}${data.firstPeriodFee.toLocaleString()}`
          : "";
        if (feeVal) {
          // 结构：首期月度服务费用为 | [ | spaces | ]元，
          // 替换 "[" run + spaces run，然后删除 "]"
          let seg = p.replace('<w:t>[</w:t>', `<w:t>${feeVal}</w:t>`);
          // 移除 [ 和 ] 之间的空格 run（匹配 spaces inside brackets）
          seg = seg.replace(/<w:r>[^<]*(?:<(?!\/w:r>)[^<]*>)*?<w:t[^>]*>[ ]+<\/w:t><\/w:r>(<w:r>[^<]*(?:<(?!\/w:r>)[^<]*>)*?<w:t[^>]*>])/, (m, after) => after);
          return seg;
        }
        return p;
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── 4.2 GMV 佣金（删除未选类型，勾选已选类型）────────────────────────────────
  const GMV_MARKERS = [
    { key: "FIXED",     marker: "固定点数联盟归因" },
    { key: "THRESHOLD", marker: "GMV门槛佣金机制" },
    { key: "TIERED",    marker: "阶梯式联盟归因GMV佣金机制" },
    { key: "EXCESS",    marker: "超额联盟归因GMV佣金机制" },
    { key: "OTHER",     marker: "其他方式" },
  ];
  {
    const paras = splitParas(xml);
    let currentType: string | null = null;
    let inGmv = false;
    const out = paras.map(p => {
      if (paraContains(p, "佣金（勾选适用的结算方式）")) { inGmv = true; return { p, keep: true }; }
      if (inGmv && paraContains(p, "4.3 联盟归因GMV结算周期")) { inGmv = false; return { p, keep: true }; }
      if (inGmv) {
        const matched = GMV_MARKERS.find(t => paraContains(p, t.marker) && paraHasCheckbox(p));
        if (matched) {
          currentType = matched.key;
          const sel = matched.key === commType;
          let seg = sel ? checkNthBox(p, 1) : p;
          // 填写 FIXED 比例
          if (sel && commType === "FIXED" && data.commissionRate) {
            seg = seg.replace(/GMV的 _____/, `GMV的 ${data.commissionRate}`);
          }
          return { p: seg, keep: sel };
        }
        if (currentType) {
          const sel = currentType === commType;
          let seg = p;
          if (sel) {
            if (commType === "FIXED" && data.commissionRate) seg = seg.replace(/GMV的 _____\s*%/, `GMV的 ${data.commissionRate}`);
            if (commType === "THRESHOLD") {
              if (data.thresholdAmount) seg = seg.replace(/达到 _____/, `达到 ${data.thresholdAmount}`);
              if (data.commissionRate) seg = seg.replace(/GMV的 ______\s*%/, `GMV的 ${data.commissionRate}`);
            }
            if (commType === "EXCESS") {
              if (data.excessBaseMonths) seg = seg.replace(/最近 _____ 个月/, `最近 ${data.excessBaseMonths} 个月`);
              if (data.excessCommissionRate) seg = seg.replace(/___ %/, data.excessCommissionRate);
            }
          }
          return { p: seg, keep: sel };
        }
      }
      return { p, keep: true };
    });
    xml = joinParas(out.filter(x => x.keep).map(x => x.p));
  }

  // ── 4.3 GMV结算周期 ──────────────────────────────────────────────────────────
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      if ((paraContains(p, "联盟归因GMV佣金按月") || paraContains(p, "按月 / 季度结算")) && paraHasCheckbox(p)) {
        return checkBoxesByIndex(p, [isMonthlyGMV, !isMonthlyGMV]);
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── 合作渠道（Issue 9：渠道用字面 □ 字符，替换为 ✓）──────────────────────────
  let channels: string[] = [];
  try { channels = JSON.parse(data.coopChannels ?? "[]"); } catch { channels = []; }
  // 顺序与模板一致；label 用于精确匹配复选框段落（短行，含字面 □）
  const CHANNEL_MAP: Record<string, string> = {
    "ACC":              "Amazon Creator Connections（ACC）",
    "Attribution":      "Amazon Attribution（归因链接）",
    "Associates":       "Amazon Affiliate Associates",
    "AmazonLive":       "Amazon Live",
    "Levanta":          "Levanta",
    "Impact":           "Impact",
    "Wayward":          "Wayward",
    "ArcherAffiliates": "Archer Affiliates",
    "PrivateSocial":    "私域/社媒/流量渠道",
  };
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      const t = paraText(p);
      // 仅处理「以 □ 开头的复选框行」，排除正文条款里提到渠道名的段落
      if (!t.includes("□")) return p;
      for (const [key, label] of Object.entries(CHANNEL_MAP)) {
        if (t.includes(label) && channels.includes(key)) {
          // 该行只有一个字面 □，直接替换为对号 ✓
          return p.replace("□", "✓");
        }
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── SOW 签字页（Issue 10：盖章空白，签字处嵌入签名图）───────────────────────
  if (hasSignature) {
    // 第2次 授权代表签字 = 乙方（第1次=甲方）
    xml = replaceNth(xml,
      "授权代表（签字）： _______________",
      `授权代表（签字）：</w:t></w:r><w:r>${sigDrawingXml}</w:r>`,
      2
    );
  }

  zip.file("word/document.xml", xml);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(buf);
}
