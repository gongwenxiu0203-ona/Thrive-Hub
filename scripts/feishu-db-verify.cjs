// Local isolated migration rehearsal. Never opens the source for writing.
const { DatabaseSync, backup } = require('node:sqlite');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../backups/feishu-notify-20261106-02');
const source = path.resolve(__dirname, '../backups/finance-payee-20261103-01/engine.db');
const before = path.join(dir, 'before.db');
const engine = path.join(dir, 'engine.db');
function digest(file) {
  const db = new DatabaseSync(file, {readOnly:true});
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().filter(r=>r.name!=='_prisma_migrations'&&!r.name.startsWith('Feishu')).map(({name})=>{
      const quoted='"'+name.replaceAll('"','""')+'"';
      const rows=db.prepare('SELECT * FROM '+quoted+' ORDER BY rowid').all();
      return [name,{count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];
    }));
  } finally {db.close();}
}
async function main() {
  if(process.argv[2]==='prepare') {
    assert.ok(!fs.existsSync(dir),'Refusing to overwrite any previous backup');
    fs.mkdirSync(dir,{recursive:true});
    const db=new DatabaseSync(source,{readOnly:true});
    try {await backup(db,before);} finally {db.close();}
    digest(before);
    const b=new DatabaseSync(before,{readOnly:true});
    try {await backup(b,engine);} finally {b.close();}
    console.log('Verified backup and isolated engine created: '+dir);
  } else if(process.argv[2]==='fault') {
    const failed=path.join(dir,'fault-rehearsal.db');
    assert.ok(!fs.existsSync(failed),'Refusing to overwrite a prior rehearsal');
    const sourceDb=new DatabaseSync(before,{readOnly:true});
    try {await backup(sourceDb,failed);} finally {sourceDb.close();}
    const db=new DatabaseSync(failed);
    try {
      const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261106120000_feishu_notifications/migration.sql'),'utf8');
      assert.throws(()=>db.exec(sql.replace('COMMIT;','INTENTIONALLY_INVALID_TEST_SQL;')));
      db.exec('ROLLBACK;');
      assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'Feishu%'").get().n,0);
    } finally {db.close();}
    assert.deepEqual(digest(failed),digest(before));
    console.log('Simulated migration failure fully rolled back; historical rows match; no real DB touched.');
  } else if(process.argv[2]==='verify') {
    assert.deepEqual(digest(engine),digest(before),'Historical business data changed');
    const db=new DatabaseSync(engine,{readOnly:true});
    try {
      for(const table of ['FeishuBinding','FeishuNotificationDelivery']) assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0);
    } finally {db.close();}
    console.log('All historical tables/columns/rows match SHA256; integrity/FK OK; new notification tables empty.');
  } else throw Error('Usage: node scripts/feishu-db-verify.cjs prepare|verify|fault');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
