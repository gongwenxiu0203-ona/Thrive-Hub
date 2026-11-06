"""Read-only, streaming comparison against the immediate stopped-service backup."""
import argparse
import hashlib
import json
import pathlib
import sqlite3


def connect(name):
    path = pathlib.Path(name).resolve(strict=True)
    return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)


def quoted(name):
    return '"' + name.replace('"', '""') + '"'


def fingerprint(db, table):
    digest = hashlib.sha256()
    count = 0
    for row in db.execute("SELECT * FROM " + quoted(table) + " ORDER BY rowid"):
        digest.update(json.dumps(row, ensure_ascii=True, separators=(",", ":"), default=lambda v: v.hex() if isinstance(v, bytes) else str(v)).encode())
        digest.update(b"\n")
        count += 1
    return count, digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    args = parser.parse_args()
    before, after = connect(args.before), connect(args.after)
    try:
        for db in (before, after):
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "Integrity check failed"
            assert not db.execute("PRAGMA foreign_key_check").fetchall(), "Foreign key violations"
        tables = [r[0] for r in before.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        for table in tables:
            if table == "_prisma_migrations":
                continue
            assert before.execute("PRAGMA table_info(" + quoted(table) + ")").fetchall() == after.execute("PRAGMA table_info(" + quoted(table) + ")").fetchall(), "Old columns changed: " + table
            assert fingerprint(before, table) == fingerprint(after, table), "Historical rows changed: " + table
            print("Historical SHA256 matches: " + table, flush=True)
        old_schema = before.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
        current = {(r[0], r[1]): r for r in after.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}
        for row in old_schema:
            assert current.get((row[0], row[1])) == row, "Existing schema changed: " + row[1]
        additions = [r[0] for r in after.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") if r[0] not in tables]
        assert set(additions) == {"FeishuBinding", "FeishuNotificationDelivery"}, "Unexpected added tables"
        for table in additions:
            assert after.execute("SELECT COUNT(*) FROM " + quoted(table)).fetchone()[0] == 0, "Unexpected production test/notification rows"
        previous = before.execute('SELECT * FROM "_prisma_migrations" ORDER BY id').fetchall()
        newer = after.execute('SELECT * FROM "_prisma_migrations" ORDER BY id').fetchall()
        previous_ids = {r[0] for r in previous}
        assert [r for r in newer if r[0] in previous_ids] == previous, "Existing migration history changed"
        added = [r for r in after.execute('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations"') if r[0] not in {x[0] for x in before.execute('SELECT migration_name FROM "_prisma_migrations"')}]
        assert len(added) == 1 and added[0][0] == "20261106120000_feishu_notifications" and added[0][1] and not added[0][2], "Migration did not finish cleanly"
        print("PASS: all historical rows/columns/schema match; integrity/FK OK; only completed Feishu migration and two empty new tables added.", flush=True)
    finally:
        before.close()
        after.close()


if __name__ == "__main__":
    main()
