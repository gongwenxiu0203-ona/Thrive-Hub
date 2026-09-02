import JSZip from "jszip";
import type { ContractConfirmationDraft } from "./contractConfirmationDraft";

export type FrameworkDocumentData = {
  contractNo: string; partyA: string; partyACreditCode: string; partyAAddress: string;
  partyAContact: string; partyAEmail: string; partyAPhone: string;
  partyB: string; partyBCreditCode: string; partyBAddress: string;
  partyBContact: string; partyBEmail: string; partyBPhone: string;
  accounts: Array<{ accountName?: string; bankName?: string; bankAddress?: string; accountNumber?: string; swiftCode?: string; routingNumber?: string; bankAccountType?: string }>;
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function plain(xml: string) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}
function setText(xml: string, value: string) {
  let first = true;
  return xml.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () => {
    const text = first ? value.split("\n").map(esc).join('</w:t><w:br/><w:t xml:space="preserve">') : "";
    first = false;
    return `<w:t xml:space="preserve">${text}</w:t>`;
  });
}
function paragraphs(xml: string, rewrite: (text: string) => string) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => { const before = plain(p); const after = rewrite(before); return after === before ? p : setText(p, after); });
}
function fillBlanks(text: string, values: string[]) {
  let i = 0;
  return text.replace(/【[^】]*】/g, () => values[i++] ?? "");
}
const norm = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[（）()\s_-]/g, "");
function selectedHas(selected: string[], option: string) {
  const target = norm(option);
  return selected.some(value => { const key = norm(value); return key === target || key.includes(target) || target.includes(key); });
}
function checkedOptions(options: string[], selected: string[]) {
  const standard = options.map(option => `${selectedHas(selected, option) ? "☑" : "☐"} ${option}`);
  const custom = selected.filter(value => !options.some(option => selectedHas([value], option)));
  return `${standard.join("  ")}  ${custom.length ? `☑ 其他：【${custom.join("、")}】` : "☐ 其他：【 】"}`;
}
function tableRows(table: string, values: string[][], keepHeader: boolean, renderCell?: (original: string, value: string, column: number, row: number) => string) {
  const rows = table.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
  const model = rows[keepHeader ? 1 : 0];
  if (!model) throw new Error("模板表格结构不完整");
  const rendered = values.map((row, rowIndex) => {
    let i = 0;
    return model.replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, cell => {
      const column = i++;
      return setText(cell, renderCell ? renderCell(plain(cell), row[column] ?? "", column, rowIndex) : row[column] ?? "");
    });
  });
  let inserted = false;
  return table.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    if (!inserted) { inserted = true; return (keepHeader ? row : "") + rendered.join(""); }
    return "";
  });
}
function keyValues(table: string, values: Record<string, string | ((original: string) => string)>) {
  return table.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    const cells = row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) || [];
    const value = values[plain(cells[0] || "").trim()];
    if (value === undefined || cells.length !== 2) return row;
    return row.replace(cells[1], setText(cells[1], typeof value === "function" ? value(plain(cells[1])) : value));
  });
}

const optionKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").trim();
/** Preserve every template choice, changing only its checkmark and custom-value slot. */
function checkTemplateChoices(original: string, selected: string[], aliases: Record<string, string[]> = {}) {
  const options = [...original.matchAll(/[☐☑]\s*([^☐☑]*)/g)];
  const matches = (label: string, value: string) => [label.trim(), ...(aliases[label.trim()] || [])].some(alias => optionKey(alias) === optionKey(value));
  const custom = selected.filter(value => !options.some(option => !option[1].trim().startsWith("其他") && matches(option[1], value)));
  return original.replace(/[☐☑](\s*)([^☐☑]*)/g, (_all, space: string, label: string) => {
    const other = label.trim().startsWith("其他");
    const checked = other ? custom.length > 0 : selected.some(value => matches(label, value));
    return `${checked ? "☑" : "☐"}${space}${other ? label.replace(/【[^】]*】/, `【${custom.join("、")}】`) : label}`;
  });
}

