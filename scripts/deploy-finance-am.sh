#!/usr/bin/env bash
# Run manually on the production host AFTER the expected commit has been pulled.
set -Eeuo pipefail
trap 'echo "Deployment stopped. Preserve this output; do not reset the database or restart blindly."' ERR
cd /root/www
test "$(git rev-parse HEAD)" = "${1:?Pass the approved full commit hash}"
export NODE_ENV=production
command -v flock >/dev/null
command -v python3 >/dev/null
command -v crontab >/dev/null
tail -n 10 backups/backup.log

# Refuse missing databases. Never let migrate create an accidental empty database.
node <<'CHECK'
const fs=require('fs'),path=require('path');
require('@next/env').loadEnvConfig(process.cwd());
const {resolveSqlitePath}=require('./scripts/sqlite-backup-utils');
for(const [key,dir] of [['DATABASE_URL','prisma'],['PROJECT_DATA_DATABASE_URL','prisma-projects']]){
  const file=resolveSqlitePath(process.env[key],path.resolve(dir));
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()||!fs.statSync(file).size)throw Error(key+' database missing or empty');
}
if(!process.env.PROJECT_DATA_BACKUP_DIR)throw Error('Project backup directory not configured');
CHECK

pm2 stop thrive-hub
pm2 status thrive-hub
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const a=JSON.parse(s).find(x=>x.name==="thrive-hub");if(!a||a.pm2_env.status!=="stopped")process.exit(1);});'

# Existing build scripts create verified DB backups BEFORE each database migration.
npm run build

# Compare all old main-db tables with the freshly created pre-migration backup.
BASELINE="$(node <<'PATHS'
const fs=require('fs'),path=require('path');
const files=fs.readdirSync('backups').filter(n=>/^dev_pre_deploy_\d{8}_\d{6}(?:_\d{3})?\.db$/.test(n)).sort();
if(!files.length)throw Error('Pre-deploy backup missing');
console.log(path.resolve('backups',files.at(-1)));
PATHS
)"
CURRENT="$(node <<'PATHS'
require('@next/env').loadEnvConfig(process.cwd());
console.log(require('./scripts/sqlite-backup-utils').resolveSqlitePath(process.env.DATABASE_URL,require('path').resolve('prisma')));
PATHS
)"
python3 scripts/verify-finance-am-migration.py "$BASELINE" "$CURRENT"

# Generate a dedicated cron key without printing it; preserve the previous env.
node <<'CONFIG'
const fs=require('fs'),crypto=require('crypto');
require('@next/env').loadEnvConfig(process.cwd());
if((process.env.CONTRACT_AM_CRON_SECRET||'').trim().length<32){
  const file='/root/www/.env',old=fs.readFileSync(file,'utf8');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync('/root/www/backups/env_finance_am_'+stamp,old,{mode:0o600,flag:'wx'});
  const line='CONTRACT_AM_CRON_SECRET='+crypto.randomBytes(32).toString('hex');
  const text=/^CONTRACT_AM_CRON_SECRET=.*$/m.test(old)?old.replace(/^CONTRACT_AM_CRON_SECRET=.*$/m,line):old.replace(/\s*$/,'')+'\n'+line+'\n';
  fs.writeFileSync(file,text,{mode:0o600});fs.chmodSync(file,0o600);
}
CONFIG

pm2 restart thrive-hub --update-env
pm2 status thrive-hub
HTTP_CODE="$(curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-connrefused --max-time 10 -o /dev/null -w '%{http_code}' http://localhost:3000/login)"
test "$HTTP_CODE" = 200

# Preserve every existing cron entry; install only this idempotent scanner.
CRON_FILE="$(mktemp /root/www/backups/cron_finance_am_XXXXXX)"
chmod 600 "$CRON_FILE"
crontab -l > "$CRON_FILE"
cp "$CRON_FILE" "${CRON_FILE}.before"
if ! grep -Fq '/root/www/scripts/contract-am-cron.cjs' "$CRON_FILE"; then
  printf '\n*/5 * * * * /usr/bin/flock -n /tmp/thrive-contract-am.lock /bin/sh -c '\''cd /root/www && /usr/bin/env node scripts/contract-am-cron.cjs'\'' >> /root/www/backups/contract-am-cron.log 2>&1\n' >> "$CRON_FILE"
  crontab "$CRON_FILE"
fi
echo 'Deployment succeeded: login HTTP 200; AM cron installed. Existing cron entries preserved.'
