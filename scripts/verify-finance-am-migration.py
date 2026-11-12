"""Read-only verification: old rows/schema unchanged, only four additive workflow tables."""
import hashlib
import json
import pathlib
import sqlite3
import sys

EXPECTED = {"ContractAMAssignment", "ContractAMMonthlyDispatch", "FinanceApprovalPolicy", "FinanceRequestRevision"}

def open_readonly(value):
    file = pathlib.Path(value).resolve(strict=True)
    return sqlite3.connect(file.as_uri() + "?mode=ro", uri=True)

def schema(db):
    return dict(db.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))

def fingerprint(db, table, omit_new_migration=False):
    quoted = '"' + table.replace('"', '""') + '"'
    # Production BI can exceed 1 GB. Stream in indexed primary-key order rather
    # than materializing/sorting the entire table in Python memory.
    columns = db.execute("PRAGMA table_info(" + quoted + ")").fetchall()
    primary = [col[1] for col in sorted(columns, key=lambda col: col[5]) if col[5]]
    order = primary or [col[1] for col in columns]
    ordering = ",".join('"' + col.replace('"', '""') + '"' for col in order)
    rows = db.execute("SELECT * FROM " + quoted + " ORDER BY " + ordering)
    names = [col[0] for col in rows.description]
    digest, count = hashlib.sha256(), 0
    for row in rows:
        if omit_new_migration and row[names.index("migration_name")] == "20261112160000_contract_am_finance_workflows":
            continue
        encoded = json.dumps(row, ensure_ascii=False, default=lambda value: value.hex(), separators=(",", ":")).encode()
        digest.update(encoded); digest.update(b"\n"); count += 1
    return digest.hexdigest(), count

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify-finance-am-migration.py BASELINE_DB MIGRATED_DB")
    old, new = open_readonly(sys.argv[1]), open_readonly(sys.argv[2])
    for db in (old, new):
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "integrity failure"
        assert not db.execute("PRAGMA foreign_key_check").fetchall(), "foreign-key failure"
    before, after = schema(old), schema(new)
    assert set(after) - set(before) == EXPECTED, "unexpected added tables"
    assert not set(before) - set(after), "old tables removed"
    for name, definition in before.items():
        assert after[name] == definition, "old table schema changed: " + name
        assert fingerprint(old, name) == fingerprint(new, name, name == "_prisma_migrations"), "old rows changed: " + name
    for name in EXPECTED:
        assert new.execute('SELECT COUNT(*) FROM "' + name + '"').fetchone()[0] == 0, "new table is not empty: " + name
    old.close(); new.close()
    print("PASS: every old table schema and row hash unchanged; only four empty new tables and the new migration added; integrity/FK valid.")

if __name__ == "__main__":
    main()
