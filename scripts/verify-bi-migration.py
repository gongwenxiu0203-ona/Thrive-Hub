"""Verify a BI migration on NEW disposable copies; never mutate the source DB.

Usage: python verify-bi-migration.py --source /path/backup.db
  --migration /path/migration.sql --output /path/fresh/trial.db
All output paths must be new. Source may be a verified production backup.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3


def readonly(path):
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)


def new_copy(source, destination):
    if destination.resolve() == source.resolve():
        raise ValueError("Source and trial paths must differ")
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    with readonly(source) as original, sqlite3.connect(destination) as target:
        original.backup(target)


def fingerprint(connection, columns):
    projection = ",".join('"' + name.replace('"', '""') + '"' for name in columns)
    digest = hashlib.sha256()
    count = 0
    for row in connection.execute(f'SELECT {projection} FROM "SalesRecord" ORDER BY "id"'):
        digest.update(json.dumps(row, ensure_ascii=True, separators=(",", ":")).encode())
        digest.update(b"\n")
        count += 1
    sums = connection.execute(
        'SELECT TOTAL(revenue),TOTAL(commission),TOTAL(unitsSold),TOTAL(totalFee) FROM "SalesRecord"'
    ).fetchone()
    return {"records": count, "old_values_sha256": digest.hexdigest(), "totals": sums}


def other_tables(connection):
    names = [row[0] for row in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'SalesRecord' ORDER BY name"
    )]
    return {name: connection.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] for name in names}


def assert_integrity(connection):
    assert connection.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "Integrity check failed"
    assert not connection.execute("PRAGMA foreign_key_check").fetchall(), "Foreign-key errors"


def verify(source, migration, output):
    rollback = output.with_name(output.stem + ".rollback.db")
    manifest = output.with_suffix(".manifest.json")
    if any(path.exists() for path in (output, rollback, manifest)):
        raise ValueError("Verification outputs already exist; choose a new output path")
    sql = migration.read_text(encoding="utf-8")
    assert 'DROP TABLE "SalesRecord";' in sql
    assert "BEGIN IMMEDIATE;" in sql and "COMMIT;" in sql, "Migration must be transactional"
    with readonly(source) as original:
        assert_integrity(original)
        columns = [row[1] for row in original.execute('PRAGMA table_info("SalesRecord")')]
        baseline = fingerprint(original, columns)
        other_counts = other_tables(original)
        indexes = {row[0] for row in original.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='SalesRecord'")}
        triggers = original.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='SalesRecord' ORDER BY name").fetchall()

    new_copy(source, output)
    with sqlite3.connect(output) as trial:
        try:
            trial.executescript(sql)
        except BaseException:
            trial.rollback()
            raise
        assert_integrity(trial)
        assert fingerprint(trial, columns) == baseline, "Historical BI values changed"
        assert other_tables(trial) == other_counts, "Other business tables changed"
        new_indexes = {row[0] for row in trial.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='SalesRecord'")}
        assert indexes.issubset(new_indexes), "Existing indexes were lost"
        assert trial.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='SalesRecord' ORDER BY name").fetchall() == triggers, "Existing triggers changed"
        metadata = {row[1]: row for row in trial.execute('PRAGMA table_info("SalesRecord")')}
        for name in ("publisherId", "publisherUrl", "lockDate", "lockStatus", "unitsSold", "conversionRate"):
            assert name in metadata and metadata[name][3] == 0, f"{name} must be nullable"
        assert trial.execute('SELECT COUNT(*) FROM "SalesRecord" WHERE "publisherId" IS NOT NULL OR "publisherUrl" IS NOT NULL OR "lockDate" IS NOT NULL OR "lockStatus" IS NOT NULL').fetchone()[0] == 0

    # Simulate a failure at the riskiest point: after dropping the old table,
    # before renaming its fully copied replacement. ROLLBACK must restore it.
    new_copy(source, rollback)
    failed_sql = sql.replace('DROP TABLE "SalesRecord";', 'DROP TABLE "SalesRecord";\nSELECT * FROM "__forced_bi_rollback_failure__";', 1)
    with sqlite3.connect(rollback) as failed:
        try:
            failed.executescript(failed_sql)
            raise AssertionError("Failure injection did not fail")
        except sqlite3.OperationalError as error:
            assert "__forced_bi_rollback_failure__" in str(error)
            assert failed.in_transaction, "Failure was outside protected transaction"
            failed.rollback()
        assert_integrity(failed)
        assert fingerprint(failed, columns) == baseline, "Rollback lost historical data"
        assert other_tables(failed) == other_counts
        assert [row[1] for row in failed.execute('PRAGMA table_info("SalesRecord")')] == columns
        assert not failed.execute("SELECT name FROM sqlite_master WHERE name='new_SalesRecord'").fetchall()

    result = {"source": str(source), "trial": str(output), "baseline": baseline,
              "historical_values_unchanged": True, "other_table_counts_unchanged": True,
              "rollback_after_drop_verified": True, "integrity": "ok", "foreign_key_errors": 0}
    with manifest.open("x", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--migration", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    verify(args.source, args.migration, args.output)
