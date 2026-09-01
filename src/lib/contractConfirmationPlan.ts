import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { parseEffectiveConfirmation } from "./contractConfirmationDraft";
import { buildConfirmationPeriods } from "./contractConfirmationRules";
import { parseDateOnlyUtc } from "./dateRange";
import { AppError } from "./appError";
import { stat } from "node:fs/promises";
import path from "node:path";
import { frameworkMissingFields } from "./frameworkCompleteness";

async function assertSignedOriginalExists(fileUrl: string) {
  if (!/^\/uploads\/[a-f0-9-]+\.(pdf|docx|doc)$/i.test(fileUrl)) {
    throw new AppError("签署原件路径无效，请重新上传", 400);
  }
  try {
    const info = await stat(path.join(process.cwd(), "uploads", path.basename(fileUrl)));
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new AppError("签署原件不存在或不可读取，请重新上传", 400);
  }
}

/** Called only from a permission-checked server entry. Injectable DB is for isolated tests. */
export async function activateContractConfirmation(
  confirmationId: string, actorId: string, expectedVersion: number, db: PrismaClient | Prisma.TransactionClient = prisma,
  options: { fromDateExclusive?: string; automationNamespace?: string } = {},
) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new AppError("确认书版本无效，请刷新后重试", 409);
  const execute = async (tx: Prisma.TransactionClient) => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
    if (!actor || !["ADMIN", "USER"].includes(actor.role) || actor.status !== "APPROVED") throw new AppError("仅有效内部员工可操作确认书", 403);
    const sow = await tx.contractProjectConfirmation.findUnique({
      where: { id: confirmationId }, include: { contract: { include: { customer: true } } },
    });
    if (!sow || sow.contract.deletedAt || sow.contract.type !== "BRAND") throw new AppError("确认书或所属品牌方合同不存在", 404);
    const contract = sow.contract;
    if (contract.contractMode !== "FRAMEWORK") throw new AppError("旧合同不能直接转为独立确认书计费，请新建主格式合同；历史账单不会自动转换", 400);
    if (contract.status !== "COMPLETED") throw new AppError("主格式合同签署完成后才能生效确认书", 400);
    if (!contract.fileUrl) throw new AppError("主格式合同缺少签署原件，请先上传盖章版", 400);
    await assertSignedOriginalExists(contract.fileUrl);
    const masterAccountCount = await tx.contractReceivingAccount.count({ where: { contractId: contract.id } });
    const masterMissing = frameworkMissingFields(contract, masterAccountCount);
    if (masterMissing.length) throw new AppError(`主格式合同资料不完整：${masterMissing.join("、")}`, 400);
    if (!contract.customerId || contract.customer?.deletedAt || contract.customer?.status !== "COOPERATING") {
      throw new AppError("客户必须处于合作中状态", 400);
    }
    if (sow.status === "EFFECTIVE") return { id: sow.id, created: 0, alreadyEffective: true, version: sow.version };
    if (sow.status !== "DRAFT") throw new AppError("仅草稿确认书可以生效", 409);
    if (sow.version !== expectedVersion) throw new AppError("确认书已被其他人修改，请刷新后核对", 409);
    if (!sow.signedFileUrl) throw new AppError("请先上传已签署项目确认书原件", 400);
    await assertSignedOriginalExists(sow.signedFileUrl);
    const raw = JSON.parse(sow.details);
    if (raw.schemaVersion !== 1) throw new AppError("不支持的确认书版本，不能按旧规则处理", 400);
    const draft = parseEffectiveConfirmation(raw.data);
    if (draft.contractId !== contract.id) throw new AppError("确认书所属合同不一致", 400);
    // Do not silently omit payment schedules we cannot yet generate accurately.
    if (draft.additionalFees.length) throw new AppError("固定项目费及其他费用的付款计划尚需单独配置，请勿按月度费用自动生效", 400);
    const accounts = await tx.financeAccountProfile.findMany({
      where: { id: { in: draft.receivingAccountIds }, status: "ACTIVE", accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] } },
    });
    if (accounts.length !== draft.receivingAccountIds.length) throw new AppError("部分乙方收款账户已停用或不属于公司账户，请重新选择", 400);
    const contractedAccounts = await tx.contractReceivingAccount.findMany({ where: { contractId: contract.id } });
    const allowed = new Set(contractedAccounts.map((account) => account.financeProfileId));
    if (draft.receivingAccountIds.some((id) => !allowed.has(id))) throw new AppError("确认书收款账户必须选自主格式合同约定的账户", 400);
    const periods = buildConfirmationPeriods({
      confirmationId: sow.id, automationNamespace: options.automationNamespace,
      startDate: draft.startDate!, endDate: draft.endDate!,
      fixedFeeEnabled: draft.monthlyFee !== null, commissionEnabled: draft.commission !== null,
    }).filter((period) => !options.fromDateExclusive || period.startDate > options.fromDateExclusive);
    const version = sow.version + 1;
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const ruleSnapshot = JSON.stringify({
      schemaVersion: 1, data: draft, confirmationId: sow.id, confirmationNumber: sow.number, confirmationVersion: version,
      accountSnapshots: draft.receivingAccountIds.map((id) => {
        const account = contractedAccounts.find((item) => item.financeProfileId === id)!;
        return { profileId: id, snapshot: JSON.parse(account.snapshot) };
      }),
    });
    const updated = await tx.contractProjectConfirmation.updateMany({
      where: { id: sow.id, status: "DRAFT", version: expectedVersion },
      data: { status: "EFFECTIVE", effectiveAt: now, version, startDate: parseDateOnlyUtc(draft.startDate!), endDate: parseDateOnlyUtc(draft.endDate!) },
    });
    if (updated.count !== 1) throw new AppError("确认书状态已变动，请刷新后重试", 409);
    await tx.contractConfirmationVersion.create({
      data: { confirmationId: sow.id, version, snapshot: ruleSnapshot, reason: "签署确认书生效，冻结计费条款并独立生成对账", actorId },
    });
    for (const [position, scope] of draft.scopes.entries()) {
      await tx.contractConfirmationScope.create({ data: {
        confirmationId: sow.id, country: scope.country, salesPlatforms: JSON.stringify(scope.salesPlatforms),
        programs: JSON.stringify(scope.programs), thirdPartyPlatforms: JSON.stringify(scope.thirdPartyPlatforms), position,
      } });
    }
    for (const period of periods) {
      const start = parseDateOnlyUtc(period.startDate)!;
      const end = parseDateOnlyUtc(period.endDate)!;
      await tx.customerReconciliation.create({ data: {
        customerId: contract.customerId, contractId: contract.id, projectConfirmationId: sow.id, ruleSnapshot,
        source: "AUTO", automationKey: period.automationKey, periodIndex: period.index,
        periodStart: start, periodEnd: end, originalPeriodStart: start, originalPeriodEnd: end,
        planStatus: period.startDate <= today ? "OPEN" : "PLANNED", openedAt: period.startDate <= today ? now : null,
        partyA: contract.partyA, accountingPeriod: "月度", feeCycle: draft.monthlyFee ? "月度" : "无",
        feeAmount: period.kind === "FIXED_FEE" ? draft.monthlyFee!.amount : 0,
        fixedFeeCurrency: draft.monthlyFee?.currency ?? "USD", commissionCurrency: draft.commission?.currency ?? "USD",
        commissionRate: draft.commission?.mode === "GMV_SERVICE" ? draft.commission.serviceRatePercent! / 100 : 0,
        confirmedCommissionRate: null, commissionAmount: 0, actualCommissionRate: 0,
        reconcileType: period.kind === "FIXED_FEE" ? "FEE_ONLY" : "COMMISSION_ONLY", createdById: actorId,
      } });
    }
    await tx.financeAuditLog.create({ data: {
      entityType: "CONTRACT_CONFIRMATION", entityId: sow.id, action: "ACTIVATE", actorId,
      fromStatus: "DRAFT", toStatus: "EFFECTIVE", note: "确认书独立计费生效",
      metadata: JSON.stringify({ contractId: contract.id, version, generatedRecords: periods.length }),
    } });
    return { id: sow.id, created: periods.length, alreadyEffective: false, version };
  };
  return "$transaction" in db ? db.$transaction(execute, { timeout: 30000 }) : execute(db);
}

