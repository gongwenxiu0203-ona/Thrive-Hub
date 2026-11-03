const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const { createHash } = require('node:crypto');

async function main() {
  const sourcePath = process.argv[2];
  const destination = process.argv[3];
  if (!sourcePath || !destination) throw new Error('Usage: node verify-finance-payee-migration.cjs SOURCE NEW_DIRECTORY');
  if (fs.existsSync(destination)) throw new Error('Refusing to overwrite an existing directory');
  fs.mkdirSync(destination, { recursive: true });
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const backupPath = path.join(destination, 'before.db');
  await backup(source, backupPath);
  source.close();
  const before = new DatabaseSync(backupPath, { readOnly: true });
  if (Object.values(before.prepare('PRAGMA integrity_check').get())[0] !== 'ok') throw new Error('Backup integrity failed');
  const workPath = path.join(destination, 'preview.db');
  await backup(before, workPath);
  const work = new DatabaseSync(workPath);
  const fingerprint = db => {
    const hash = createHash('sha256');
    for (const { name } of before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      const safe = name.replaceAll('"', '""');
      const cols = before.prepare(`PRAGMA table_info("${safe}")`).all().map(row => '"'+row.name.replaceAll('"','""')+'"').join(',');
      const rows = db.prepare(`SELECT ${cols} FROM "${safe}"`).all().map(row => JSON.stringify(row)).sort();
      hash.update(name + JSON.stringify(rows));
    }
    return hash.digest('hex');
  };
  const oldHash = fingerprint(before);
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261103120000_finance_payee_holder_fields/migration.sql'), 'utf8');
  if (/DROP|DELETE|TRUNCATE/i.test(sql)) throw new Error('Unexpected destructive SQL');
  work.exec('BEGIN IMMEDIATE');
  try { work.exec(sql); work.exec('COMMIT'); } catch (error) { work.exec('ROLLBACK'); throw error; }
  if (fingerprint(work) !== oldHash) throw new Error('Historical fields changed');
  if (Object.values(work.prepare('PRAGMA integrity_check').get())[0] !== 'ok' || work.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database integrity failed');
  if (work.prepare('SELECT count(*) AS n FROM FinanceAccountProfile WHERE accountHolderType IS NOT NULL OR accountHolderMobile IS NOT NULL OR accountHolderEmail IS NOT NULL').get().n) throw new Error('Unexpected historical backfill');
  console.log(JSON.stringify({ backupPath, workPath, historicalFingerprint: oldHash, historicalDataUnchanged: true, integrity: 'ok' }));
  work.close(); before.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
