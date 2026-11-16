import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveApplicableChannelRule } from '../src/lib/channelRuleSelection';
async function main() {
  const dir = path.resolve('backups/finance-am-workflow-20261112-01');
  const target = path.join(dir, `channel-rules-${randomUUID()}.db`);
  fs.copyFileSync(path.join(dir, 'engine.db'), target, fs.constants.COPYFILE_EXCL);
  process.env.DATABASE_URL = 'file:' + target.replaceAll('\\', '/');
  process.env.FEISHU_NOTIFY_ENABLED = 'false';
  const { prisma: db } = await import('../src/lib/prisma');
  try {
    const customer = await db.customer.create({ data: { brandName: `Fictional channel rules ${randomUUID()}` } });
    const actor = await db.user.create({ data: { name: 'Fictional rule tester', email: `channel-${randomUUID()}@example.invalid`, passwordHash: 'not-login', role: 'ADMIN' } });
    const createContract = (type: string) => db.contract.create({ data: { createdById: actor.id, contractNo: `FIXTURE-${randomUUID()}`, customerId: customer.id, type, status: 'COMPLETED', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } });
    const brand = await createContract('BRAND'), channel = await createContract('CHANNEL');
    const defaults = { customerId: customer.id, ruleType: 'A', splitEndDate: new Date('2026-12-31'), fixedFeeRate: .3 };
    const fallback = await db.channelSplitRule.create({ data: defaults });
    const input = { customerId: customer.id, businessContractId: brand.id, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30') };
    assert.equal((await resolveApplicableChannelRule(db, input))?.id, fallback.id);
    const actual = await db.channelSplitRule.create({ data: { ...defaults, contractId: channel.id, commissionThresholdAmount: 5000, commissionBelowRate: .1, commissionAtOrAboveRate: .2 } });
    const selected = await db.$transaction(tx => resolveApplicableChannelRule(tx, input));
    assert.equal(selected?.id, actual.id); assert.equal(selected?.contract?.contractNo, channel.contractNo);
    assert.equal(selected?.commissionThresholdAmount, 5000);
    const other = await createContract('CHANNEL');
    await db.channelSplitRule.create({ data: { ...defaults, contractId: other.id } });
    await assert.rejects(resolveApplicableChannelRule(db, input), /多份/);
    await db.contract.update({ where: { id: other.id }, data: { status: 'TERMINATED' } });
    assert.equal((await resolveApplicableChannelRule(db, input))?.id, actual.id);
    await db.contract.update({ where: { id: channel.id }, data: { deletedAt: new Date() } });
    assert.equal((await resolveApplicableChannelRule(db, input))?.id, fallback.id);
    assert.equal((await db.$queryRawUnsafe<{integrity_check:string}[]>('PRAGMA integrity_check'))[0].integrity_check, 'ok');
    assert.equal((await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')).length, 0);
    console.log('PASS: real SQLite rule lookup + transaction, custom threshold/source contract, conflict/terminated/deleted fallback and DB integrity; new fictional isolated copy only.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
