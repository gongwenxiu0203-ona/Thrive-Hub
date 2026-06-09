import { generateContractDocx } from "../src/lib/contractV4Generate";
import JSZip from "jszip";
import * as fs from "fs";

async function main() {
  const buf = await generateContractDocx({
    contractNo: "THRAIVE-2026-099",
    partyAName: "测试甲方科技有限公司",
    partyACreditCode: "91440300TEST1234X9",
    partyALegalRep: "张三",
    partyAAddress: "深圳市南山区科技园1栋",
    partyAContact: "李四",
    partyAPhone: "13800138000",
    partyAEmail: "zhangsan@test.com",
    promoPlatform: "亚马逊（Amazon）",
    targetSite: "美国站,英国站,日本",
    startDate: new Date("2026-06-09"),
    endDate: new Date("2027-06-08"),
    taxType: "不含税",
    taxBearer: "甲方",
    feeAmount: "5000",
    feeCurrency: "美金",
    firstPeriodFee: 15000,
    feeCycle: "季度预付",
    commissionType: "FIXED",
    commissionRate: "8%",
    gmvSettlementCycle: "月度",
    coopChannels: JSON.stringify(["ACC", "Levanta", "PrivateSocial"]),
    productList: JSON.stringify([]),
  });

  fs.writeFileSync("C:/Temp/test-contract-output.docx", buf);

  // Inspect resulting XML
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");

  const checkmarks = (xml.match(/✓/g) || []).length;

  console.log("=== 校验结果 ===");
  console.log("对号✓数量:", checkmarks);
  console.log("");
  const checks: [string, boolean][] = [
    ["甲方公司名", text.includes("测试甲方科技有限公司")],
    ["甲方信用代码", text.includes("91440300TEST1234X9")],
    ["甲方法代", text.includes("张三")],
    ["乙方公司名", text.includes("HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED")],
    ["乙方信用代码80456388", text.includes("80456388")],
    ["乙方法代温志倩", text.includes("温志倩")],
    ["合作期限2026", text.includes("2026年06月09日起至2027年06月08日止")],
    ["税费承担方甲方填入", text.includes("相关税费由甲方承担")],
    ["银行账户名", text.includes("HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO   LIMITED")],
    ["开户银行Citibank", text.includes("开户银行：Citibank")],
    ["银行账号", text.includes("70581350002448827")],
    ["SWIFT", text.includes("CITIUS33")],
    ["甲方地址填入", text.includes("深圳市南山区科技园1栋")],
    ["甲方联系人李四", text.includes("李四")],
    ["甲方电话", text.includes("13800138000")],
    ["甲方邮箱", text.includes("zhangsan@test.com")],
    ["乙方地址", text.includes("RM 29-33 5/F BEVERLEY")],
    ["乙方联系人胡铭", text.includes("胡铭")],
    ["乙方电话", text.includes("18721724179")],
    ["乙方邮箱", text.includes("ledo.h@thraiveagency.com")],
    ["首期服务费$15,000", text.includes("$15,000")],
    ["月度服务费金额5000", text.includes("5000 元/月")],
    ["GMV比例8%填入", text.includes("GMV的 8%")],
    ["合同编号未填(应为空)", !text.includes("THRAIVE-2026-099")],
  ];
  for (const [label, ok] of checks) {
    console.log(`${ok ? "✅" : "❌"} ${label}`);
  }

  // GMV 类型删除验证：只保留 FIXED，其他类型标题应被删除
  console.log("");
  console.log("GMV类型删除验证（FIXED保留，其他删除）:");
  console.log(` 固定点数(应在): ${text.includes("固定点数联盟归因") ? "✅" : "❌"}`);
  console.log(` 门槛机制(应删): ${!text.includes("GMV门槛佣金机制") ? "✅删除" : "❌仍在"}`);
  console.log(` 阶梯机制(应删): ${!text.includes("阶梯式联盟归因GMV佣金机制") ? "✅删除" : "❌仍在"}`);
  console.log(` 超额机制(应删): ${!text.includes("超额联盟归因GMV佣金机制") ? "✅删除" : "❌仍在"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
