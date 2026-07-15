/**
 * Read-only contract-file inventory. It performs SELECT queries and reads file
 * metadata/content for SHA-256 only. It never writes a report file, mutates the
 * database, or copies/moves/deletes files. Local files are never uploaded.
 *
 * Run: npx.cmd tsx scripts/audit-contract-file-migration.ts
 */
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { readFileSync } from "fs";
import { lstat, readdir, realpath } from "fs/promises";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";

type ReferenceState = "active" | "soft-deleted" | "parent-missing";
type Area = "public" | "private" | "uploads";

type Reference = {
  source: string;
  recordId: string;
  contractId?: string;
  field: string;
  fileUrl: string;
  state: ReferenceState;
  stateReason?: string;
};

type Candidate = {
  area: Area;
  path: string;
  exists: boolean;
  isFile?: boolean;
  size?: number;
  mtime?: string;
  sha256?: string;
  unsafeReason?: string;
  error?: string;
};

type DiskFile = {
  area: Area;
  kind: string;
  fileUrl: string;
  path: string;
  size: number;
  mtime: string;
  sha256: string;
  recentProtected: boolean;
};

type UnsafeEntry = { area: Area; path: string; reason: string };

const cwd = process.cwd();
const ROOTS = {
  public: path.resolve(cwd, "public"),
  private: path.resolve(cwd, "private"),
  uploads: path.resolve(cwd, "uploads"),
} as const;
const CONTRACT_DIR_KINDS = [
  "contract-annotations",
  "contract-templates",
  "contracts-generated",
  "contracts-stamped",
] as const;
const RECENT_PROTECTION_HOURS = 24;
const recentCutoffMs = Date.now() - RECENT_PROTECTION_HOURS * 60 * 60 * 1000;

const auditEnv = process.env.AUDIT_ENV;
if (auditEnv !== "local" && auditEnv !== "production") {
  throw new Error("AUDIT_ENV must be explicitly set to local or production");
}

function envDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(cwd, auditEnv === "production" ? ".env" : ".env.development");
  const text = readFileSync(envFile, "utf8");
  const match = text.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
  if (!match) throw new Error(`DATABASE_URL missing from ${envFile}`);
  return match[1];
}

function resolveDb(url: string): string {
  if (!url.startsWith("file:")) throw new Error("Only SQLite file: DATABASE_URL is supported");
  const raw = url.slice(5).split("?")[0];
  return path.resolve(path.join(cwd, "prisma"), raw);
}

const databaseUrl = envDatabaseUrl();
const databasePath = resolveDb(databaseUrl);
const lowerDb = databasePath.toLowerCase();
const lowerCwd = cwd.toLowerCase();
if (auditEnv === "production") {
  if (path.resolve(cwd) !== path.resolve("/root/www")) {
    throw new Error("production audit must run from /root/www");
  }
  if (/security-test|intake-review-test|fixture|test-output/.test(lowerDb)) {
    throw new Error("production audit refuses test/fixture databases");
  }
  if (/fixture|test-output|security-test|intake-review-test/.test(lowerCwd)) {
    throw new Error("production audit refuses test/fixture working directories");
  }
}
const readOnlyUrl = `file:${databasePath.replace(/\\/g, "/")}?mode=ro`;
const prisma = new PrismaClient({ datasourceUrl: readOnlyUrl });

