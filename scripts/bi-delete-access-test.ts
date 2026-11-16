import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveEffectivePermission } from '../src/lib/permissionResolver';

// No queries or writes: check defaults/explicit overrides plus authorization wiring.
const permission = (role: string, level?: string) => resolveEffectivePermission({
  role, feature: 'bi.manage',
  userPermissions: level ? [{ feature: 'bi.manage', level }] : [],
});
assert.equal(permission('ADMIN'), 'MANAGE');
assert.equal(permission('USER'), 'EDIT');
assert.equal(permission('USER', 'NONE'), 'NONE');
assert.equal(permission('USER', 'READ'), 'READ');
assert.equal(permission('BRAND'), 'NONE');
assert.equal(permission('CHANNEL'), 'NONE');
const sales = fs.readFileSync('src/actions/sales.ts', 'utf8').split('export async function deleteBatch')[1].split('export async function')[0];
assert.match(sales, /session\.role !== "ADMIN" && session\.role !== "USER"/);
assert.match(sales, /requireBi\(session\.userId, "EDIT"\)/);
assert.match(sales, /deletedAt: new Date\(\)/);
const clear = fs.readFileSync('src/app/api/sales/clear/route.ts', 'utf8');
assert.match(clear, /!isStaff\(session\.role\)/);
assert.match(clear, /hasBiPermission\(session\.userId, "bi.manage", "EDIT"\)/);
assert.ok(clear.includes('consumeClearConfirmation(body.confirmationToken'));
assert.ok(clear.includes('请至少指定一个筛选条件'));
assert.ok(clear.includes('tx.adminAuditLog.create'));
console.log('PASS: BI deletion permission defaults/deny overrides and server safety wiring; no database writes or actual deletion.');
