/**
 * 合同 V4 DOCX 生成器
 * 读取原始合同模板（DOCX），用甲方数据替换空白占位符，嵌入乙方信息和签名
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
  // 甲方信息
  partyAName: string;
  partyACreditCode?: string | null;
  partyALegalRep?: string | null;
  partyAAddress?: string | null;
  partyAContact?: string | null;
  partyAPhone?: string | null;
  partyAEmail?: string | null;
  // 合作信息
  promoPlatform?: string | null;
  targetSite?: string | null;        // comma-separated
  startDate?: Date | null;
  endDate?: Date | null;
  taxType?: string | null;
  taxBearer?: string | null;
  // 费用
  feeAmount?: string | null;
  feeCurrency?: string | null;
  firstPeriodFee?: number | null;
  feeCycle?: string | null;
  // GMV 佣金
  commissionType?: string | null;
  commissionRate?: string | null;
  thresholdAmount?: string | null;
  thresholdCurrency?: string | null;
  tieredRules?: string | null;
  excessBaseMonths?: string | null;
  excessCommissionRate?: string | null;
  gmvSettlementCycle?: string | null;
  // 推广信息
  productList?: string | null;   // JSON: [{name,asin,price,trackLink}]
  coopChannels?: string | null;  // JSON: string[]
}

function fmt(v: unknown, fallback = "——"): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "______年____月____日";
  const date = new Date(d);
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
}

function fmtDateShort(d: Date | null | undefined, part: "year" | "month" | "day"): string {
  if (!d) return part === "year" ? "______" : "____";
  const date = new Date(d);
  if (part === "year") return String(date.getFullYear());
  if (part === "month") return String(date.getMonth() + 1).padStart(2, "0");
  return String(date.getDate()).padStart(2, "0");
}

/** 将 XML 中的文本 token 替换（精确匹配） */
function replaceInXml(xml: string, find: string, replace: string): string {
  return xml.split(find).join(replace);
}