function sourceChoices(original: string, selected: string[]) {
  const direct = ["Amazon Attribution", "Amazon Creator Connections（ACC）", "Amazon 销售平台后台"];
  const aliases: Record<string, string[]> = { "Amazon Creator Connections（ACC）": ["ACC", "Amazon Creator Connections (ACC)", "Creator Connections (ACC)"], "Amazon Attribution": ["Attribution"] };
  const custom = selected.filter(value => !direct.some(label => [label, ...(aliases[label] || [])].some(alias => optionKey(alias) === optionKey(value))));
  const finalOption = [...original.matchAll(/[☐☑]\s*([^☐☑]*)/g)].at(-1)?.[1].trim();
  if (!finalOption) throw new Error("模板销售数据来源选项缺失");
  const result = checkTemplateChoices(original, [...selected, ...(custom.length ? [finalOption] : [])], aliases);
  return custom.length ? `${result}\n所选数据来源：${custom.join("、")}` : result;
}

/** Fill the supplied V3.2 standard contract. Unknown layouts fail closed, never silently export blank forms. */
export async function fillFrameworkDocument(template: Buffer, master: FrameworkDocumentData, selection: "master" | "confirmation" | "both", confirmation?: { number: string; draft: ContractConfirmationDraft }) {
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("合同模板缺少正文");
  const bodyMatch = xml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) throw new Error("合同模板正文结构无效");
  const body = bodyMatch[1];
  const nodes = [...body.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)];
  const marker = nodes.find(n => plain(n[0]).includes("附件：《项目确认书"));
  if (!marker || marker.index === undefined) throw new Error("模板不符合V3.2主合同＋项目确认书结构，请上传对应模板");
  if (selection !== "master" && !confirmation) throw new Error("请选择需要导出的项目确认书");
  let masterXml = body.slice(0, marker.index);
  let sowXml = body.slice(marker.index).replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, "");
  const section = body.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] || "";
  let side: "A" | "B" = "A";
  masterXml = paragraphs(masterXml, text => {
    if (text.startsWith("合同编号：")) return `合同编号：${master.contractNo}`;
    if (text.startsWith("甲方（客户）：")) { side = "A"; return `甲方（客户）：${master.partyA}`; }
    if (text.startsWith("乙方（服务方）：")) { side = "B"; return `乙方（服务方）：${master.partyB}`; }
    if (text.startsWith("统一社会信用代码/商业登记号：")) return fillBlanks(text, [side === "A" ? master.partyACreditCode : master.partyBCreditCode]);
    if (text.startsWith("指定对接人：")) return fillBlanks(text, side === "A" ? [master.partyAContact, master.partyAEmail] : [master.partyBContact, master.partyBEmail]);
    if (text.startsWith("甲方（签字/盖章）：")) return fillBlanks(text, [master.partyA]);
    if (text.startsWith("乙方（签字/盖章）：")) return fillBlanks(text, [master.partyB]);
    return text;
  });
  masterXml = masterXml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, table => {
    const text = plain(table);
    if (text.startsWith("账户名称")) return master.accounts.map(a => keyValues(table, { "账户名称": a.accountName || "", "开户银行": a.bankName || "", "银行地址": a.bankAddress || "", "银行账号": a.accountNumber || "", "SWIFT CODE": a.swiftCode || "不适用", "路由ABA": a.routingNumber || "不适用", "账户类型": a.bankAccountType || "不适用" })).join("");
    if (text.startsWith("项目甲方乙方")) return tableRows(table, [["地址", master.partyAAddress, master.partyBAddress], ["指定联系人及电话", `${master.partyAContact} ${master.partyAPhone}`, `${master.partyBContact} ${master.partyBPhone}`], ["电子邮箱", master.partyAEmail, master.partyBEmail]], true);
    return table;
  });
  if (confirmation) {
    const d = confirmation.draft;
    sowXml = paragraphs(sowXml, text => {
      if (text.startsWith("对应主合同编号：")) return `对应主合同编号：${master.contractNo}\n项目确认书编号：${confirmation.number}`;
      if (text.startsWith("推广商品范围：")) return `推广商品范围：${d.productScope === "ALL" ? "☑ 全店商品  ☐ 指定推广商品" : "☐ 全店商品  ☑ 指定推广商品（见下表）"}`;
      if (text.startsWith("6. 其他服务：")) return `6. 其他服务：${d.serviceDescription || "无"}`;
      if (text.startsWith("所选方式的补充说明")) return fillBlanks(text, [d.commission?.basisEvidence || "无"]);
      if (text.startsWith("双方确认，以每个自然月")) return fillBlanks(text, [String(d.commission?.threshold ?? 0)]).replace("币种：美金", `币种：${d.commission?.thresholdCurrency || d.commission?.currency || "USD"}`);
      const basis = d.commission?.basis;
      if (text.startsWith("☐ 按 Campaign")) return text.replace("☐", basis === "CAMPAIGN" ? "☑" : "☐");
      if (text.startsWith("☐ 按 Publisher")) return text.replace("☐", basis === "PUBLISHER" ? "☑" : "☐");
      if (text.startsWith("☐ 按销售额门槛")) return text.replace("☐", basis === "EXCESS" ? "☑" : "☐");
      if (text.startsWith("☐ 全量销售")) return text.replace("☐", basis === "ALL" ? "☑" : "☐");
      if (text.startsWith("甲方（签字/盖章）：")) return fillBlanks(text, [master.partyA]);
      if (text.startsWith("乙方（签字/盖章）：")) return fillBlanks(text, [master.partyB]);
      return text;
    });
    sowXml = sowXml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, table => {
      const text = plain(table);
      if (text.startsWith("甲方") && text.includes("品牌/店铺名称")) return keyValues(table, { "甲方": master.partyA, "乙方": master.partyB, "品牌/店铺名称": d.brand, "网站/店铺链接": d.storeUrl || "不适用", "合作周期": `${d.startDate} 至 ${d.endDate}`, "最低合作周期": `${d.minimumMonths ?? 0}个月`, "甲方指定对接人": `姓名：${d.partyAContact.name} 电子邮箱：${d.partyAContact.email} 电话：${d.partyAContact.phone}`, "乙方指定对接人": `姓名：${d.partyBContact.name} 电子邮箱：${d.partyBContact.email} 电话：${d.partyBContact.phone}` });
      if (text.startsWith("国家（站点）销售平台")) return tableRows(table, d.scopes.map(s => [s.country, checkedOptions(["Amazon", "Walmart", "Shopify"], s.salesPlatforms), checkedOptions(["Attribution", "Creator Connections（ACC）"], s.programs), checkedOptions(["无", "Levanta", "PartnerBoost"], s.thirdPartyPlatforms)]), true);
      if (text.startsWith("商品名称ASIN")) return tableRows(table, d.productScope === "ALL" ? [["☑ 全店商品  ☐ 指定推广商品", "全店", "全部站点", "未选择项保留"]] : d.products.map(p => [p.name, p.asinOrUrl, p.country, p.note]), true);
      if (text.startsWith("收费模式")) return keyValues(table, { "收费模式": `${d.monthlyFee ? "☑" : "☐"} 月度服务费  ${d.commission?.mode === "GMV_SERVICE" ? "☑" : "☐"} GMV服务佣金  ${d.commission?.mode === "PACKAGE" ? "☑" : "☐"} 总包佣金  ${d.additionalFees.length ? "☑" : "☐"} 固定项目费  ${d.additionalFees.length ? `☑ 其他：【${d.additionalFees.map(f => `${f.description} ${f.currency} ${f.amount}`).join("；")}】` : "☐ 其他：【 】"}`, "月度服务费": d.monthlyFee ? `${d.monthlyFee.currency} ${d.monthlyFee.amount}/月` : "不适用", "GMV 服务佣金比例": d.commission?.mode === "GMV_SERVICE" ? `${d.commission.serviceRatePercent}%` : d.commission ? `总包佣金：${d.commission.packageValue}；实际抽佣比例按各期对账核定` : "不适用", "后续月费": d.paymentTerms || "乙方按月提供invoice/结算单，甲方收到完整文件后十日内安排付款", "归因窗口": `${d.attributionWindowDays}日；订单锁定期${d.orderLockDays}日；尾期${d.tailDays}日。${d.tailTerms}`, "销售数据来源": checkedOptions(["Amazon Attribution", "Amazon Creator Connections（ACC）", "Amazon 销售平台后台", "以 Shopify 后台、Google Analytics 4（GA4）归因数据或双方确认的第三方联盟平台数据"], d.salesSources) });
      return table;
    });
  }
  const result = (selection === "master" ? masterXml : selection === "confirmation" ? sowXml : masterXml + sowXml) + section;
  zip.file("word/document.xml", xml.replace(bodyMatch[1], result));
  return zip.generateAsync({ type: "nodebuffer" });
}
