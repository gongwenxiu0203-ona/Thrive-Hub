const { spawnSync } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

function resolveSqlitePath(databaseUrl, schemaDir) {
  if (!databaseUrl?.startsWith("file:")) return null;
  const value = decodeURIComponent(databaseUrl.slice(5).split("?")[0]);
  return path.isAbsolute(value) ? value : path.resolve(schemaDir, value);
}

function sqliteCommand(databasePath, commands) {
  return spawnSync("sqlite3", [databasePath, ...commands], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function verifyWithNodeSqlite(databasePath) {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const row = database.prepare("PRAGMA integrity_check;").get();
      return Object.values(row ?? {})[0] === "ok";
    } finally {
      database.close();
    }
  } catch {
    return false;
  }
}

function verifySqlite(databasePath) {
  const check = sqliteCommand(databasePath, ["PRAGMA integrity_check;"]);
  if (!check.error && check.status === 0) return check.stdout.trim() === "ok";
  if (check.error?.code === "ENOENT") return verifyWithNodeSqlite(databasePath);
  return false;
}

function createVerifiedSqliteBackup(sourcePath, finalPath) {
  const source = fs.statSync(sourcePath);
  if (!source.isFile() || source.size <= 0) throw new Error(`SQLite source is missing or empty: ${sourcePath}`);

  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const tempPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    const escapedTempPath = tempPath.replace(/'/g, "''");
    const backup = sqliteCommand(sourcePath, [".timeout 30000", `.backup '${escapedTempPath}'`]);
    if (backup.error?.code === "ENOENT") {
      // Local Windows development may not provide the sqlite3 CLI. The
      // production host does; a copied fallback is still integrity-checked.
      fs.copyFileSync(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
    } else if (backup.error || backup.status !== 0) {
      throw new Error(`SQLite backup command failed: ${(backup.stderr || backup.error?.message || "unknown error").trim()}`);
    }

    if (!verifySqlite(tempPath)) throw new Error("SQLite backup integrity_check failed");
    fs.renameSync(tempPath, finalPath);
    return fs.statSync(finalPath).size;
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

function pruneBackupsExcept(directory, filePattern, keepPath) {
  const keepName = path.basename(keepPath);
  let removedCount = 0;
  const failures = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !filePattern.test(entry.name) || entry.name === keepName) continue;
    try {
      fs.unlinkSync(path.join(directory, entry.name));
      removedCount += 1;
    } catch (error) {
      failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { removedCount, failures };
}

module.exports = {
  createVerifiedSqliteBackup,
  pruneBackupsExcept,
  resolveSqlitePath,
};
