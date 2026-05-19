import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log("Seeding database…");

  await prisma.salesRecord.deleteMany();
  await prisma.salesBatch.deleteMany();
  await prisma.asinMapping.deleteMany();
  await prisma.contractFieldReview.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.task.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.affiliate.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  const adminPw = await bcrypt.hash("admin123", 10);
  const userPw = await bcrypt.hash("user123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "管理员",
      email: "admin@demo.com",
      passwordHash: adminPw,
      role: "ADMIN",
      feishuAuth: true,
      googleAuth: true,
      emailAuth: true,
    },
  });
  const lily = await prisma.user.create({
    data: {
      name: "Lily 商务",
      email: "lily@demo.com",
      passwordHash: userPw,
      role: "USER",
      feishuAuth: true,
      emailAuth: true,
    },
  });
  const tom = await prisma.user.create({
    data: {
      name: "Tom 后端",
      email: "tom@demo.com",
      passwordHash: userPw,
      role: "USER",
      googleAuth: true,
      emailAuth: true,
    },
  });
  const shallow = await prisma.user.create({
    data: {
      name: "Shallow 审核",
      email: "shallow@demo.com",
      passwordHash: userPw,
      role: "ADMIN",
      emailAuth: true,
    },
  });

  // ---- Customers --------------------------------------------------------
  const auroratech = await prisma.customer.create({
    data: {
      brandName: "AuroraTech",
      mainSites: JSON.stringify(["US", "UK"]),
      siteLinks: JSON.stringify({
        US: {
          link: "https://amazon.com/stores/auroratech",
          price: "39.99",
          asin: "B0AURORA01",
        },
        UK: {
          link: "https://amazon.co.uk/stores/auroratech",
          price: "34.99",
          asin: "B0AURORA02",
        },
      }),
      competitor: "Anker / Belkin",
      targetPlatforms: JSON.stringify(["Amazon", "独立站"]),
      platformGmv: JSON.stringify({
        Amazon: "$80k-$120k / 月",
        独立站: "$20k-$40k / 月",
      }),
      amazonAcos: "22%",
      socialMediaInfo: "已与 IG/TikTok 数位中腰部红人合作",
      affiliateHistory: "做过，主要用 Levanta，月度联盟 GMV 约 $30k，占比 15%",
      affiliatePlatforms: "Levanta、ACC",
      promotionGoals: JSON.stringify(["新品推广", "全店业务增量"]),
      targetGmv: "月 GMV $150k",
      channelBudget: "单渠道 $1000-$3000",
      affiliateTeam: "有 1 人兼职负责联盟对接",
      category: "消费电子",
      status: "CONTRACT_IN_PROGRESS",
      rating: "S",
      businessOwnerId: lily.id,
      backendOwnerId: tom.id,
      contactName: "Jason Lee",
      contactEmail: "jason@auroratech.com",
      contactPhone: "+1 415 555 0192",
      source: "INTERNAL",
    },
  });

  const greenleaf = await prisma.customer.create({
    data: {
      brandName: "GreenLeaf Home",
      mainSites: JSON.stringify(["UK"]),
      siteLinks: JSON.stringify({
        UK: {
          link: "https://amazon.co.uk/stores/greenleaf",
          price: "24.99",
          asin: "B0GREEN01",
        },
      }),
      competitor: "无明确竞品",
      targetPlatforms: JSON.stringify(["Amazon"]),
      platformGmv: JSON.stringify({ Amazon: "$30k-$50k / 月" }),
      amazonAcos: "28%",
      socialMediaInfo: "暂无社媒推广",
      affiliateHistory: "未做过联盟营销",
      affiliatePlatforms: "",
      promotionGoals: JSON.stringify(["老品增量"]),
      targetGmv: "月 GMV $60k",
      channelBudget: "暂无固定费用预算",
      affiliateTeam: "无联盟团队",
      category: "家居",
      status: "INTERNAL_DISCUSSION",
      statusChangedAt: daysFromNow(-9),
      rating: "B",
      businessOwnerId: lily.id,
      source: "INTERNAL",
      contactName: "Emma Watson",
      contactEmail: "emma@greenleaf.co.uk",
    },
  });

  const petjoy = await prisma.customer.create({
    data: {
      brandName: "PetJoy",
      mainSites: JSON.stringify(["DE", "CA"]),
      siteLinks: JSON.stringify({
        DE: {
          link: "https://amazon.de/stores/petjoy",
          price: "29.99",
          asin: "B0PETJOY01",
        },
        CA: {
          link: "https://amazon.ca/stores/petjoy",
          price: "32.99",
          asin: "B0PETJOY02",
        },
      }),
      competitor: "Petlibro",
      targetPlatforms: JSON.stringify(["Amazon", "沃尔玛"]),
      platformGmv: JSON.stringify({
        Amazon: "$40k-$60k / 月",
        沃尔玛: "$10k-$20k / 月",
      }),
      amazonAcos: "25%",
      socialMediaInfo: "TikTok 有少量自然流量",
      affiliateHistory: "做过，用 PartnerBoost，月度联盟 GMV 约 $12k",
      affiliatePlatforms: "PartnerBoost",
      promotionGoals: JSON.stringify(["新品推广"]),
      targetGmv: "月 GMV $90k",
      channelBudget: "单渠道 $500-$1500",
      affiliateTeam: "无",
      category: "宠物用品",
      status: "DEMO_DONE",
      statusChangedAt: daysFromNow(-16),
      rating: "A",
      businessOwnerId: lily.id,
      backendOwnerId: tom.id,
      source: "INTERNAL",
      contactName: "Hans Müller",
      contactEmail: "hans@petjoy.de",
    },
  });

  const fitcore = await prisma.customer.create({
    data: {
      brandName: "FitCore",
      mainSites: JSON.stringify(["US"]),
      siteLinks: JSON.stringify({
        US: { link: "https://fitcore.com", price: "45.00", asin: "" },
      }),
      targetPlatforms: JSON.stringify(["独立站"]),
      platformGmv: JSON.stringify({ 独立站: "$15k-$25k / 月" }),
      socialMediaInfo: "IG 1.2 万粉丝，曾投放 TikTok 广告",
      affiliateHistory: "未做过联盟营销",
      promotionGoals: JSON.stringify(["新品推广"]),
      targetGmv: "月度 $40k",
      channelBudget: "月度 $8000",
      category: "健身器材",
      status: "DEMO_IN_PROGRESS",
      rating: "C",
      businessOwnerId: lily.id,
      source: "INTAKE",
      contactName: "Mike Ross",
      contactEmail: "mike@fitcore.com",
    },
  });

  const lumibeauty = await prisma.customer.create({
    data: {
      brandName: "LumiBeauty",
      status: "UNASSIGNED",
      rating: "PENDING",
      category: "美妆个护",
      source: "INTAKE",
    },
  });

  const customers = [auroratech, greenleaf, petjoy, fitcore, lumibeauty];

  // ---- Contracts --------------------------------------------------------
  const sampleContractText = `联盟营销服务合作协议

甲方：深圳市奥若拉科技有限公司
乙方：环球联盟营销服务（深圳）有限公司

第一条 合作期限
本协议合作期限为 2024-06-01 至 2025-05-31。

第二条 服务费
2.1 固定服务费：¥10,000 / 月。
2.2 支付方式：乙方于每月 5 日前向甲方开具发票，甲方于收到发票后 7 个工作日内支付当月固定服务费。

第三条 联盟佣金规则
对当月全部联盟 GMV 按 3% 收取佣金。佣金于次月 15 日前结算。

第四条 对账与结算
4.1 双方于每月 3 日前完成上月联盟推广数据对账，以亚马逊后台数据为准。
4.2 对账确认后，乙方开具佣金发票。

第五条 发票要求
甲方需提供 6% 增值税专用发票。

第六条 逾期责任
任何一方逾期付款的，每逾期一日按逾期金额的 0.05% 支付违约金。`;

  const c1 = await prisma.contract.create({
    data: {
      contractNo: "CT-2024-001",
      customerId: auroratech.id,
      type: "BRAND",
      status: "COMPLETED",
      ownerId: lily.id,
      reviewerId: shallow.id,
      contractText: sampleContractText,
      extractedBy: "RULE",
      partyA: "深圳市奥若拉科技有限公司 / 环球联盟营销服务（深圳）有限公司",
      accountingPeriod:
        "双方于每月 3 日前完成上月联盟推广数据对账，以亚马逊后台数据为准。",
      feeCycle: "月度",
      feeAmount: "¥10,000",
      commissionRate: "3%",
      affiliateRule:
        "对当月全部联盟 GMV 按 3% 收取佣金。佣金于次月 15 日前结算。",
      paymentCycle:
        "乙方于每月 5 日前向甲方开具发票，甲方于收到发票后 7 个工作日内支付当月固定服务费。",
      invoiceReq: "甲方需提供 6% 增值税专用发票。",
      lateLiability:
        "任何一方逾期付款的，每逾期一日按逾期金额的 0.05% 支付违约金。",
      startDate: daysFromNow(-30),
      endDate: daysFromNow(335),
      createdById: lily.id,
    },
  });

  await prisma.contract.create({
    data: {
      contractNo: "CT-2024-002",
      customerId: petjoy.id,
      type: "CHANNEL",
      status: "REVIEWING",
      ownerId: lily.id,
      reviewerId: shallow.id,
      contractText: sampleContractText,
      extractedBy: "RULE",
      partyA: "PetJoy GmbH / 环球联盟营销服务（深圳）有限公司",
      accountingPeriod: "每月 3 日前完成上月对账，以平台后台数据为准。",
      feeCycle: "季度",
      feeAmount: "¥9,000",
      commissionRate: "5%",
      affiliateRule: "对当季全部联盟 GMV 按 5% 收取佣金。",
      paymentCycle: "每季度首月 10 日前支付。",
      invoiceReq: "无",
      lateLiability: "逾期按 0.05%/日 计违约金。",
      startDate: daysFromNow(-10),
      endDate: daysFromNow(355),
      createdById: lily.id,
    },
  });

  // Pre-create review rows for the in-review contract.
  const reviewFields = [
    "partyA",
    "accountingPeriod",
    "feeCycle",
    "feeAmount",
    "commissionRate",
    "affiliateRule",
    "paymentCycle",
    "invoiceReq",
    "lateLiability",
    "contractPeriod",
    "remark",
  ];
  for (const c of [c1]) {
    await prisma.contractFieldReview.createMany({
      data: reviewFields.map((f) => ({
        contractId: c.id,
        fieldName: f,
        decision: "APPROVED",
        reviewerId: shallow.id,
      })),
    });
  }

  // ---- Tasks ------------------------------------------------------------
  let order = 0;
  const taskSeed = [
    {
      title: "AuroraTech Demo方案制定",
      description: "为 AuroraTech 输出联盟推广 Demo 方案",
      customerId: auroratech.id,
      ownerId: tom.id,
      publisherId: lily.id,
      priority: "HIGH",
      category: "DEMO_PLAN",
      status: "DONE",
      dueDate: daysFromNow(-5),
    },
    {
      title: "客户会议预约 · AuroraTech",
      description: "与 AuroraTech 预约启动会议，确定时间与参会人员",
      customerId: auroratech.id,
      ownerId: lily.id,
      publisherId: lily.id,
      priority: "MID",
      category: "MEETING_BOOKING",
      status: "DONE",
      meetingTime: daysFromNow(2),
      meetingMode: "ONLINE",
      attendees: JSON.stringify([lily.id, tom.id]),
      dueDate: daysFromNow(1),
    },
    {
      title: "PetJoy Demo方案制定",
      description: "宠物用品德国/加拿大站冷启动方案",
      customerId: petjoy.id,
      ownerId: tom.id,
      publisherId: lily.id,
      priority: "URGENT",
      category: "DEMO_PLAN",
      status: "REVIEW",
      dueDate: daysFromNow(1),
    },
    {
      title: "客户会议预约 · PetJoy",
      description: "预约 PetJoy 客户会议",
      customerId: petjoy.id,
      ownerId: lily.id,
      publisherId: lily.id,
      priority: "MID",
      category: "MEETING_BOOKING",
      status: "TODO",
      dueDate: daysFromNow(3),
    },
    {
      title: "FitCore Demo方案制定",
      description: "健身器材独立站红人推广方案",
      customerId: fitcore.id,
      ownerId: lily.id,
      publisherId: lily.id,
      priority: "MID",
      category: "DEMO_PLAN",
      status: "IN_PROGRESS",
      dueDate: daysFromNow(5),
    },
    {
      title: "GreenLeaf 联盟商初筛",
      description: "从 LTK / Levanta 筛选 20 个家居类联盟商",
      customerId: greenleaf.id,
      ownerId: tom.id,
      publisherId: lily.id,
      priority: "LOW",
      category: "GENERAL",
      status: "TODO",
      dueDate: daysFromNow(7),
    },
  ];
  for (const t of taskSeed) {
    await prisma.task.create({ data: { ...t, sortOrder: order++ } });
  }

  // ---- Reminders --------------------------------------------------------
  await prisma.reminder.createMany({
    data: [
      {
        title: "PetJoy Demo 方案待审核",
        content: "PetJoy 的 Demo 方案已提交，等待审核",
        remindDate: daysFromNow(1),
        type: "REVIEW",
        targetId: lily.id,
        createdById: tom.id,
      },
      {
        title: "CT-2024-002 待审核",
        content: "渠道商合同等待 Shallow 审核",
        remindDate: daysFromNow(0),
        type: "REVIEW",
        targetId: shallow.id,
        createdById: lily.id,
      },
      {
        title: "周一联盟商对接会",
        content: "与 Levanta 渠道经理对接新资源",
        remindDate: daysFromNow(2),
        type: "MEETING",
        targetId: tom.id,
        createdById: lily.id,
      },
    ],
  });

  // ---- Affiliates (new schema — fields match 资源库字段.xlsx) ---------------
  const affiliateSeed = [
    {
      platformAffiliateName: "@home_with_anna",
      internalAffiliateName: "Anna KOL Group",
      source: "LTK",
      category: "Publisher",
      affiliateType: "内容型网红 Content KOL",
      tags: JSON.stringify(["独立站", "Amazon", "推广形式-测评", "女性向"]),
      instagramLink: "https://instagram.com/home_with_anna",
      insFollowers: 185,
      instagramPlacements: JSON.stringify([{ placement: "Post", flatfee: 800 }, { placement: "Reel", flatfee: 1200 }]),
      youtubeLink: "https://youtube.com/@homewithanna",
      youtubeFollowers: 42,
      youtubePlacements: JSON.stringify([{ placement: "Video", flatfee: 2000 }]),
      ltkLink: "https://ltk.com/@home_with_anna",
      ltkFlatfee: 500,
      developmentStatus: "合作中 In Collaboration",
      cooperationMode: JSON.stringify(["flatfee", "佣金+flatfee"]),
      sampleShipping: "是",
      personInChargeId: lily.id,
    },
    {
      platformAffiliateName: "DealNews",
      internalAffiliateName: "DealNews Group",
      source: "ACC",
      category: "Publisher",
      affiliateType: "折扣(Coupon&Deals）",
      tags: JSON.stringify(["折扣细分-折扣网站Deal website"]),
      websiteLink: "https://dealnews.com",
      websiteTraffic: 2400,
      websitePlacements: JSON.stringify([{ placement: "坑位", flatfee: 1500 }, { placement: "Newsletter", flatfee: 800 }]),
      developmentStatus: "沟通中 In Discussion",
      cooperationMode: JSON.stringify(["纯佣"]),
      personInChargeId: tom.id,
    },
    {
      platformAffiliateName: "@fitlife_mike",
      internalAffiliateName: "Anna KOL Group",
      source: "Levanta",
      category: "Publisher",
      affiliateType: "内容型网红 Content KOL",
      tags: JSON.stringify(["Amazon", "男性向", "推广形式-测评"]),
      tiktokLink: "https://tiktok.com/@fitlife_mike",
      tiktokFollowers: 92,
      tiktokPlacements: JSON.stringify([{ placement: "Video", flatfee: 500 }]),
      instagramLink: "https://instagram.com/fitlife_mike",
      insFollowers: 45,
      instagramPlacements: JSON.stringify([{ placement: "Reel", flatfee: 400 }]),
      amazonStorefrontLink: "https://amazon.com/shop/fitlife_mike",
      topCreator: "是",
      storefrontFlatfee: 1000,
      developmentStatus: "待开发 Not Yet Contacted",
      personInChargeId: lily.id,
    },
    {
      platformAffiliateName: "MediaBuy Pro",
      source: "PartnerBoost",
      category: "Network",
      affiliateType: "广告投放型Media Buyer",
      tags: JSON.stringify(["推广渠道-Meta广告", "推广渠道-Google广告"]),
      developmentStatus: "合作中 In Collaboration",
      cooperationMode: JSON.stringify(["纯佣"]),
      personInChargeId: tom.id,
    },
    {
      platformAffiliateName: "@beauty_by_sophie",
      internalAffiliateName: "Sophie Beauty KOL",
      source: "LTK",
      category: "Publisher",
      affiliateType: "内容型网红 Content KOL",
      tags: JSON.stringify(["独立站", "女性向", "推广形式-测评", "AMZ Top Creator"]),
      instagramLink: "https://instagram.com/beauty_by_sophie",
      insFollowers: 240,
      instagramPlacements: JSON.stringify([{ placement: "Post", flatfee: 1200 }, { placement: "Story", flatfee: 400 }]),
      ltkLink: "https://ltk.com/@beauty_by_sophie",
      ltkFlatfee: 800,
      amazonStorefrontLink: "https://amazon.com/shop/beautybysophie",
      topCreator: "是",
      storefrontFlatfee: 1500,
      developmentStatus: "搁置",
      cooperationMode: JSON.stringify(["flatfee"]),
      sampleShipping: "是",
      personInChargeId: lily.id,
    },
  ];
  for (const a of affiliateSeed) {
    await prisma.affiliate.create({ data: a });
  }

  // ---- Sales data -------------------------------------------------------
  const batch = await prisma.salesBatch.create({
    data: {
      fileName: "联盟推广销售数据_2024Q2.xlsx",
      uploaderId: tom.id,
      recordCount: 0,
    },
  });

  const brands = ["AuroraTech", "GreenLeaf Home", "PetJoy"];
  const platforms = [
    "Amazon Creator Connection",
    "PartnerBoost",
    "Levanta",
    "EXON",
    "Brainjolt",
  ];
  const programs = [
    "ACC Associate",
    "平台 Attribution",
    "直接合作 Associate",
  ];
  const regions = ["US", "UK", "DE"];
  const stores = ["旗舰店-US", "海外旗舰店-UK", "DE-Store"];
  const affNames = [
    "@home_with_anna",
    "DealNews",
    "@fitlife_mike",
    "@beauty_by_sophie",
    "MediaBuy Pro",
    "slickdeals",
  ];
  const affTypes = [
    "内容型网红 Content KOL",
    "折扣(Coupon&Deals)",
    "广告投放型 Media Buyer",
    "网红聚合平台 Influencer Platform",
  ];

  const records = [];
  for (let i = 0; i < 200; i++) {
    const revenue = Math.round((Math.random() * 4000 + 200) * 100) / 100;
    const rate = [8, 10, 12, 15, 18][Math.floor(Math.random() * 5)] / 100;
    const commission = Math.round(revenue * rate * 100) / 100;
    const unitsSold = Math.floor(Math.random() * 30) + 1;
    const clicks = Math.floor(Math.random() * 200) + unitsSold * 3;
    const addToCarts = Math.floor(clicks * (0.1 + Math.random() * 0.3));
    const platformFee = Math.round(revenue * 0.025 * 100) / 100;
    const totalFee = Math.round((commission + platformFee) * 100) / 100;
    records.push({
      batchId: batch.id,
      affiliatePlatform: platforms[i % platforms.length],
      affiliateProgram: programs[i % programs.length],
      store: stores[i % stores.length],
      asin: `B0${Math.floor(Math.random() * 9000000 + 1000000)}`,
      brand: brands[i % brands.length],
      affiliateName: affNames[i % affNames.length],
      affiliateType: affTypes[i % affTypes.length],
      region: regions[i % regions.length],
      orderDate: daysFromNow(-Math.floor(Math.random() * 120)),
      orders: Math.max(1, Math.floor(unitsSold * 0.8)),
      unitsSold,
      revenue,
      commission,
      commissionRate: rate,
      platformFee,
      totalFee,
      clicks,
      addToCarts,
      conversionRate: clicks > 0 ? unitsSold / clicks : 0,
      epc: clicks > 0 ? commission / clicks : 0,
      acos: revenue > 0 ? totalFee / revenue : 0,
    });
  }
  await prisma.salesRecord.createMany({ data: records });
  await prisma.salesBatch.update({
    where: { id: batch.id },
    data: { recordCount: records.length },
  });

  // ASIN 映射演示数据
  await prisma.asinMapping.createMany({
    data: brands.flatMap((brand) =>
      stores.flatMap((store) =>
        regions.map((region) => ({
          brand,
          store,
          region,
          asin: `B0${Math.floor(Math.random() * 9000000 + 1000000)}`,
          parentAsin: `B0P${Math.floor(Math.random() * 900000 + 100000)}`,
          storeProductLabel: `${brand}-${store}-${region}-主推`,
        })),
      ),
    ),
  });

  console.log(
    `Done. ${customers.length} customers, ${records.length} sales records.`,
  );
  console.log(
    "Login: admin@demo.com / admin123  |  lily@demo.com / user123  |  shallow@demo.com / user123",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