export async function activateConfirmationReplacement(
  contractId: string, confirmationId: string, actorId: string, expectedPendingVersion: number,
) {
  const current = await prisma.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId } });
  if (!current || current.status !== "EFFECTIVE") throw new AppError("没有可生效的确认书替换版本", 409);
  if (current.pendingVersion !== expectedPendingVersion || !current.pendingDetails) throw new AppError("替换草稿版本已变更，请刷新后重试", 409);
  if (!current.pendingSignedFileUrl) throw new AppError("请先上传替换版本的签署原件", 400);
  const pending = JSON.parse(current.pendingDetails);
  if (pending.schemaVersion !== 1) throw new AppError("不支持的替换版本格式", 400);
  parseEffectiveConfirmation(pending.data);
  await assertSignedOriginalExists(current.pendingSignedFileUrl);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return prisma.$transaction(async (tx) => {
    const future = await tx.customerReconciliation.findMany({
      where: { projectConfirmationId: confirmationId, deletedAt: null, planStatus: "PLANNED", periodStart: { gt: new Date(`${today}T23:59:59.999Z`) } },
      select: { id: true, automationKey: true },
    });
    for (const row of future) {
      await tx.customerReconciliation.update({ where: { id: row.id }, data: {
        planStatus: "CANCELLED", adjustmentReason: `项目确认书 ${current.number} 替换版本 v${current.version + 1} 生效`,
        automationKey: row.automationKey ? `${row.automationKey}:replaced:v${current.version}` : null,
      } });
    }
    await tx.contractConfirmationScope.deleteMany({ where: { confirmationId } });
    const updated = await tx.contractProjectConfirmation.updateMany({
      where: { id: confirmationId, contractId, status: "EFFECTIVE", pendingVersion: expectedPendingVersion },
      data: {
        status: "DRAFT", details: current.pendingDetails!, signedFileUrl: current.pendingSignedFileUrl,
        pendingDetails: null, pendingSignedFileUrl: null, pendingVersion: 0, effectiveAt: null,
      },
    });
    if (updated.count !== 1) throw new AppError("替换版本已被其他人修改，请刷新后重试", 409);
    const result = await activateContractConfirmation(confirmationId, actorId, current.version, tx, {
      fromDateExclusive: today, automationNamespace: `${confirmationId}:v${current.version + 1}`,
    });
    await tx.financeAuditLog.create({ data: {
      entityType: "CONTRACT_CONFIRMATION", entityId: confirmationId, action: "ACTIVATE_REPLACEMENT", actorId,
      fromStatus: `EFFECTIVE_V${current.version}`, toStatus: `EFFECTIVE_V${current.version + 1}`,
      note: "确认书替换版本签署生效；历史已开账记录保留，未来计划按新版本重建",
      metadata: JSON.stringify({ contractId, previousVersion: current.version, version: current.version + 1, created: result.created }),
    } });
    return result;
  }, { timeout: 30000 });
}

