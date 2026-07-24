from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DB = (ROOT / "prisma" / "dev.db").resolve()
TARGET_DB = (ROOT / "prisma" / "invoice-migration-isolated-test.db").resolve()
MIGRATION = (
    ROOT
    / "prisma"
    / "migrations"
    / "20260723000000_invoices"
    / "migration.sql"
)


def main() -> None:
    if TARGET_DB == SOURCE_DB:
        raise RuntimeError("Refusing to run against prisma/dev.db")
    if TARGET_DB.exists():
        raise RuntimeError(f"Refusing to overwrite existing test database: {TARGET_DB}")
    if not SOURCE_DB.exists():
        raise RuntimeError(f"Source database does not exist: {SOURCE_DB}")

    shutil.copy2(SOURCE_DB, TARGET_DB)
    connection = sqlite3.connect(TARGET_DB)
    try:
        connection.executescript(MIGRATION.read_text(encoding="utf-8"))
        connection.commit()
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        tables = [
            row[0]
            for row in connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name IN ('Invoice', 'InvoiceItem')
                ORDER BY name
                """
            )
        ]
        index_count = connection.execute(
            """
            SELECT count(*)
            FROM sqlite_master
            WHERE type = 'index' AND name LIKE 'Invoice%'
            """
        ).fetchone()[0]
    finally:
        connection.close()

    print(f"isolated_database={TARGET_DB}")
    print(f"integrity={integrity}")
    print(f"tables={','.join(tables)}")
    print(f"invoice_indexes={index_count}")
    if integrity != "ok" or tables != ["Invoice", "InvoiceItem"]:
        raise RuntimeError("Invoice migration verification failed")


if __name__ == "__main__":
    main()
