#!/bin/bash
set -euo pipefail

PROJECT_DIR="/root/www"
DB_PATH="$PROJECT_DIR/prisma/dev.db"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/dev_daily_${TIMESTAMP}.db"

if [ ! -s "$DB_PATH" ]; then
  echo "[$(date '+%F %T %z')] ERROR source database missing or empty: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
umask 077

sqlite3 "$DB_PATH" ".timeout 30000" ".backup '$BACKUP_PATH'"

if [ ! -s "$BACKUP_PATH" ]; then
  echo "[$(date '+%F %T %z')] ERROR backup missing or empty: $BACKUP_PATH" >&2
  exit 1
fi

INTEGRITY="$(sqlite3 "$BACKUP_PATH" 'PRAGMA integrity_check;')"
if [ "$INTEGRITY" != "ok" ]; then
  echo "[$(date '+%F %T %z')] ERROR integrity_check failed for $BACKUP_PATH: $INTEGRITY" >&2
  exit 1
fi

chmod 600 "$BACKUP_PATH"
SIZE="$(stat -c '%s' "$BACKUP_PATH")"
echo "[$(date '+%F %T %z')] OK backup=$BACKUP_PATH bytes=$SIZE integrity=ok"

# Preserve the existing daily 03:00 full-backup flow, but remove daily
# snapshots older than five complete days. Pre-deploy snapshots are managed
# separately by scripts/pre-migrate-backup.js.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'dev_daily_*.db' -mtime +5 -delete
