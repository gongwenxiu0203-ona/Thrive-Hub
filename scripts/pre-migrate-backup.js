/**
 * scripts/pre-migrate-backup.js
 *
 * 在 prisma migrate deploy 执行之前自动运行，完成两件事：
 *   1. 检测待执行的迁移中是否含有破坏性 SQL，并打印警告
 *   2. 立即备份当前数据库文件（保存为带时间戳的副本）
 *
 * 集成方式（package.json）：
 *   "build": "prisma generate && node scripts/pre-migrate-backup.js && prisma migrate deploy && next build"
 */

const fs   = require("fs");
const path = require("path");

// ─── 配置 ──────────────────────────────────────────────────────────────────
const DB_PATH      = path.resolve(__dirname, "../prisma/dev.db");
const BACKUP_DIR   = path.resolve(__dirname, "../backups");
const MIGRATE_DIR  = path.resolve(__dirname, "../prisma/migrations");

// SQLite 不存在时跳过（本地无数据库的 CI 环境）
const IS_SQLITE = (process.env.DATABASE_URL ?? "file:./dev.db").startsWith("file:");

// 破坏性 SQL 关键词（大小写不敏感）
const DANGEROUS_PATTERNS = [
  /DROP\s+TABLE/i,
  /DROP\s+COLUMN/i,
  /DELETE\s+FROM/i,
  /TRUNCATE/i,
];

// ─── 工具函数 ───────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function pad(n) { return String(n).padStart(2, "0"); }

function dateTag() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ─── 1. 检测破坏性迁移 ────────────────────────────────────────────────────
function detectDangerousMigrations() {
  if (!fs.existsSync(MIGRATE_DIR)) return [];

  // 读取 _prisma_migrations 表获取已执行的迁移，对比本地迁移文件
  // 简化版：检查所有迁移文件中含破坏性语句的内容并输出
  const warnings = [];

  const folders = fs.readdirSync(MIGRATE_DIR).filter(f =>
    fs.statSync(path.join(MIGRATE_DIR, f)).isDirectory()
  );

  for (const folder of folders) {
    const sqlFile = path.join(MIGRATE_DIR, folder, "migration.sql");
    if (!fs.existsSync(sqlFile)) continue;
    const sql = fs.readFileSync(sqlFile, "utf8");
    const matched = DANGEROUS_PATTERNS.filter(p => p.test(sql));
    if (matched.length > 0) {
      warnings.push({ migration: folder, patterns: matched.map(p => p.source) });
    }
  }

  return warnings;
}

// ─── 2. 备份数据库 ────────────────────────────────────────────────────────
function backupDatabase() {
  if (!IS_SQLITE) {
    console.log("ℹ️  [备份] 非 SQLite 数据库，跳过文件备份（请使用数据库服务的备份功能）");
    return null;
  }

  if (!fs.existsSync(DB_PATH)) {
    console.log("ℹ️  [备份] 数据库文件不存在，跳过备份（首次部署）");
    return null;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const destName = `dev_pre_deploy_${dateTag()}.db`;
  const destPath = path.join(BACKUP_DIR, destName);

  fs.copyFileSync(DB_PATH, destPath);

  const sizeMB = (fs.statSync(destPath).size / 1024).toFixed(0);
  return { destPath, destName, sizeMB };
}

// ─── 主流程 ───────────────────────────────────────────────────────────────
function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       Thrive Hub — 构建前数据库安全检查              ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`⏰ 时间：${timestamp()}\n`);

  // ── 第一步：检测破坏性迁移 ──
  const warnings = detectDangerousMigrations();
  if (warnings.length > 0) {
    console.log("⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  检测到迁移文件中含有【破坏性 SQL 操作】：");
    for (const w of warnings) {
      console.log(`   📁 迁移：${w.migration}`);
      console.log(`   🔴 危险操作：${w.patterns.join(", ")}`);
    }
    console.log("⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   以上迁移可能导致数据不可逆丢失，请确认已获得授权！\n");
  } else {
    console.log("✅ 迁移文件检查通过：未发现破坏性 SQL 操作");
  }

  // ── 第二步：备份数据库 ──
  const backup = backupDatabase();
  if (backup) {
    console.log(`✅ 数据库已备份：${backup.destName}（${backup.sizeMB} KB）`);
    console.log(`   路径：${backup.destPath}`);
  }

  console.log("\n🚀 安全检查完成，继续执行 prisma migrate deploy ...\n");
}

main();