/**
 * “上传已有合同”上传的是已签署的主格式合同 + 项目确认书完整版。
 * 补齐确认书字段后复用该原件并直接生效；模板新建流程不得调用此方法。
 */
export async function finalizeExistingUploadedConfirmation(
  contractId: string, confirmationId: string, actorId: string, expectedVersion: number,
) {
  const row = await prisma.contractProjectConfirmation.findFirst({
    where: { id: confirmationId, contractId },
    include: { contract: { select: { id: true, uploadType: true, status: true, fileUrl: true } } },
  });
  if (!row) throw new AppError("确认书不存在", 404);
  if (row.contract.uploadType !== "EXISTING") return { confirmation: row, activated: false };
  if (row.status === "EFFECTIVE") return { confirmation: row, activated: true };
  if (row.status !== "DRAFT" || row.version !== expectedVersion) throw new AppError("确认书状态或版本已变更，请刷新后重试", 409);
  if (row.contract.status !== "COMPLETED" || !row.contract.fileUrl) throw new AppError("上传已有合同缺少已签署原件，请返回主合同补充", 400);

  const snapshot = JSON.parse(row.details);
  if (snapshot.schemaVersion !== 1) throw new AppError("不支持的确认书版本", 400);
  try {
    parseEffectiveConfirmation(snapshot.data);
  } catch {
    // 草稿允许分次保存；仅当生效必填字段全部齐备后自动完成签署。
    return { confirmation: row, activated: false };
  }

  await assertSignedOriginalExists(row.contract.fileUrl);
  const signedFileUrl = row.contract.fileUrl;
  const linked = await prisma.$transaction(async (tx) => {
    const updated = await tx.contractProjectConfirmation.updateMany({
      where: { id: confirmationId, contractId, status: "DRAFT", version: expectedVersion },
      data: { signedFileUrl, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new AppError("确认书已被其他人修改，请刷新后重试", 409);
    await tx.contractConfirmationVersion.create({
      data: {
        confirmationId,
        version: expectedVersion + 1,
        actorId,
        reason: "上传已有合同字段补齐，复用已签署完整合同原件",
        snapshot: JSON.stringify({ schemaVersion: 1, data: snapshot.data, signedFileUrl, source: "EXISTING_CONTRACT_ORIGINAL" }),
      },
    });
    return tx.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } });
  });
  await activateContractConfirmation(confirmationId, actorId, linked.version);
  return {
    confirmation: await prisma.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } }),
    activated: true,
  };
}

