import path from "path";
import { PrismaClient } from "@/generated/project-prisma";

const globalProjectDb = globalThis as unknown as { projectDataPrisma?: PrismaClient };

function databaseUrl() {
  if (process.env.PROJECT_DATA_DATABASE_URL) return process.env.PROJECT_DATA_DATABASE_URL;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 PROJECT_DATA_DATABASE_URL，且应指向发布目录之外的独立项目数据库。");
  }
  const file = path.join(process.cwd(), "prisma-projects", "data", "projects.db").replace(/\\/g, "/");
  return `file:${file}`;
}

function assertProductionIsolation(url: string) {
  // `next build` 会以 NODE_ENV=production 收集路由，但此时只是构建产物，
  // 真正的部署前路径校验由 scripts/prepare-project-db.js 负责。
  if (process.env.npm_lifecycle_event === "build" || process.env.NODE_ENV !== "production" || !url.startsWith("file:")) return;
  const databasePath = path.resolve(decodeURIComponent(url.slice(5).split("?")[0]));
  const releaseRoot = path.resolve(process.cwd());
  const relative = path.relative(releaseRoot, databasePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("PROJECT_DATA_DATABASE_URL 必须指向发布目录之外的独立数据库文件。");
  }
}

function createClient() {
  const url = databaseUrl();
  assertProductionIsolation(url);
  const client = new PrismaClient({ datasources: { db: { url } }, log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });
  client.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
  client.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
  return client;
}

export const projectDataPrisma = globalProjectDb.projectDataPrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalProjectDb.projectDataPrisma = projectDataPrisma;
