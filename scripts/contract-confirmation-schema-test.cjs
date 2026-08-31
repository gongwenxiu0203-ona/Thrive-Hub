/* Creates disposable EMPTY SQLite fixtures only; never opens the application DB. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "thrive-sow-schema-"));
const beforeSchema = path.join(fixtureDir, "before.prisma");
const fixtureDb = path.join(fixtureDir, "fixture.db");
const migrationFile = path.join(root, "prisma/migrations/20260831150000_contract_confirmation_foundation/migration.sql");
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${exe} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
};
// Pin the pre-migration revision so this regression still works after committing
// the new schema. A shallow checkout must fetch this historical revision first.
const baselineRef = "4bb722f90b37f099052e7f1922efefef13971701";
fs.writeFileSync(beforeSchema, run("git", ["show", `${baselineRef}:prisma/schema.prisma`]));
const env = { ...process.env, DATABASE_URL: `file:${fixtureDb.replaceAll("\\", "/")}` };
const prisma = (...args) => run(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), ...args], { env });
const baselineSql = prisma("migrate", "diff", "--from-empty", "--to-schema-datamodel", beforeSchema, "--script");
const migration = fs.readFileSync(migrationFile, "utf8");
assert.doesNotMatch(migration.replace(/--[^\n]*/g, ""), /\b(DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE)\b/i);
const db = new DatabaseSync(fixtureDb);
db.exec("PRAGMA foreign_keys = ON");
db.exec(baselineSql);

// Fill mandatory scalar fixture fields; all actual relationships are supplied explicitly.
function insert(table, fields) {
  const value = { ...fields };
  for (const col of db.prepare(`PRAGMA table_info("${table}")`).all()) {
    if (col.notnull && col.dflt_value === null && !(col.name in value)) {
      value[col.name] = /INT|REAL|FLOAT|DOUBLE|DECIMAL|NUMERIC/.test(col.type) ? 0
        : /DATE/.test(col.type) ? 1788134400000 : `${table}-${col.name}-fixture`;
    }
  }
  const keys = Object.keys(value);
  db.prepare(`INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((key) => value[key]));
}
insert("User", { id: "user", email: "sow-fixture@example.invalid" });
insert("Customer", { id: "customer" });
insert("Contract", { id: "contract", contractNo: "LEGACY-FIXTURE", customerId: "customer", createdById: "user", commissionType: "THRESHOLD", commissionRate: "1%" });
insert("CustomerReconciliation", { id: "rec", customerId: "customer", contractId: "contract", createdById: "user", automationKey: "legacy-key", feeAmount: 123, commissionAmount: 456 });
const before = db.prepare('SELECT * FROM "CustomerReconciliation" WHERE id = ?').get("rec");
db.exec(migration);
const classificationMigration = fs.readFileSync(path.join(root, "prisma/migrations/20260831190000_contract_document_classification/migration.sql"), "utf8");
assert.doesNotMatch(classificationMigration.replace(/--[^\n]*/g, ""), /\b(DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE)\b/i);
db.exec(classificationMigration);
assert.equal(db.prepare('SELECT phone FROM "User" WHERE id = ?').get("user").phone, null);
const after = db.prepare('SELECT * FROM "CustomerReconciliation" WHERE id = ?').get("rec");
for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `Legacy field changed: ${key}`);
assert.equal(after.projectConfirmationId, null);
assert.equal(after.ruleSnapshot, null);
assert.equal(db.prepare('SELECT contractMode FROM "Contract" WHERE id = ?').get("contract").contractMode, null);
assert.equal(db.prepare('SELECT commissionType FROM "Contract" WHERE id = ?').get("contract").commissionType, "THRESHOLD");
insert("ContractProjectConfirmation", { id: "sow-a", contractId: "contract", number: "SOW-A", title: "A", createdById: "user" });
insert("ContractProjectConfirmation", { id: "sow-b", contractId: "contract", number: "SOW-B", title: "B", createdById: "user" });
const order = { customerId: "customer", platform: "amazon", storeKey: "shop", orderKey: "order-1", actorId: "user", reason: "test", confirmationId: "sow-a" };
insert("ContractOrderAttribution", { ...order, id: "order-a" });
assert.throws(() => insert("ContractOrderAttribution", { ...order, id: "order-b", confirmationId: "sow-b" }), /UNIQUE/);
insert("ContractOrderAttribution", { ...order, id: "order-c", storeKey: "another-shop", confirmationId: "sow-b" });
assert.throws(() => insert("ContractProjectConfirmation", { id: "sow-c", contractId: "contract", number: "SOW-A", createdById: "user" }), /UNIQUE/);
insert("ContractReceivingAccount", { id: "account-1", contractId: "contract", snapshot: "{}" });
insert("ContractReceivingAccount", { id: "account-2", contractId: "contract", snapshot: "{}", position: 1 });
insert("ContractConfirmationScope", { id: "scope-1", confirmationId: "sow-a", country: "US" });
insert("ContractConfirmationScope", { id: "scope-2", confirmationId: "sow-a", country: "UK", position: 1 });
insert("ContractCustomOption", { id: "option-a", category: "PROGRAM", value: "Custom", normalizedValue: "custom", createdById: "user" });
assert.throws(() => insert("ContractCustomOption", { id: "option-b", category: "PROGRAM", value: "CUSTOM", normalizedValue: "custom", createdById: "user" }), /UNIQUE/);
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
db.close();
prisma("migrate", "diff", "--from-url", env.DATABASE_URL, "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--exit-code");
console.log("PASS: additive migration, legacy row preservation, multiple SOW/accounts/scopes, unique order ownership, FK integrity and zero schema drift");
console.log(`Isolated synthetic fixture retained: ${fixtureDir}`);
