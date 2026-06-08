/**
 * 合同 V4 DOCX 生成器（完整修复版）
 * 精确处理 Wingdings 2 复选框、下划线空白行、GMV 类型删除
 */
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";

// ── 乙方固定信息 ─────────────────────────────────────────────────────────────
export const PARTY_B = {
  name: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED",
  creditCode: "80456388",
  legalRep: "温志倩",
  address: "RM 29-33 5/F BEVERLEY COMMCTR 87-105 CHATHAM RD TSIMSHA TSUI HONG KONG",
  contact: "胡铭",
  phone: "18721724179",
  email: "ledo.h@thraiveagency.com",
  bankAccount: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO LIMITED",
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
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fmt(v: unknown, fallback = ""): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function fmtDatePart(d: Date | null | undefined, part: "year" | "month" | "day"): string {
  if (!d) return part === "year" ? "______" : "____";
  const date = new Date(d);
  if (part === "year") return String(date.getFullYear());
  if (part === "month") return String(date.getMonth() + 1).padStart(2, "0");
  return String(date.getDate()).padStart(2, "0");
}

/** 在 XML 段落内将第一个 Wingdings2 □(00A3) 替换为 ☑(00A4) */
function checkBoxInSegment(segment: string): string {
  return segment.replace('w:char="00A3"', 'w:char="00A4"');
}

/** 在 XML 段落内填充第 nth 个下划线空白行 */
function fillUnderlinedInSegment(segment: string, value: string, nth = 1): string {
  let count = 0;
  return segment.replace(
    /(<w:u w:val="single"\/>(?:[^<]|<(?!\/w:rPr>))*?<\/w:rPr>)<w:t[^>]*>[ ]+([ ]*)<\/w:t>/g,
    (match, prefix, extra) => {
      count++;
      if (count === nth) {
        return `${prefix}<w:t xml:space="preserve">${value}</w:t>`;
      }
      return match;
    }
  );
}

/** 简单文本替换（第 nth 次出现） */
function replaceNth(xml: string, find: string, replace: string, n: number): string {
  let count = 0;
  return xml.replace(new RegExp(escapeRegex(find), "g"), (match) => {
    count++;
    return count === n ? replace : match;
  });
}

/** 将 XML 按段落拆分 */
function splitParas(xml: string): string[] {
  return xml.split("</w:p>");
}

function joinParas(paras: string[]): string {
  return paras.join("</w:p>");
}

/** 检查 XML 文本内容是否包含某关键词 */
function paraContains(para: string, keyword: string): boolean {
  // 提取 <w:t> 内容
  const texts = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");
  return texts.includes(keyword);
}

/** 检查段落是否包含 Wingdings 2 复选框 */
function paraHasCheckbox(para: string): boolean {
  return para.includes('w:font="Wingdings 2"');
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

  // ════════════════════════════════════════════════════════════════════════════
  // 一、主合同首页
  // ════════════════════════════════════════════════════════════════════════════

  // 1. 合同编号（直接追加在同一行）
  xml = xml.replace("合同编号：</w:t>", `合同编号：${data.contractNo}</w:t>`);

  // 2. 甲方公司名（第1次）+ 社会信用代码（第1次）+ 法代（第1次）
  xml = replaceNth(xml, "甲方（客户）：________________________", `甲方（客户）：${fmt(data.partyAName)}`, 1);
  xml = replaceNth(xml, "统一社会信用代码：__________________", `统一社会信用代码：${fmt(data.partyACreditCode)}`, 1);
  xml = replaceNth(xml, "法定代表人：________________________", `法定代表人：${fmt(data.partyALegalRep)}`, 1);

  // 3. 乙方信息（固定预填）
  xml = xml.replace("乙方（服务方）：____________________</w:t>",
    `乙方（服务方）：${PARTY_B.name}</w:t>`);
  xml = replaceNth(xml, "统一社会信用代码：__________________", `统一社会信用代码：${PARTY_B.creditCode}`, 1);
  xml = replaceNth(xml, "法定代表人：________________________", `法定代表人：${PARTY_B.legalRep}`, 1);

  // ════════════════════════════════════════════════════════════════════════════
  // 二、第一条 – 销售平台勾选（Wingdings 复选框）
  // ════════════════════════════════════════════════════════════════════════════
  const promoLower = (data.promoPlatform ?? "").toLowerCase();
  const checkAmazon = promoLower.includes("amazon") || promoLower.includes("亚马逊");
  const checkStore = promoLower.includes("独立站");
  const checkWalmart = promoLower.includes("walmart") || promoLower.includes("沃尔玛");

  // 找包含三个平台选项的段落，逐一处理
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      if (paraContains(p, "亚马逊平台（") && paraHasCheckbox(p)) {
        // 段落里有三个复选框：Amazon、独立站、Walmart、其他
        // 逐个处理
        let seg = p;
        // 处理方式：分析每个checkbox对应的标签
        const checkboxPositions: number[] = [];
        let searchFrom = 0;
        while (true) {
          const idx = seg.indexOf('w:char="00A3"', searchFrom);
          if (idx === -1) break;
          checkboxPositions.push(idx);
          searchFrom = idx + 1;
        }
        // 四个选项顺序：亚马逊、独立站、沃尔玛、其他
        const selected = [checkAmazon, checkStore, checkWalmart, false];
        checkboxPositions.slice(0, 4).forEach((pos, i) => {
          if (selected[i]) {
            // 替换该位置的复选框
            seg = seg.substring(0, pos) + seg.substring(pos).replace('w:char="00A3"', 'w:char="00A4"');
          }
        });
        return seg;
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 三、第二条 – 合作期限
  // ════════════════════════════════════════════════════════════════════════════
  const startY = fmtDatePart(data.startDate, "year");
  const startM = fmtDatePart(data.startDate, "month");
  const startD = fmtDatePart(data.startDate, "day");
  const endY   = fmtDatePart(data.endDate,   "year");
  const endM   = fmtDatePart(data.endDate,   "month");
  const endD   = fmtDatePart(data.endDate,   "day");
  xml = xml.replace(
    "合作期限自：______年____月____日起至______年____月____日止。",
    `合作期限自：${startY}年${startM}月${startD}日起至${endY}年${endM}月${endD}日止。`
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 四、第十三条 – 税费（含税/不含税 Wingdings）+ 承担方 + 乙方收款账户
  // ════════════════════════════════════════════════════════════════════════════
  const isExcludingTax = (data.taxType ?? "不含税") === "不含税";
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      if (paraContains(p, "含税 / ") && paraHasCheckbox(p)) {
        const seg = p;
        // 两个checkbox: 第一个=含税, 第二个=不含税
        // 找到所有checkbox位置
        const positions: number[] = [];
        let searchFrom = 0;
        while (true) {
          const idx = seg.indexOf('w:char="00A3"', searchFrom);
          if (idx === -1) break;
          positions.push(idx);
          searchFrom = idx + 1;
        }
        let result = seg;
        if (positions.length >= 2) {
          // 含税=positions[0], 不含税=positions[1]
          const checkIdx = isExcludingTax ? 1 : 0;
          const pos = positions[checkIdx];
          result = result.substring(0, pos) + result.substring(pos).replace('w:char="00A3"', 'w:char="00A4"');
        }
        return result;
      }
      // 税费承担方
      if (paraContains(p, "相关税费由") && paraContains(p, "承担")) {
        return p.replace(
          /相关税费由([_\s]*)承担/,
          `相关税费由${fmt(data.taxBearer, "甲方")}承担`
        );
      }
      return p;
    });
    xml = joinParas(out);
  }

  // 乙方收款账户（下划线行替换）
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      if (paraContains(p, "账户名称：")) {
        // 替换两个下划线空白（"账号名称  /  账号名称"格式）
        return fillUnderlinedInSegment(
          p.replace(/\/[\s<>w:"a-zA-Z=0-9]+?<\/w:t>/,
            `</w:t></w:r><w:r><w:rPr><w:rFonts w:hint="default" w:asciiTheme="minorEastAsia"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${PARTY_B.bankAccount}</w:t></w:r><w:r><w:rPr/>`),
          PARTY_B.bankAccount, 1
        );
      }
      if (paraContains(p, "开户银行：")) return fillUnderlinedInSegment(p, PARTY_B.bank, 1);
      if (paraContains(p, "银行账号：")) return fillUnderlinedInSegment(p, PARTY_B.accountNo, 1);
      if (paraContains(p, "SWIFT CODE")) return fillUnderlinedInSegment(p, PARTY_B.swift, 1);
      return p;
    });
    xml = joinParas(out);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 五、第十四条 – 通知与送达（甲方+乙方地址/联系人/电话/邮箱）
  // ════════════════════════════════════════════════════════════════════════════
  {
    const paras = splitParas(xml);
    let partyADone = false;
    let partyBDone = false;
    const out = paras.map(p => {
      // 甲方地址
      if (!partyADone && paraContains(p, "甲方地址：")) {
        partyADone = true;
        return fillUnderlinedInSegment(p, fmt(data.partyAAddress), 1);
      }
      // 乙方地址（第一次出现乙方地址=在甲方done之后）
      if (partyADone && !partyBDone && paraContains(p, "乙方地址：")) {
        partyBDone = true;
        return fillUnderlinedInSegment(p, PARTY_B.address, 1);
      }
      // 甲方指定联系人+电话（同一行，两个下划线空白）
      if (!partyADone && paraContains(p, "甲方指定联系人：") && paraContains(p, "电话：")) {
        let seg = fillUnderlinedInSegment(p, fmt(data.partyAContact), 1);
        seg = fillUnderlinedInSegment(seg, fmt(data.partyAPhone), 2);
        return seg;
      }
      // 乙方指定联系人+电话
      if (partyADone && !partyBDone && paraContains(p, "乙方指定联系人：") && paraContains(p, "电话：")) {
        let seg = fillUnderlinedInSegment(p, PARTY_B.contact, 1);
        seg = fillUnderlinedInSegment(seg, PARTY_B.phone, 2);
        return seg;
      }
      // 甲方电子邮箱
      if (!partyADone && paraContains(p, "电子邮箱：") && !paraContains(p, "乙方")) {
        return fillUnderlinedInSegment(p, fmt(data.partyAEmail), 1);
      }
      // 乙方电子邮箱
      if (partyADone && !partyBDone && paraContains(p, "电子邮箱：")) {
        return fillUnderlinedInSegment(p, PARTY_B.email, 1);
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 六、主合同签字页（甲方不填，乙方只填法代签字）
  // ════════════════════════════════════════════════════════════════════════════
  // 删除甲方盖章/法代签字/日期的占位符（保留原样，不填写）
  // 乙方盖章预填
  xml = replaceNth(xml, "乙方（盖章）：________________", `乙方（盖章）：${PARTY_B.name}`, 1);
  // 乙方法代签字（第2次出现法定代表人签字）→ 乙方签名
  xml = replaceNth(xml, "法定代表人签字：______________", `法定代表人签字：${PARTY_B.legalRep}`, 2);

  // ════════════════════════════════════════════════════════════════════════════
  // 七、项目确认书（SOW）
  // ════════════════════════════════════════════════════════════════════════════

  // 甲方（客户）第2次出现
  xml = replaceNth(xml, "甲方（客户）：", `甲方（客户）：${fmt(data.partyAName)}`, 2);
  // 乙方（服务方）第2次（已在前面处理第1次，SOW是第2次）
  xml = replaceNth(xml, "乙方（服务方）：____________________</w:t>",
    `乙方（服务方）：${PARTY_B.name}</w:t>`, 1);

  // ── 1.2 目标站点（Wingdings）───────────────────────────────────────────────
  const selectedSites = (data.targetSite ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const SOW_SITES = [
    { key: "美国站", label: "美国站" },
    { key: "德国站", label: "德国站" },
    { key: "英国站", label: "英国站" },
    { key: "法国",   label: "法国" },
    { key: "西班牙", label: " 西班牙" },
    { key: "加拿大", label: "加拿大" },
    { key: "澳洲",   label: "  澳洲" },
    { key: "日本",   label: " 日本" },
  ];
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      if (paraContains(p, "目标站点")) {
        // 找到 1.2 目标站点这一行，里面每个站点前面有一个Wingdings复选框
        // 位置对应 SOW_SITES 顺序
        const positions: number[] = [];
        let searchFrom = 0;
        while (true) {
          const idx = p.indexOf('w:char="00A3"', searchFrom);
          if (idx === -1) break;
          positions.push(idx);
          searchFrom = idx + 1;
        }
        let seg = p;
        positions.forEach((pos, i) => {
          if (i < SOW_SITES.length && selectedSites.includes(SOW_SITES[i].key)) {
            seg = seg.substring(0, pos) + seg.substring(pos).replace('w:char="00A3"', 'w:char="00A4"');
          }
        });
        return seg;
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── 4.1 月度服务费 ───────────────────────────────────────────────────────────
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      // 月度服务费金额行：checkbox 人民币 / checkbox 美金 ______ 元/月
      if (paraContains(p, "甲方应向乙方支付：") && paraContains(p, "元/月作为月度服务费")) {
        // 两个复选框：第一个=人民币，第二个=美金
        const positions: number[] = [];
        let searchFrom = 0;
        while (true) {
          const idx = p.indexOf('w:char="00A3"', searchFrom);
          if (idx === -1) break;
          positions.push(idx);
          searchFrom = idx + 1;
        }
        let seg = p;
        if (positions.length >= 2) {
          const checkIdx = isForeign ? 1 : 0;
          const pos = positions[checkIdx];
          seg = seg.substring(0, pos) + seg.substring(pos).replace('w:char="00A3"', 'w:char="00A4"');
        }
        // 填写金额：替换 ________ 为实际金额
        const amtDisplay = data.feeAmount ? `${data.feeAmount} ` : "________ ";
        seg = seg.replace("________ 元/月作为月度服务费", `${amtDisplay}元/月作为月度服务费`);
        return seg;
      }
      // 服务费按 月 / 季度预付（payment cycle）
      if (paraContains(p, "服务费按 ") && paraContains(p, "预付")) {
        const isMonthly = (data.feeCycle ?? "季度预付") === "月付";
        const positions: number[] = [];
        let searchFrom = 0;
        while (true) {
          const idx = p.indexOf('w:char="00A3"', searchFrom);
          if (idx === -1) break;
          positions.push(idx);
          searchFrom = idx + 1;
        }
        let seg = p;
        if (positions.length >= 2) {
          const checkIdx = isMonthly ? 0 : 1;
          const pos = positions[checkIdx];
          seg = seg.substring(0, pos) + seg.substring(pos).replace('w:char="00A3"', 'w:char="00A4"');
        }
        return seg;
      }
      // 首期月度服务费
      if (paraContains(p, "首期月度服务费用为")) {
        const firstFee = data.firstPeriodFee != null
          ? `${currSym}${data.firstPeriodFee}`
          : (() => {
              if (data.feeAmount) {
                const amount = parseFloat(data.feeAmount.replace(/,/g, ""));
                if (!isNaN(amount)) {
                  const multiplier = (data.feeCycle ?? "季度预付") === "月付" ? 1 : 3;
                  return `${currSym}${(amount * multiplier).toLocaleString()}`;
                }
              }
              return "[  ]";
            })();
        return p.replace(/首期月度服务费用为\[[\s]*\]元/, `首期月度服务费用为${firstFee}元`);
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── 4.2 GMV 佣金（删除未选择的类型，勾选已选类型）────────────────────────────
  const commType = data.commissionType ?? "FIXED";
  const GMV_TYPES = [
    { key: "FIXED",     marker: "固定点数联盟归因" },
    { key: "THRESHOLD", marker: "GMV门槛佣金机制" },
    { key: "TIERED",    marker: "阶梯式联盟归因GMV佣金机制" },
    { key: "EXCESS",    marker: "超额联盟归因GMV佣金机制" },
    { key: "OTHER",     marker: "其他方式" },
  ];
  {
    const paras = splitParas(xml);
    // 标记每个段落属于哪个GMV类型
    let currentType: string | null = null;
    let inGMVSection = false;
    const marked = paras.map(p => {
      if (paraContains(p, "勾选适用的结算方式")) {
        inGMVSection = true;
        return { p, type: "HEADER", keep: true };
      }
      if (inGMVSection && paraContains(p, "4.3 联盟归因GMV结算周期")) {
        inGMVSection = false;
        return { p, type: "END", keep: true };
      }
      if (inGMVSection) {
        // 检查是否是类型标签段落
        const matchedType = GMV_TYPES.find(t => paraContains(p, t.marker));
        if (matchedType && paraHasCheckbox(p)) {
          currentType = matchedType.key;
          const isSelected = matchedType.key === commType;
          let seg = p;
          if (isSelected) {
            seg = checkBoxInSegment(seg);
            // 填写佣金比例
            if (commType === "FIXED" && data.commissionRate) {
              seg = seg.replace(/GMV的 _____/, `GMV的 ${data.commissionRate}`);
            }
          }
          return { p: seg, type: currentType, keep: isSelected };
        }
        // 填充段落（属于当前GMV类型）
        if (currentType) {
          const isSelected = currentType === commType;
          let seg = p;
          if (isSelected) {
            if (commType === "FIXED" && data.commissionRate) {
              seg = seg.replace(/GMV的 _____\s*%/, `GMV的 ${data.commissionRate}`);
            }
            if (commType === "THRESHOLD") {
              if (data.thresholdAmount) {
                seg = seg.replace(/达到 _____/, `达到 ${data.thresholdAmount}`);
              }
              if (data.commissionRate) {
                seg = seg.replace(/GMV的 ______\s*%/, `GMV的 ${data.commissionRate}`);
              }
            }
            if (commType === "EXCESS") {
              if (data.excessBaseMonths) {
                seg = seg.replace(/最近 _____ 个月/, `最近 ${data.excessBaseMonths} 个月`);
              }
              if (data.excessCommissionRate) {
                seg = seg.replace(/___ %/, `${data.excessCommissionRate}`);
              }
            }
          }
          return { p: seg, type: currentType, keep: isSelected };
        }
      }
      return { p, type: null, keep: true };
    });

    const filtered = marked.filter(m => m.keep);
    xml = joinParas(filtered.map(m => m.p));
  }

  // ── 4.3 GMV结算周期（Wingdings）────────────────────────────────────────────
  {
    const paras = splitParas(xml);
    const gmvCycle = data.gmvSettlementCycle ?? "月度";
    const isMonthlyGMV = gmvCycle === "月度" || gmvCycle === "月";
    const out = paras.map(p => {
      if (paraContains(p, "联盟归因GMV佣金按月 / 季度结算") || paraContains(p, "联盟归因GMV佣金按月") ) {
        const positions: number[] = [];
        let searchFrom = 0;
        while (true) {
          const idx = p.indexOf('w:char="00A3"', searchFrom);
          if (idx === -1) break;
          positions.push(idx);
          searchFrom = idx + 1;
        }
        let seg = p;
        if (positions.length >= 2) {
          const checkIdx = isMonthlyGMV ? 0 : 1;
          const pos = positions[checkIdx];
          seg = seg.substring(0, pos) + seg.substring(pos).replace('w:char="00A3"', 'w:char="00A4"');
        } else if (positions.length === 1 && isMonthlyGMV) {
          seg = checkBoxInSegment(seg);
        }
        return seg;
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── 5. 合作渠道（Wingdings）──────────────────────────────────────────────────
  let channels: string[] = [];
  try { channels = JSON.parse(data.coopChannels ?? "[]"); } catch { channels = []; }

  const CHANNEL_LABELS: Record<string, string> = {
    "ACC":             "Amazon Creator Connections（ACC）",
    "Attribution":    "Amazon Attribution（归因链接）",
    "Associates":     "Amazon Affiliate Associates",
    "AmazonLive":     "Amazon Live",
    "Levanta":        "Levanta",
    "Impact":         "Impact",
    "Wayward":        "Wayward",
    "ArcherAffiliates": "Archer Affiliates",
    "PrivateSocial":  "私域/社媒/流量渠道",
  };
  {
    const paras = splitParas(xml);
    const out = paras.map(p => {
      for (const [key, label] of Object.entries(CHANNEL_LABELS)) {
        if (paraContains(p, label) && paraHasCheckbox(p) && channels.includes(key)) {
          return checkBoxInSegment(p);
        }
      }
      return p;
    });
    xml = joinParas(out);
  }

  // ── SOW 签字页（乙方预填，甲方不填）───────────────────────────────────────────
  xml = replaceNth(xml, "乙方（盖章）： __________________", `乙方（盖章）：${PARTY_B.name}`, 1);
  xml = replaceNth(xml, "授权代表（签字）： _______________", `授权代表（签字）：${PARTY_B.legalRep}`, 2);

  // ── 产品清单（结构化数据，写入 1.4 表格区域）─────────────────────────────────
  // 表格替换在此简化处理：在"推广商品清单以本项目确认书"前插入产品列表文本
  // (完整表格操作需要复杂的XML row cloning，当前版本保留表格占位符供用户手动填写)

  // ════════════════════════════════════════════════════════════════════════════
  // 写回 XML
  // ════════════════════════════════════════════════════════════════════════════
  zip.file("word/document.xml", xml);

  const outputBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(outputBuffer);
}
