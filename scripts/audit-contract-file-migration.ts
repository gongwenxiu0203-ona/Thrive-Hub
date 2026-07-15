/**
 * Read-only inventory for planning the contract-file move out of public/.
 *
 * This script only SELECTs database rows and reads file metadata/content to
 * calculate SHA-256. It never creates, copies, moves, deletes, or updates.
 * JSON is written to stdout so callers may decide where (or whether) to save it.
 *
 * Run: npx.cmd tsx scripts/audit-contract-file-migration.ts
 */
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { lstat, realpath } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";

type Reference = {
  source: string;
  recordId: string;
  contractId?: string;
  field: string;
  fileUrl: string;
};

type Candidate = {
  area: "public" | "private" | "uploads";
  path: string;
  exists: boolean;
  isFile?: boolean;
  size?: number;
  sha256?: string;
  unsafeReason?: string;
  error?: string;
};

const cwd = process.cwd();
const ROOTS = {
  public: path.resolve(cwd, "public"),
  private: path.resolve(cwd, "private"),
  uploads: path.resolve(cwd, "uploads"),
} as const;

function within(root: string, candidate: string): boolean {
  return candidate.startsWith(`${root}${path.sep}`);
}

function candidatePaths(fileUrl: string): Array<{ area: Candidate["area"]; path: string }> {
  if (/^https?:\/\//i.test(fileUrl)) return [];
  const relative = fileUrl.replace(/^\/+/, "");
  if (!relative || path.isAbsolute(relative)) return [];

  if (relative.startsWith("uploads/")) {
    return [{ area: "uploads", path: path.resolve(ROOTS.uploads, relative.slice(8)) }];
  }
  if (relative.startsWith("contract-annotations/")) {
    return [{ area: "private", path: path.resolve(ROOTS.private, relative) }];
  }

  // Generated/stamped contract paths historically live in public/. Checking
  // the equivalent private path shows whether a staged migration copy exists.
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

async function inspectCandidate(
  input: { area: Candidate["area"]; path: string },
): Promise<Candidate> {
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
      return { ...input, path: resolved, exists: true, isFile: false, size: info.size };
    }
    return {
      ...input,
      path: resolved,
      exists: true,
      isFile: true,
      size: info.size,
      sha256: await sha256(resolved),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ...input, exists: false };
    return {
      ...input,
      exists: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function addReference(
  refs: Reference[],
  source: string,
  recordId: string,
  field: string,
  value: string | null,
  contractId?: string,
) {
  if (value) refs.push({ source, recordId, contractId, field, fileUrl: value });
}

async function main() {
  const [contracts, versions, annotations, attachments, templates] = await Promise.all([
    prisma.contract.findMany({
      select: { id: true, fileUrl: true, generatedDocUrl: true, stampedDocUrl: true },
    }),
    prisma.contractVersion.findMany({
      select: { id: true, contractId: true, fileUrl: true },
    }),
    prisma.contractAnnotation.findMany({
      where: { fileUrl: { not: null } },
      select: { id: true, contractId: true, fileUrl: true },
    }),
    prisma.attachment.findMany({
      where: { entityType: "CONTRACT" },
      select: { id: true, entityId: true, fileUrl: true },
    }),
    prisma.contractTemplate.findMany({
      select: { id: true, fileUrl: true },
    }),
  ]);

  const references: Reference[] = [];
  for (const row of contracts) {
    addReference(references, "Contract", row.id, "fileUrl", row.fileUrl, row.id);
    addReference(references, "Contract", row.id, "generatedDocUrl", row.generatedDocUrl, row.id);
    addReference(references, "Contract", row.id, "stampedDocUrl", row.stampedDocUrl, row.id);
  }
  for (const row of versions) {
    addReference(references, "ContractVersion", row.id, "fileUrl", row.fileUrl, row.contractId);
  }
  for (const row of annotations) {
    addReference(references, "ContractAnnotation", row.id, "fileUrl", row.fileUrl, row.contractId);
  }
  for (const row of attachments) {
    addReference(references, "Attachment(CONTRACT)", row.id, "fileUrl", row.fileUrl, row.entityId);
  }
  for (const row of templates) {
    addReference(references, "ContractTemplate", row.id, "fileUrl", row.fileUrl);
  }

  const uniqueUrls = [...new Set(references.map((item) => item.fileUrl))].sort();
  const files = await Promise.all(
    uniqueUrls.map(async (fileUrl) => ({
      fileUrl,
      references: references.filter((item) => item.fileUrl === fileUrl),
      candidates: await Promise.all(candidatePaths(fileUrl).map(inspectCandidate)),
      externalUrl: /^https?:\/\//i.test(fileUrl),
    })),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    roots: ROOTS,
    summary: {
      referenceCount: references.length,
      uniqueUrlCount: uniqueUrls.length,
      publicFiles: files.filter((item) =>
        item.candidates.some((candidate) => candidate.area === "public" && candidate.isFile),
      ).length,
      privateFiles: files.filter((item) =>
        item.candidates.some((candidate) => candidate.area === "private" && candidate.isFile),
      ).length,
      uploadFiles: files.filter((item) =>
        item.candidates.some((candidate) => candidate.area === "uploads" && candidate.isFile),
      ).length,
      missingLocalFiles: files.filter(
        (item) =>
          !item.externalUrl &&
          item.candidates.length > 0 &&
          !item.candidates.some((candidate) => candidate.isFile),
      ).length,
      externalUrls: files.filter((item) => item.externalUrl).length,
      unsafePaths: files.filter((item) =>
        item.candidates.some((candidate) => candidate.unsafeReason),
      ).length,
    },
    files,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ mode: "READ_ONLY", error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