/** Existing records are never rebuilt from live contract terms. */
export async function ensureEffectiveConfirmationPlans(contractId: string, db: PrismaClient = prisma) {
  const count = await db.contractProjectConfirmation.count({ where: { contractId, status: "EFFECTIVE" } });
  return { created: 0, skipped: true, reason: "CONFIRMATION_ACTIVATION_OWNS_PLANS", confirmations: count };
}

/** Service-level unique ownership; callers must enforce feature permission before entering tx. */
export async function assignConfirmationOrder(tx: Prisma.TransactionClient, input: {
  confirmationId: string; customerId: string; platform: string; storeKey: string; orderKey: string; actorId: string; reason: string;
}) {
  const platform = input.platform.normalize("NFKC").trim().toLowerCase();
  const storeKey = input.storeKey.normalize("NFKC").trim().toLowerCase();
  const orderKey = input.orderKey.normalize("NFKC").trim().toLowerCase();
  const reason = input.reason.trim();
  if (![platform, storeKey, orderKey, reason].every(Boolean) || reason.length > 2000) throw new AppError("订单归属信息和确认原因不能为空", 400);
  const confirmation = await tx.contractProjectConfirmation.findUnique({ where: { id: input.confirmationId }, include: { contract: true } });
  if (!confirmation || confirmation.contract.customerId !== input.customerId || confirmation.contract.deletedAt
    || !["EFFECTIVE", "TERMINATED"].includes(confirmation.status)) throw new AppError("订单客户与生效确认书不匹配", 400);
  const row = await tx.contractOrderAttribution.upsert({
    where: { customerId_platform_storeKey_orderKey: { customerId: input.customerId, platform, storeKey, orderKey } },
    create: { ...input, platform, storeKey, orderKey, reason }, update: {},
  });
  if (row.confirmationId !== input.confirmationId) throw new AppError("该订单已归属另一份确认书，不能重复计佣", 409);
  return row;
}
