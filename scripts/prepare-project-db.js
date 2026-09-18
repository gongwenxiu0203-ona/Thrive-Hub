const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  createVerifiedSqliteBackup,
  pruneBackupsExcept,
  resolveSqlitePath,
} = require("./sqlite-backup-utils");

const root = path.resolve(__dirname, "..");
require("@next/env").loadEnvConfig(root);
const schemaDir = path.join(root, "prisma-projects");
if (process.env.NODE_ENV === "production" && !process.env.PROJECT_DATA_DATABASE_URL) {
  throw new Error("Production requires PROJECT_DATA_DATABASE_URL outside the release directory.");
}
const databaseUrl = process.env.PROJECT_DATA_DATABASE_URL || "file:./data/projects.db";
const env = { ...process.env, PROJECT_DATA_DATABASE_URL: databaseUrl };

function databasePath() {
  return resolveSqlitePath(databaseUrl, schemaDir);
}

function ensureAdditiveMigrations() {
  const migrationsDir = path.join(schemaDir, "migrations");
  const destructive = /\b(DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i;
  for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sqlPath = path.join(migrationsDir, entry.name, "migration.sql");
    if (fs.existsSync(sqlPath) && destructive.test(fs.readFileSync(sqlPath, "utf8"))) throw new Error(`Project migration ${entry.name} contains destructive SQL.`);
  }
}

function assertProductionIsolation() {
  if (process.env.NODE_ENV !== "production") return;
  const target = databasePath();
  if (!target) throw new Error("Production PROJECT_DATA_DATABASE_URL must be a file: URL.");
  const relative = path.relative(root, target);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("Production project database must live outside the release directory.");
  }
}

function backup() {
  const source = databasePath();
  if (!source || !fs.existsSync(source)) return;
  const backupRoot = process.env.PROJECT_DATA_BACKUP_DIR;
  if (process.env.NODE_ENV === "production" && !backupRoot) {
    throw new Error("Production requires PROJECT_DATA_BACKUP_DIR outside the release directory.");
  }
  const backupDir = path.resolve(backupRoot || path.join(root, "backups", "projects"));
  if (process.env.NODE_ENV === "production") {
    const relative = path.relative(root, backupDir);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      throw new Error("PROJECT_DATA_BACKUP_DIR must live outside the release directory.");
    }
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destName = `projects_pre_deploy_${stamp}.db`;
  const destPath = path.join(backupDir, destName);
  createVerifiedSqliteBackup(source, destPath);
  const cleanup = pruneBackupsExcept(
    backupDir,
    /^projects_pre_deploy_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/,
    destPath,
  );
  console.log(`Project database backup created: ${destPath}`);
  console.log(`Removed ${cleanup.removedCount} older project pre-deploy backup(s); kept the latest one.`);
  for (const failure of cleanup.failures) console.warn(`Failed to remove old project backup: ${failure}`);
}

function prisma(args) {
  const cli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

ensureAdditiveMigrations();
assertProductionIsolation();
backup();
const targetDatabase = databasePath();
if (targetDatabase) fs.mkdirSync(path.dirname(targetDatabase), { recursive: true });
prisma(["generate", "--schema", "prisma-projects/schema.prisma"]);
prisma(["migrate", "deploy", "--schema", "prisma-projects/schema.prisma"]);
