import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const TEST_DB_RE = /^security-test-[a-f0-9-]+\.db$/i;

function assertSafeDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Security tests refuse non-SQLite DATABASE_URL values.");
  }

  const rawPath = databaseUrl.slice("file:".length);
  const dbPath = resolve(rawPath);
  const name = basename(dbPath);
  const productionDb = resolve(process.cwd(), "prisma", "dev.db");

  if (!TEST_DB_RE.test(name)) {
    throw new Error(`Security test database must match security-test-*.db; received ${name}.`);
  }
  if (dbPath === productionDb || name.toLowerCase() === "dev.db") {
    throw new Error("Security tests refuse prisma/dev.db and dev.db.");
  }

  return dbPath;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function capture(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}\n${stderr}`));
    });
  });
}

function assertCreateOnlySql(sql: string): void {
  const destructive = /^\s*(DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE)\b/gim;
  const match = destructive.exec(sql);
  if (match) {
    throw new Error(`Security test schema contains forbidden SQL: ${match[0].trim()}`);
  }
  if (!/CREATE\s+TABLE/i.test(sql)) {
    throw new Error("Security test schema did not contain CREATE TABLE statements.");
  }
}

async function findTests(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  }));
  return nested.flat().sort();
}

async function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a security test port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePromise(address.port));
    });
  });
}

async function waitForApp(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // Application is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("Security test application did not become ready within 60 seconds.");
}

async function main() {
  const inherited = process.env.DATABASE_URL;
  if (inherited) assertSafeDatabaseUrl(inherited);

  const testDirectory = await mkdtemp(join(tmpdir(), "thrive-security-test-"));
  const dbPath = join(testDirectory, `security-test-${randomUUID()}.db`);
  const databaseUrl = `file:${dbPath.replace(/\\/g, "/")}`;
  assertSafeDatabaseUrl(databaseUrl);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    JWT_SECRET: `security-test-${randomUUID()}-${randomUUID()}`,
    SECURITY_TEST_DB_PATH: dbPath,
  };
  const prismaCli = resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const schemaSqlPath = join(testDirectory, "security-schema.sql");
  let app: ReturnType<typeof spawn> | null = null;

  try {
    console.log(`[security-test] isolated database: ${dbPath}`);
    const schemaSql = await capture(process.execPath, [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      resolve(process.cwd(), "prisma", "schema.prisma"),
      "--script",
    ], env);
    assertCreateOnlySql(schemaSql);
    await writeFile(schemaSqlPath, schemaSql, "utf8");
    await run(process.execPath, [prismaCli, "db", "execute", "--file", schemaSqlPath, "--url", databaseUrl], env);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    env.SECURITY_TEST_BASE_URL = baseUrl;
    app = spawn(process.execPath, [resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    app.stdout?.on("data", (chunk) => process.stdout.write(`[security-app] ${chunk}`));
    app.stderr?.on("data", (chunk) => process.stderr.write(`[security-app] ${chunk}`));
    await waitForApp(baseUrl);

    const tests = await findTests(resolve(process.cwd(), "tests", "security"));
    if (tests.length === 0) throw new Error("No tests/security/**/*.test.ts files found.");
    await run(process.execPath, [resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "--test", "--test-concurrency=1", ...tests], env);
  } finally {
    if (app && app.exitCode === null) {
      app.kill("SIGTERM");
      await new Promise((resolvePromise) => {
        const timer = setTimeout(resolvePromise, 5_000);
        app?.once("exit", () => { clearTimeout(timer); resolvePromise(undefined); });
      });
    }
    if (process.env.KEEP_SECURITY_TEST_DB === "1") {
      console.log(`[security-test] preserved by request: ${testDirectory}`);
    } else {
      await rm(testDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