/** 在XML中替换第 occurrence 次（1-indexed）出现的 find */
function replaceNth(xml: string, find: string, replace: string, n: number): string {
  let count = 0;
  return xml.replace(new RegExp(escapeRegex(find), "g"), (match) => {
    count++;
    return count === n ? replace : match;
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 生成合同 DOCX Buffer
 */
export async function generateContractDocx(data: ContractV4Data): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "public", "templates", "contract-v4-template.docx");
  const templateBuffer = fs.readFileSync(templatePath);

  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("模板文件结构异常");

  let xml = await docFile.async("string");

  const currency = data.feeCurrency === "美金" ? "美金" : "人民币";
  const currencySymbol = data.feeCurrency === "美金" ? "$" : "¥";

  // ── 主合同 首页 ──────────────────────────────────────────────────────────────
  // 合同编号
  xml = replaceInXml(xml, "合同编号：", `合同编号：${data.contractNo}`);

  // 甲方（第1次出现）→ 甲方
  xml = replaceNth(xml, "甲方（客户）：________________________", `甲方（客户）：${fmt(data.partyAName)}`, 1);
  // 统一社会信用代码（第1次）→ 甲方
  xml = replaceNth(xml, "统一社会信用代码：__________________", `统一社会信用代码：${fmt(data.partyACreditCode)}`, 1);
  // 法定代表人（第1次）→ 甲方
  xml = replaceNth(xml, "法定代表人：________________________", `法定代表人：${fmt(data.partyALegalRep)}`, 1);

  // 乙方（固定预填）
  xml = replaceInXml(xml, "乙方（服务方）：____________________", `乙方（服务方）：${PARTY_B.name}`);
  // 统一社会信用代码（第2次）→ 乙方
  xml = replaceNth(xml, "统一社会信用代码：__________________", `统一社会信用代码：${PARTY_B.creditCode}`, 1);
  // 法定代表人（第2次）→ 乙方
  xml = replaceNth(xml, "法定代表人：________________________", `法定代表人：${PARTY_B.legalRep}`, 1);

  // ── 第二条 合作期限 ──────────────────────────────────────────────────────────
  const startY = fmtDateShort(data.startDate, "year");
  const startM = fmtDateShort(data.startDate, "month");
  const startD = fmtDateShort(data.startDate, "day");
  const endY   = fmtDateShort(data.endDate,   "year");
  const endM   = fmtDateShort(data.endDate,   "month");
  const endD   = fmtDateShort(data.endDate,   "day");
  xml = replaceInXml(
    xml,
    "合作期限自：______年____月____日起至______年____月____日止。",
    `合作期限自：${startY}年${startM}月${startD}日起至${endY}年${endM}月${endD}日止。`
  );

  // ── 第十三条 税费 ────────────────────────────────────────────────────────────
  const taxType = data.taxType ?? "不含税";
  const taxBearer = data.taxBearer ?? "甲方";
  xml = replaceInXml(xml, "【含税 / 不含税】", taxType);
  // 税费承担方
  xml = replaceInXml(xml, "相关税费由           承担", `相关税费由${taxBearer}承担`);

  // ── 第十三条 乙方收款账户 ────────────────────────────────────────────────────
  xml = replaceInXml(xml, "账户名称：          /            ", `账户名称：${PARTY_B.bankAccount}`);
  xml = replaceInXml(xml, "开户银行：          /            ", `开户银行：${PARTY_B.bank}`);
  xml = replaceInXml(xml, "银行账号：          /            ", `银行账号：${PARTY_B.accountNo}`);
  xml = replaceInXml(xml, "SWIFT CODE（如适用）：         /             ", `SWIFT CODE：${PARTY_B.swift}`);

  // ── 第十四条 甲方通知信息 ────────────────────────────────────────────────────
  // 注意：甲方/乙方联系信息都在第十四条
  // 由于XML中甲方和乙方的地址/联系人字段结构类似，用首次出现替换甲方，二次替换乙方
  xml = replaceNth(xml, "甲方地址：", `甲方地址：${fmt(data.partyAAddress, "")}`, 1);
  xml = replaceNth(xml, "甲方指定联系人：", `甲方指定联系人：${fmt(data.partyAContact, "")}`, 1);
  // 电话/邮箱在第十四条出现两次（甲方+乙方）
  xml = replaceNth(xml, "电话：                ", `电话：${fmt(data.partyAPhone, "")}`, 1);
  xml = replaceNth(xml, "电子邮箱：                        ", `电子邮箱：${fmt(data.partyAEmail, "")}`, 1);
  // 乙方联系信息
  xml = replaceNth(xml, "乙方地址：                                    ", `乙方地址：${PARTY_B.address}`, 1);
  xml = replaceNth(xml, "乙方指定联系人：                 ", `乙方指定联系人：${PARTY_B.contact}`, 1);
  xml = replaceNth(xml, "电话：                ", `电话：${PARTY_B.phone}`, 1);
  xml = replaceNth(xml, "电子邮箱：                        ", `电子邮箱：${PARTY_B.email}`, 1);

  // ── 合同签字页（甲方/乙方）───────────────────────────────────────────────────
  // 甲方盖章/签字/日期
  xml = replaceNth(xml, "甲方（盖章）：________________", `甲方（盖章）：${fmt(data.partyAName)}`, 1);
  xml = replaceNth(xml, "法定代表人签字：______________", `法定代表人签字：${fmt(data.partyALegalRep)}`, 1);
  // 乙方盖章/签字/日期（固定）
  xml = replaceNth(xml, "乙方（盖章）：________________", `乙方（盖章）：${PARTY_B.name}`, 1);
  xml = replaceNth(xml, "法定代表人签字：______________", `法定代表人签字：${PARTY_B.legalRep}`, 1);

  // ── 项目确认书 ──────────────────────────────────────────────────────────────
  // 甲方/乙方行
  xml = replaceNth(xml, "甲方（客户）：", `甲方（客户）：${fmt(data.partyAName)}`, 2);

  // 目标站点（保留原始选项，用 ☑ 替换勾选的）
  const selectedSites = (data.targetSite ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const siteMap: Record<string, string> = {
    "美国站": "美国站",
    "德国站": "德国站",
    "英国站": "英国站",
    "法国": "法国",
    "西班牙": "西班牙",
    "加拿大": "加拿大",
    "澳洲": "澳洲",
    "日本": "日本",
  };
  for (const [site] of Object.entries(siteMap)) {
    if (selectedSites.includes(site)) {
      xml = replaceInXml(xml, `${site}；`, `☑${site}；`);
    }
  }

  // 费用：月度服务费
  const feeDisplay = data.feeAmount
    ? `${currency} ${data.feeAmount} 元/月`
    : `${currency} ________ 元/月`;
  xml = replaceInXml(xml, "人民币 / 美金 ________ 元/月作为月度服务费。", `${feeDisplay}作为月度服务费。`);

  // 固费支付周期
  const feeCycle = data.feeCycle ?? "季度预付";
  xml = replaceInXml(xml, "服务费按 月 / 季度预付。", `服务费按${feeCycle}。`);

  // 首期服务费
  if (data.firstPeriodFee != null) {
    xml = replaceInXml(
      xml,
      "首期月度服务费用为[  ]元",
      `首期月度服务费用为${currencySymbol}${data.firstPeriodFee}元`
    );
  }

  // GMV 佣金 - 根据 commissionType 只保留对应内容（此处简化为填值）
  const gmvRate = data.commissionRate ?? "_____";
  xml = replaceInXml(
    xml,
    "甲方向乙方支付联盟归因GMV的 _____ % 作为服务佣金。",
    `甲方向乙方支付联盟归因GMV的 ${gmvRate} 作为服务佣金。`
  );

  // GMV 结算周期
  const gmvCycle = data.gmvSettlementCycle ?? "月";
  xml = replaceInXml(xml, "联盟归因GMV佣金按月 / 季度结算。", `联盟归因GMV佣金按${gmvCycle}结算。`);

  // ── 合作渠道勾选 ────────────────────────────────────────────────────────────
  let channels: string[] = [];
  try {
    channels = JSON.parse(data.coopChannels ?? "[]");
  } catch { channels = []; }

  const channelMap: Record<string, string> = {
    "ACC": "Amazon Creator Connections（ACC）",
    "Attribution": "Amazon Attribution（归因链接）",
    "Associates": "Amazon Affiliate Associates（亚马逊官方Affiliate联盟）",
    "AmazonLive": "Amazon Live",
    "Levanta": "Levanta",
    "Impact": "Impact",
    "Wayward": "Wayward",
    "ArcherAffiliates": "Archer Affiliates",
    "PrivateSocial": "私域/社媒/流量渠道（包括但不限于Facebook Group；Telegram；Discord；Email Marketing；社群推广）",
  };

  for (const [key, label] of Object.entries(channelMap)) {
    const checked = channels.includes(key);
    const checkbox = checked ? "☑" : "□";
    // Replace □ before the label with ☑ if selected
    const oldPattern = `□ ${label}`;
    if (xml.includes(oldPattern)) {
      xml = replaceInXml(xml, oldPattern, `${checkbox} ${label}`);
    }
  }

  // ── 项目确认书签字页 ─────────────────────────────────────────────────────────
  xml = replaceNth(xml, "甲方（盖章）： __________________", `甲方（盖章）：${fmt(data.partyAName)}`, 1);
  xml = replaceNth(xml, "授权代表（签字）： _______________", `授权代表（签字）：${fmt(data.partyALegalRep)}`, 1);
  xml = replaceNth(xml, "乙方（盖章）： __________________", `乙方（盖章）：${PARTY_B.name}`, 1);
  xml = replaceNth(xml, "授权代表（签字）： _______________", `授权代表（签字）：${PARTY_B.legalRep}`, 1);

  // 写回 xml
  zip.file("word/document.xml", xml);

  // 处理签名图片（如果存在）
  const signaturePath = path.join(process.cwd(), "public", "signature-hum.png");
  if (fs.existsSync(signaturePath)) {
    // 签名图片嵌入逻辑（简化：暂时跳过复杂的 XML relationship 操作）
    // 实际嵌入需要修改 _rels 和 [Content_Types].xml，此处预留
  }

  const outputBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(outputBuffer);
}
