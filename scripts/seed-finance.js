/**
 * 财务对账模块测试数据种子脚本
 * 运行：node scripts/seed-finance.js
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const ADMIN_ID   = "cmpajvlzf0000ytc0gbhc0c8d"; // 管理员
const LILY_ID    = "cmpajvlzq0001ytc0gfdlpasg"; // Lily 商务
const TOM_ID     = "cmpajvlzz0002ytc0v3ct5050"; // Tom 后端
const CHANNEL_ID = "cmpgp7ggl0000yt1gm35minwl"; // 渠道商

// 已有销售数据的客户
const EXISTING_CUSTOMER_ID = "cmpkjdvo60000ytd4esdwhpj2";

function d(offsetDays) {
  const dt = new Date("2026-05-01T00:00:00Z");
  dt.setDate(dt.getDate() + offsetDays);
  return dt;
}

function periodOf(year, month) {
  return {
    start: new Date(`${year}-${String(month).padStart(2,"0")}-01T00:00:00Z`),
    end:   new Date(`${year}-${String(month).padStart(2,"0")}-${new Date(year, month, 0).getDate()}T23:59:59Z`),
  };
}

async function main() {
  console.log("清理旧财务测试数据…");
  await p.channelReconciliation.deleteMany();
  await p.settlement.deleteMany();
  await p.reconciliationReview.deleteMany();
  await p.customerReconciliation.deleteMany();
  // 只删本次 seed 创建的合同（contractNo 以 DEMO- 开头）
  await p.contract.deleteMany({ where: { contractNo: { startsWith: "DEMO-" } } });
  await p.customer.deleteMany({ where: { brandName: { startsWith: "[测试]" } } });

  // ── 获取/确认现有客户 ──────────────────────────────────────────────────
  let existingCustomer = await p.customer.findUnique({ where: { id: EXISTING_CUSTOMER_ID } });

  // ── 创建 3 个演示客户 + 签署完成的合同 ──────────────────────────────────
  const custA = await p.customer.create({
    data: {
      brandName: "[测试] BioGlow 美妆",
      mainSites: JSON.stringify(["US","UK"]),
      category: "美妆个护",
      status: "COOPERATING",
      rating: "A",
      businessOwnerId: LILY_ID,
      backendOwnerId: TOM_ID,
      channelUserId: CHANNEL_ID,
      source: "INTERNAL",
      updatedAt: new Date(),
    },
  });

  const custB = await p.customer.create({
    data: {
      brandName: "[测试] PetLove 宠物用品",
      mainSites: JSON.stringify(["US"]),
      category: "宠物用品",
      status: "COOPERATING",
      rating: "S",
      businessOwnerId: LILY_ID,
      backendOwnerId: TOM_ID,
      channelUserId: CHANNEL_ID,
      source: "INTERNAL",
      updatedAt: new Date(),
    },
  });

  const custC = await p.customer.create({
    data: {
      brandName: "[测试] SportMax 运动",
      mainSites: JSON.stringify(["US","CA"]),
      category: "运动户外",
      status: "CONTRACT_SIGNED",
      rating: "B",
      businessOwnerId: TOM_ID,
      channelUserId: CHANNEL_ID,
      source: "INTERNAL",
      updatedAt: new Date(),
    },
  });

  // ── 合同 ──────────────────────────────────────────────────────────────
  const contractA = await p.contract.create({
    data: {
      contractNo: "DEMO-2026-001",
      customerId: custA.id,
      type: "BRAND",
      status: "COMPLETED",
      ownerId: LILY_ID,
      reviewerId: ADMIN_ID,
      createdById: ADMIN_ID,
      partyA: "BioGlow International Ltd.",
      accountingPeriod: "每自然月",
      feeCycle: "月度",
      feeAmount: "¥15,000",
      commissionRate: "5%",
      affiliateRule: "纯佣+flatfee，ACC平台管理",
      paymentCycle: "次月15日内付款",
      invoiceReq: "增值税专用发票",
      lateLiability: "逾期每日0.05%违约金",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      updatedAt: new Date(),
    },
  });

  const contractB = await p.contract.create({
    data: {
      contractNo: "DEMO-2026-002",
      customerId: custB.id,
      type: "BRAND",
      status: "COMPLETED",
      ownerId: LILY_ID,
      reviewerId: ADMIN_ID,
      createdById: ADMIN_ID,
      partyA: "PetLove Co., Ltd.",
      accountingPeriod: "每自然月",
      feeCycle: "月度",
      feeAmount: "¥20,000",
      commissionRate: "8%",
      affiliateRule: "纯佣模式，对赌单量达成可享受阶梯佣金",
      paymentCycle: "次月10日内付款",
      invoiceReq: "增值税普通发票",
      lateLiability: "无",
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-12-31"),
      updatedAt: new Date(),
    },
  });

  const contractC = await p.contract.create({
    data: {
      contractNo: "DEMO-2026-003",
      customerId: custC.id,
      type: "BRAND",
      status: "COMPLETED",
      ownerId: TOM_ID,
      reviewerId: ADMIN_ID,
      createdById: ADMIN_ID,
      partyA: "SportMax Global Inc.",
      accountingPeriod: "每自然月",
      feeCycle: "月度",
      feeAmount: "¥8,000",
      commissionRate: "6%",
      affiliateRule: "佣金+flatfee，Levanta平台",
      paymentCycle: "次月20日内付款",
      invoiceReq: "无",
      lateLiability: "逾期15日以上可暂停服务",
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-12-31"),
      updatedAt: new Date(),
    },
  });

  // ── 如果现有客户存在，也给它建一个合同 ──────────────────────────────────
  let contractExisting = null;
  if (existingCustomer) {
    contractExisting = await p.contract.create({
      data: {
        contractNo: "DEMO-2026-004",
        customerId: existingCustomer.id,
        type: "BRAND",
        status: "COMPLETED",
        ownerId: LILY_ID,
        reviewerId: ADMIN_ID,
        createdById: ADMIN_ID,
        partyA: existingCustomer.brandName,
        accountingPeriod: "每自然月",
        feeCycle: "月度",
        feeAmount: "¥25,000",
        commissionRate: "5%",
        affiliateRule: "纯佣，ACC+Levanta双平台",
        paymentCycle: "次月15日内付款",
        invoiceReq: "增值税专用发票",
        lateLiability: "逾期每日0.03%",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        updatedAt: new Date(),
      },
    });
  }

  console.log("✅ 客户 & 合同创建完成");

  const now = new Date();

  // ══════════════════════════════════════════════════════════════════════
  // 场景 1：已确认 — BioGlow 2月对账（固费+抽佣都已结算）
  // ══════════════════════════════════════════════════════════════════════
  const p1 = periodOf(2026, 2);
  const rec1 = await p.customerReconciliation.create({ data: {
    customerId: custA.id, contractId: contractA.id,
    periodStart: p1.start, periodEnd: p1.end,
    partyA: "BioGlow International Ltd.",
    accountingPeriod: "每自然月", feeCycle: "月度",
    feeAmount: 15000, commissionRate: 0.05,
    affiliateRule: "纯佣+flatfee，ACC平台管理",
    paymentCycle: "次月15日内付款",
    betType: "NONE",
    actualOrders: 1842, actualSalesAmount: 286400,
    betResult: "NA",
    actualCommissionRate: 0.05,
    commissionAmount: 14320,
    status: "CONFIRMED",
    submittedById: LILY_ID, submittedAt: d(-50),
    finalOrders: 1842, finalSalesAmount: 286400, finalCommissionAmount: 14320,
    createdById: LILY_ID, createdAt: d(-55), updatedAt: d(-40),
  }});
  await p.reconciliationReview.createMany({ data: [
    { reconciliationId: rec1.id, reviewerId: LILY_ID,  action: "SUBMITTED",       note: "2月对账数据已核实，请审核确认", createdAt: d(-50) },
    { reconciliationId: rec1.id, reviewerId: ADMIN_ID, action: "APPROVED",        note: "数据核对无误，确认通过", createdAt: d(-48) },
  ]});
  const s1a = await p.settlement.create({ data: {
    reconciliationId: rec1.id, type: "FIXED_FEE", amount: 15000,
    status: "SETTLED", estimatedDate: d(-20), actualDate: d(-22),
    reminderSent: true, note: "已收款，对方转账", createdById: LILY_ID,
    createdAt: d(-48), updatedAt: d(-22),
  }});
  const s1b = await p.settlement.create({ data: {
    reconciliationId: rec1.id, type: "COMMISSION", amount: 14320,
    status: "SETTLED", estimatedDate: d(-20), actualDate: d(-18),
    reminderSent: true, note: "抽佣款到账", createdById: LILY_ID,
    createdAt: d(-48), updatedAt: d(-18),
  }});

  // ══════════════════════════════════════════════════════════════════════
  // 场景 2：已确认 — BioGlow 3月对账（未结算，待收款）
  // ══════════════════════════════════════════════════════════════════════
  const p2 = periodOf(2026, 3);
  const rec2 = await p.customerReconciliation.create({ data: {
    customerId: custA.id, contractId: contractA.id,
    periodStart: p2.start, periodEnd: p2.end,
    partyA: "BioGlow International Ltd.",
    accountingPeriod: "每自然月", feeCycle: "月度",
    feeAmount: 15000, commissionRate: 0.05,
    affiliateRule: "纯佣+flatfee，ACC平台管理",
    paymentCycle: "次月15日内付款",
    betType: "NONE",
    actualOrders: 2103, actualSalesAmount: 318600,
    betResult: "NA",
    actualCommissionRate: 0.05,
    commissionAmount: 15930,
    status: "CONFIRMED",
    submittedById: LILY_ID, submittedAt: d(-22),
    finalOrders: 2103, finalSalesAmount: 318600, finalCommissionAmount: 15930,
    createdById: LILY_ID, createdAt: d(-25), updatedAt: d(-20),
  }});
  await p.reconciliationReview.createMany({ data: [
    { reconciliationId: rec2.id, reviewerId: LILY_ID,  action: "SUBMITTED",  note: "3月对账数据完成，请确认", createdAt: d(-22) },
    { reconciliationId: rec2.id, reviewerId: ADMIN_ID, action: "APPROVED",   note: "确认", createdAt: d(-20) },
  ]});
  await p.settlement.create({ data: {
    reconciliationId: rec2.id, type: "FIXED_FEE", amount: 15000,
    status: "PENDING", estimatedDate: d(5), actualDate: null,
    reminderSent: true, createdById: LILY_ID, createdAt: d(-20), updatedAt: d(-20),
  }});
  await p.settlement.create({ data: {
    reconciliationId: rec2.id, type: "COMMISSION", amount: 15930,
    status: "PENDING", estimatedDate: d(5), actualDate: null,
    reminderSent: true, createdById: LILY_ID, createdAt: d(-20), updatedAt: d(-20),
  }});

  // ══════════════════════════════════════════════════════════════════════
  // 场景 3：待对方确认 — PetLove 2月对账（对赌单量，完成对赌）
  // ══════════════════════════════════════════════════════════════════════
  const p3 = periodOf(2026, 2);
  const rec3 = await p.customerReconciliation.create({ data: {
    customerId: custB.id, contractId: contractB.id,
    periodStart: p3.start, periodEnd: p3.end,
    partyA: "PetLove Co., Ltd.",
    accountingPeriod: "每自然月", feeCycle: "月度",
    feeAmount: 20000, commissionRate: 0.08,
    affiliateRule: "纯佣模式，对赌单量达成可享受阶梯佣金",
    paymentCycle: "次月10日内付款",
    betType: "ORDER_COUNT", betOrderCount: 3000,
    actualOrders: 3287, actualSalesAmount: 498200,
    betResult: "ACHIEVED",
    actualCommissionRate: 0.08,
    commissionAmount: 39856,
    status: "PENDING_REVIEW",
    submittedById: LILY_ID, submittedAt: d(-5),
    createdById: LILY_ID, createdAt: d(-8), updatedAt: d(-5),
  }});
  await p.reconciliationReview.create({ data: {
    reconciliationId: rec3.id, reviewerId: LILY_ID,
    action: "SUBMITTED", note: "2月对赌完成，实际单量3287 > 对赌单量3000，抽佣按原比例8%计算",
    createdAt: d(-5),
  }});

  // ══════════════════════════════════════════════════════════════════════
  // 场景 4：有异议 — PetLove 3月对账（对赌单量，数据有分歧）
  // ══════════════════════════════════════════════════════════════════════
  const p4 = periodOf(2026, 3);
  const rec4 = await p.customerReconciliation.create({ data: {
    customerId: custB.id, contractId: contractB.id,
    periodStart: p4.start, periodEnd: p4.end,
    partyA: "PetLove Co., Ltd.",
    accountingPeriod: "每自然月", feeCycle: "月度",
    feeAmount: 20000, commissionRate: 0.08,
    affiliateRule: "纯佣模式，对赌单量达成可享受阶梯佣金",
    paymentCycle: "次月10日内付款",
    betType: "ORDER_COUNT", betOrderCount: 3000,
    // 争议后更新为对方数据（我方2876，对方认为2791）
    actualOrders: 2876, actualSalesAmount: 421300,
    betResult: "NOT_ACHIEVED",
    actualCommissionRate: 0,
    commissionAmount: 0,
    status: "DISPUTED",
    submittedById: LILY_ID, submittedAt: d(-12),
    createdById: LILY_ID, createdAt: d(-15), updatedAt: d(-8),
  }});
  await p.reconciliationReview.createMany({ data: [
    {
      reconciliationId: rec4.id, reviewerId: LILY_ID,
      action: "SUBMITTED",
      note: "3月对账数据，实际单量2876，未达成对赌单量3000，抽佣为0",
      createdAt: d(-12),
    },
    {
      reconciliationId: rec4.id, reviewerId: ADMIN_ID,
      action: "DISPUTED",
      disputedOrders: 3152,
      disputedSalesAmount: 462800,
      note: "我司系统统计单量为3152，销售额为¥462,800，超过对赌单量，应按8%计算抽佣，请核实数据来源差异",
      createdAt: d(-8),
    },
  ]});

  // ══════════════════════════════════════════════════════════════════════
  // 场景 5：草稿 — SportMax 4月对账（对赌销售额+单量，数据已拉取）
  // ══════════════════════════════════════════════════════════════════════
  const p5 = periodOf(2026, 4);
  const rec5 = await p.customerReconciliation.create({ data: {
    customerId: custC.id, contractId: contractC.id,
    periodStart: p5.start, periodEnd: p5.end,
    partyA: "SportMax Global Inc.",
    accountingPeriod: "每自然月", feeCycle: "月度",
    feeAmount: 8000, commissionRate: 0.06,
    affiliateRule: "佣金+flatfee，Levanta平台",
    paymentCycle: "次月20日内付款",
    betType: "BOTH", betOrderCount: 1500, betSalesAmount: 200000,
    actualOrders: 1823, actualSalesAmount: 241600,
    betResult: "ACHIEVED",
    actualCommissionRate: 0.06,
    commissionAmount: 14496,
    status: "DRAFT",
    createdById: TOM_ID, createdAt: d(-3), updatedAt: d(-1),
  }});

  // ══════════════════════════════════════════════════════════════════════
  // 场景 6：草稿 — SportMax 5月对账（刚创建，BI数据未拉取）
  // ══════════════════════════════════════════════════════════════════════
  const p6 = periodOf(2026, 5);
  await p.customerReconciliation.create({ data: {
    customerId: custC.id, contractId: contractC.id,
    periodStart: p6.start, periodEnd: p6.end,
    partyA: "SportMax Global Inc.",
    accountingPeriod: "每自然月", feeCycle: "月度",
    feeAmount: 8000, commissionRate: 0.06,
    affiliateRule: "佣金+flatfee，Levanta平台",
    paymentCycle: "次月20日内付款",
    betType: "BOTH", betOrderCount: 1500, betSalesAmount: 200000,
    actualOrders: 0, actualSalesAmount: 0,
    status: "DRAFT",
    createdById: TOM_ID, createdAt: d(0), updatedAt: d(0),
  }});

  // ══════════════════════════════════════════════════════════════════════
  // 场景 7（可选）：现有客户有真实销售数据 → 已确认对账
  // ══════════════════════════════════════════════════════════════════════
  let s7a = null;
  if (existingCustomer && contractExisting) {
    const p7 = periodOf(2026, 3);
    const salesAgg = await p.salesRecord.aggregate({
      where: { customerId: existingCustomer.id, orderDate: { gte: p7.start, lte: p7.end } },
      _sum: { orders: true, revenue: true },
    });
    const actualOrders = salesAgg._sum.orders ?? 0;
    const actualSalesAmount = salesAgg._sum.revenue ?? 0;
    const commissionAmount = actualSalesAmount * 0.05;

    const rec7 = await p.customerReconciliation.create({ data: {
      customerId: existingCustomer.id, contractId: contractExisting.id,
      periodStart: p7.start, periodEnd: p7.end,
      partyA: existingCustomer.brandName,
      accountingPeriod: "每自然月", feeCycle: "月度",
      feeAmount: 25000, commissionRate: 0.05,
      affiliateRule: "纯佣，ACC+Levanta双平台",
      paymentCycle: "次月15日内付款",
      betType: "NONE",
      actualOrders, actualSalesAmount,
      betResult: "NA",
      actualCommissionRate: 0.05,
      commissionAmount,
      status: "CONFIRMED",
      submittedById: LILY_ID, submittedAt: d(-20),
      finalOrders: actualOrders, finalSalesAmount: actualSalesAmount, finalCommissionAmount: commissionAmount,
      createdById: LILY_ID, createdAt: d(-25), updatedAt: d(-18),
    }});
    await p.reconciliationReview.createMany({ data: [
      { reconciliationId: rec7.id, reviewerId: LILY_ID, action: "SUBMITTED", note: "真实BI数据对账", createdAt: d(-20) },
      { reconciliationId: rec7.id, reviewerId: ADMIN_ID, action: "APPROVED", note: "数据核实无误", createdAt: d(-18) },
    ]});
    s7a = await p.settlement.create({ data: {
      reconciliationId: rec7.id, type: "FIXED_FEE", amount: 25000,
      status: "SETTLED", estimatedDate: d(-10), actualDate: d(-8),
      reminderSent: true, createdById: LILY_ID, createdAt: d(-18), updatedAt: d(-8),
    }});
    await p.settlement.create({ data: {
      reconciliationId: rec7.id, type: "COMMISSION", amount: commissionAmount,
      status: "PENDING", estimatedDate: d(3),
      reminderSent: false, createdById: LILY_ID, createdAt: d(-18), updatedAt: d(-18),
    }});
    console.log(`✅ 真实客户 ${existingCustomer.brandName} 对账创建：orders=${actualOrders}, revenue=${actualSalesAmount.toFixed(2)}, commission=${commissionAmount.toFixed(2)}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 渠道商分账 — 基于已结算的 BioGlow 2月固费 & 抽佣
  // ══════════════════════════════════════════════════════════════════════
  // 固费分账：渠道商拿30%，共1期
  await p.channelReconciliation.create({ data: {
    customerId: custA.id,
    settlementId: s1a.id,
    channelUserId: CHANNEL_ID,
    fixedFeeShareRate: 0.30,
    fixedFeeSharePerPeriod: 15000 * 0.30,
    fixedFeeSharePeriods: 1,
    fixedFeeShareTotal: 15000 * 0.30,
    commissionShareRate: 0,
    commissionSharePerPeriod: 0,
    commissionSharePeriods: 1,
    commissionShareTotal: 0,
    totalShareAmount: 15000 * 0.30,
    status: "SETTLED",
    estimatedDate: d(-15), actualDate: d(-14),
    note: "2月固费渠道商分账30%，已付款",
    createdById: ADMIN_ID, createdAt: d(-40), updatedAt: d(-14),
  }});

  // 抽佣分账：渠道商拿20%，共1期，待结算
  await p.channelReconciliation.create({ data: {
    customerId: custA.id,
    settlementId: s1b.id,
    channelUserId: CHANNEL_ID,
    fixedFeeShareRate: 0,
    fixedFeeSharePerPeriod: 0,
    fixedFeeSharePeriods: 1,
    fixedFeeShareTotal: 0,
    commissionShareRate: 0.20,
    commissionSharePerPeriod: 14320 * 0.20,
    commissionSharePeriods: 1,
    commissionShareTotal: 14320 * 0.20,
    totalShareAmount: 14320 * 0.20,
    status: "PENDING",
    estimatedDate: d(10),
    note: "2月抽佣渠道商分账20%，待结算",
    createdById: ADMIN_ID, createdAt: d(-40), updatedAt: d(-18),
  }});

  // 真实客户的渠道分账（如果有）
  if (s7a) {
    await p.channelReconciliation.create({ data: {
      customerId: existingCustomer.id,
      settlementId: s7a.id,
      channelUserId: CHANNEL_ID,
      fixedFeeShareRate: 0.25,
      fixedFeeSharePerPeriod: 25000 * 0.25,
      fixedFeeSharePeriods: 1,
      fixedFeeShareTotal: 25000 * 0.25,
      commissionShareRate: 0,
      commissionSharePerPeriod: 0,
      commissionSharePeriods: 1,
      commissionShareTotal: 0,
      totalShareAmount: 25000 * 0.25,
      status: "SETTLED",
      estimatedDate: d(-5), actualDate: d(-4),
      note: "3月固费渠道商分账25%",
      createdById: ADMIN_ID, createdAt: d(-18), updatedAt: d(-4),
    }});
  }

  console.log("\n✅ 财务对账测试数据创建完成！\n");
  console.log("场景汇总：");
  console.log("  1. BioGlow  2月 | 已确认 + 已结算（固费¥15,000 + 抽佣¥14,320）");
  console.log("  2. BioGlow  3月 | 已确认 + 待结算（固费¥15,000 + 抽佣¥15,930）");
  console.log("  3. PetLove  2月 | 待对方确认（对赌单量达成，抽佣¥39,856）");
  console.log("  4. PetLove  3月 | 有异议（我方说未达成，对方说达成，数据有分歧）");
  console.log("  5. SportMax 4月 | 草稿（对赌双维度，已拉取BI数据，待提交）");
  console.log("  6. SportMax 5月 | 草稿（刚创建，BI数据未拉取）");
  if (existingCustomer) console.log(`  7. ${existingCustomer.brandName} 3月 | 真实BI数据对账（已确认+固费已结算）`);
  console.log("\n渠道商分账：");
  console.log("  - BioGlow 2月固费 渠道商分账30% ¥4,500 已结算");
  console.log("  - BioGlow 2月抽佣 渠道商分账20% ¥2,864 待结算");

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
