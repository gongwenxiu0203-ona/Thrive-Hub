PRAGMA writable_schema=ON;

UPDATE sqlite_schema
SET sql = replace(sql, '"customerId" TEXT NOT NULL', '"customerId" TEXT')
WHERE type = 'table' AND name = 'Contract';

PRAGMA writable_schema=OFF;