function canonicalUrl(value: string): string | null {
  if (/^https?:\/\//i.test(value)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) return null;
  const clean = decoded.replace(/^\/+/, "");
  if (!clean || clean.split("/").some((part) => part === ".." || part === ".")) return null;
  return `/${clean}`;
}

function within(root: string, candidate: string): boolean {
  return candidate.startsWith(`${root}${path.sep}`);
}

function candidatePaths(fileUrl: string): Array<{ area: Area; path: string }> {
  const canonical = canonicalUrl(fileUrl);
  if (!canonical) return [];
  const relative = canonical.slice(1);
  if (!relative || path.isAbsolute(relative)) return [];
  if (relative.startsWith("uploads/")) {
    return [{ area: "uploads", path: path.resolve(ROOTS.uploads, relative.slice(8)) }];
  }
  return [
    { area: "public", path: path.resolve(ROOTS.public, relative) },
    { area: "private", path: path.resolve(ROOTS.private, relative) },
  ];
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function inspectCandidate(input: { area: Area; path: string }): Promise<Candidate> {
  const root = ROOTS[input.area];
  if (!within(root, input.path)) {
    return { ...input, exists: false, unsafeReason: "resolved path escapes expected root" };
  }
  try {
    const resolved = await realpath(input.path);
    if (!within(root, resolved)) {
      return { ...input, exists: true, unsafeReason: "real path escapes expected root" };
    }
    const info = await lstat(resolved);
    if (!info.isFile()) {
      return {
        ...input,
        path: resolved,
        exists: true,
        isFile: false,
        size: info.size,
        mtime: info.mtime.toISOString(),
      };
    }
    return {
      ...input,
      path: resolved,
      exists: true,
      isFile: true,
      size: info.size,
      mtime: info.mtime.toISOString(),
      sha256: await sha256(resolved),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...input, exists: false };
    return {
      ...input,
      exists: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function scanWhitelistedDirectories(): Promise<{ files: DiskFile[]; unsafe: UnsafeEntry[] }> {
  const files: DiskFile[] = [];
  const unsafe: UnsafeEntry[] = [];
  for (const area of ["public", "private"] as const) {
    const root = ROOTS[area];
    try {
      const rootInfo = await lstat(root);
      if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
        unsafe.push({ area, path: root, reason: rootInfo.isSymbolicLink() ? "root symlink" : "root is not a directory" });
        continue;
      }
      if ((await realpath(root)) !== root) {
        unsafe.push({ area, path: root, reason: "root realpath differs from expected root" });
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const kind of CONTRACT_DIR_KINDS) {
      const directory = path.resolve(root, kind);
      if (!within(root, directory)) continue;
      let entries;
      try {
        const directoryInfo = await lstat(directory);
        if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
          unsafe.push({ area, path: directory, reason: directoryInfo.isSymbolicLink() ? "kind directory symlink" : "kind path is not a directory" });
          continue;
        }
        const realDirectory = await realpath(directory);
        if (!within(root, realDirectory)) {
          unsafe.push({ area, path: directory, reason: "kind directory realpath escapes expected root" });
          continue;
        }
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const candidate = path.resolve(directory, entry.name);
        if (entry.isSymbolicLink() || !entry.isFile()) {
          unsafe.push({ area, path: candidate, reason: entry.isSymbolicLink() ? "symlink" : "non-regular entry" });
          continue;
        }
        const resolved = await realpath(candidate);
        if (!within(directory, resolved)) continue;
        const info = await lstat(resolved);
        files.push({
          area,
          kind,
          fileUrl: `/${kind}/${entry.name}`,
          path: resolved,
          size: info.size,
          mtime: info.mtime.toISOString(),
          sha256: await sha256(resolved),
          recentProtected: info.mtimeMs >= recentCutoffMs,
        });
      }
    }
  }
  return { files: files.sort((a, b) =>
    `${a.area}:${a.fileUrl}`.localeCompare(`${b.area}:${b.fileUrl}`),
  ), unsafe: unsafe.sort((a, b) => a.path.localeCompare(b.path)) };
}

function addReference(
  refs: Reference[],
  source: string,
  recordId: string,
  field: string,
  value: string | null,
  state: ReferenceState,
  stateReason?: string,
  contractId?: string,
) {
  if (value) {
    const normalized = canonicalUrl(value) ?? value;
    refs.push({ source, recordId, contractId, field, fileUrl: normalized, state, stateReason });
  }
}

async function scanUploads(): Promise<{ files: DiskFile[]; unsafe: UnsafeEntry[] }> {
  const files: DiskFile[] = [];
  const unsafe: UnsafeEntry[] = [];
  let entries;
  try {
    const rootInfo = await lstat(ROOTS.uploads);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      unsafe.push({ area: "uploads", path: ROOTS.uploads, reason: rootInfo.isSymbolicLink() ? "root symlink" : "root is not a directory" });
      return { files, unsafe };
    }
    if ((await realpath(ROOTS.uploads)) !== ROOTS.uploads) {
      unsafe.push({ area: "uploads", path: ROOTS.uploads, reason: "root realpath differs from expected root" });
      return { files, unsafe };
    }
    entries = await readdir(ROOTS.uploads, { withFileTypes: true });
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { files, unsafe };
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.resolve(ROOTS.uploads, entry.name);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      unsafe.push({ area: "uploads", path: filePath, reason: entry.isSymbolicLink() ? "symlink" : "non-regular entry" });
      continue;
    }
    const resolved = await realpath(filePath);
    if (!within(ROOTS.uploads, resolved)) {
      unsafe.push({ area: "uploads", path: filePath, reason: "file realpath escapes uploads root" });
      continue;
    }
    const info = await lstat(resolved);
    files.push({ area: "uploads", kind: "uploads", fileUrl: `/uploads/${entry.name}`, path: resolved,
      size: info.size, mtime: info.mtime.toISOString(), sha256: await sha256(resolved),
      recentProtected: info.mtimeMs >= recentCutoffMs });
  }
  return { files, unsafe };
}

async function main() {
  const databaseRealPath = await realpath(databasePath);
  const productionDatabaseConfirmed =
    auditEnv === "production" && databaseRealPath === "/root/www/prisma/dev.db";
  if (auditEnv === "production" && !productionDatabaseConfirmed) {
    throw new Error(
      `production database realpath must equal /root/www/prisma/dev.db (received ${databaseRealPath})`,
    );
  }
  const [contracts, versions, annotations, attachments, templates] = await Promise.all([
    prisma.contract.findMany({
      select: {
        id: true,
        deletedAt: true,
        fileUrl: true,
        generatedDocUrl: true,
        stampedDocUrl: true,
      },
    }),
    prisma.contractVersion.findMany({
      select: { id: true, contractId: true, fileUrl: true },
    }),
    prisma.contractAnnotation.findMany({
      where: { fileUrl: { not: null } },
      select: { id: true, contractId: true, fileUrl: true },
    }),
    prisma.attachment.findMany({
      select: { id: true, entityType: true, entityId: true, fileUrl: true },
    }),
    prisma.contractTemplate.findMany({
      select: { id: true, deletedAt: true, fileUrl: true },
    }),
  ]);

  const contractState = new Map(
    contracts.map((row) => [row.id, row.deletedAt ? "soft-deleted" : "active"] as const),
  );
  const parentState = (contractId: string): ReferenceState =>
    contractState.get(contractId) ?? "parent-missing";
  const parentReason = (contractId: string): string | undefined => {
    const state = parentState(contractId);
    return state === "soft-deleted"
      ? "parent contract is soft-deleted"
      : state === "parent-missing"
        ? "parent contract does not exist"
        : undefined;
  };

  const references: Reference[] = [];
  for (const row of contracts) {
    const state: ReferenceState = row.deletedAt ? "soft-deleted" : "active";
    const reason = row.deletedAt ? "contract.deletedAt is set" : undefined;
    addReference(references, "Contract", row.id, "fileUrl", row.fileUrl, state, reason, row.id);
    addReference(
      references,
      "Contract",
      row.id,
      "generatedDocUrl",
      row.generatedDocUrl,
      state,
      reason,
      row.id,
    );
    addReference(
      references,
      "Contract",
      row.id,
      "stampedDocUrl",
      row.stampedDocUrl,
      state,
      reason,
      row.id,
    );
  }
  for (const row of versions) {
    addReference(
      references,
      "ContractVersion",
      row.id,
      "fileUrl",
      row.fileUrl,
      parentState(row.contractId),
      parentReason(row.contractId),
      row.contractId,
    );
  }
  for (const row of annotations) {
    addReference(
      references,
      "ContractAnnotation",
      row.id,
      "fileUrl",
      row.fileUrl,
      parentState(row.contractId),
      parentReason(row.contractId),
      row.contractId,
    );
  }
  for (const row of attachments) {
    if (row.entityType !== "CONTRACT") continue;
    addReference(
      references,
      "Attachment(CONTRACT)",
      row.id,
      "fileUrl",
      row.fileUrl,
      parentState(row.entityId),
      parentReason(row.entityId),
      row.entityId,
    );
  }
  for (const row of templates) {
    addReference(
      references,
      "ContractTemplate",
      row.id,
      "fileUrl",
      row.fileUrl,
      row.deletedAt ? "soft-deleted" : "active",
      row.deletedAt ? "contractTemplate.deletedAt is set" : undefined,
    );
  }

  references.sort((a, b) =>
    `${a.state}:${a.source}:${a.recordId}:${a.field}`.localeCompare(
      `${b.state}:${b.source}:${b.recordId}:${b.field}`,
    ),
  );
  const uniqueUrls = [...new Set(references.map((item) => item.fileUrl))].sort();
  const inspectedUrls = await Promise.all(
    uniqueUrls.map(async (fileUrl) => ({
      fileUrl,
      references: references.filter((item) => item.fileUrl === fileUrl),
      candidates: await Promise.all(candidatePaths(fileUrl).map(inspectCandidate)),
      externalUrl: /^https?:\/\//i.test(fileUrl),
    })),
  );
  const urlExists = new Map(
    inspectedUrls.map((item) => [
      item.fileUrl,
      !item.externalUrl && item.candidates.some((candidate) => candidate.isFile),
    ]),
  );
  const diskScan = await scanWhitelistedDirectories();
  const uploadScan = await scanUploads();
  const diskFiles = diskScan.files;
  const referencedUrls = new Set(uniqueUrls);
  const orphanServerFiles = diskFiles.filter((file) => !referencedUrls.has(file.fileUrl));
  const missingDbReferences = references.filter((ref) => !urlExists.get(ref.fileUrl));
  const allAttachmentUrls = new Set(
    attachments.map((item) => canonicalUrl(item.fileUrl)).filter((item): item is string => Boolean(item)),
  );
  const unreferencedUploadCandidates = uploadScan.files.filter((file) => !allAttachmentUrls.has(file.fileUrl));
  const duplicateLocations = inspectedUrls
    .map((item) => {
      const publicFile = item.candidates.find((c) => c.area === "public" && c.isFile);
      const privateFile = item.candidates.find((c) => c.area === "private" && c.isFile);
      if (!publicFile || !privateFile) return null;
      return { fileUrl: item.fileUrl, public: publicFile, private: privateFile,
        hashStatus: publicFile.sha256 === privateFile.sha256 ? "identical" : "conflict" };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const legacyPublicCopies = inspectedUrls
    .filter((item) => item.candidates.some((c) => c.area === "public" && c.isFile))
    .map((item) => ({ fileUrl: item.fileUrl,
      privateCopyExists: item.candidates.some((c) => c.area === "private" && c.isFile),
      hashStatus: duplicateLocations.find((d) => d.fileUrl === item.fileUrl)?.hashStatus ?? "no-private-copy" }));
  const externalUnsupported = references.filter((ref) => /^https?:\/\//i.test(ref.fileUrl));
  const unsafeServerEntries = [...diskScan.unsafe, ...uploadScan.unsafe].sort((a, b) => a.path.localeCompare(b.path));
  const dbInfo = await lstat(databaseRealPath);

  const report = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    auditEnvironment: auditEnv,
    productionDatabaseConfirmed,
    hostname: os.hostname(),
    database: {
      sanitizedPath: databaseRealPath,
      size: dbInfo.size,
      sha256: await sha256(databaseRealPath),
    },
    guarantees: {
      databaseWrites: false,
      filesystemWrites: false,
      fileCopiesMovesDeletes: false,
      uploadsLocalFiles: false,
    },
    recentProtectionHours: RECENT_PROTECTION_HOURS,
    scannedDirectoryKinds: CONTRACT_DIR_KINDS,
    roots: ROOTS,
    summary: {
      activeDbReferences: references.filter((ref) => ref.state === "active").length,
      softDeletedDbReferences: references.filter((ref) => ref.state === "soft-deleted").length,
      parentMissingDbReferences: references.filter((ref) => ref.state === "parent-missing").length,
      missingDbReferences: missingDbReferences.length,
      orphanServerFiles: orphanServerFiles.length,
      recentProtectedOrphans: orphanServerFiles.filter((file) => file.recentProtected).length,
      uniqueDbUrls: uniqueUrls.length,
      scannedServerFiles: diskFiles.length,
      duplicateLocations: duplicateLocations.length,
      legacyPublicCopies: legacyPublicCopies.length,
      externalUnsupported: externalUnsupported.length,
      unreferencedUploadCandidates: unreferencedUploadCandidates.length,
      unsafeServerEntries: unsafeServerEntries.length,
    },
    activeDbReferences: references.filter((ref) => ref.state === "active"),
    softDeletedDbReferences: references.filter((ref) => ref.state === "soft-deleted"),
    parentMissingDbReferences: references.filter((ref) => ref.state === "parent-missing"),
    dbReferencesButMissing: missingDbReferences,
    orphanServerFiles,
    duplicateLocations,
    legacyPublicCopies,
    unreferencedUploadCandidates,
    externalUnsupported,
    unsafeServerEntries,
    testArtifacts: auditEnv === "local" ? {
      databaseLooksLikeTest: /test|fixture/.test(lowerDb),
      workingDirectoryLooksLikeTest: /test|fixture/.test(lowerCwd),
    } : undefined,
    inspectedUrls,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ schemaVersion: 3, mode: "READ_ONLY", error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
