import { promises as fs } from "fs";
import path from "path";

export const CONTRACT_FILE_KINDS = [
  "contracts-generated",
  "contracts-stamped",
  "contract-templates",
  "contract-annotations",
] as const;

export type ContractFileKind = (typeof CONTRACT_FILE_KINDS)[number];

const PRIVATE_ROOT = path.resolve(process.cwd(), "private");
const LEGACY_PUBLIC_ROOT = path.resolve(process.cwd(), "public");

function isKind(value: string): value is ContractFileKind {
  return (CONTRACT_FILE_KINDS as readonly string[]).includes(value);
}

function isWithin(root: string, candidate: string): boolean {
  return candidate.startsWith(`${root}${path.sep}`);
}

function safeFileName(fileName: string): string {
  const base = path.basename(fileName);
  if (!base || base !== fileName || base === "." || base === ".." || fileName.includes("\\")) {
    throw new Error("Invalid contract file name");
  }
  return base;
}

function parseLogicalUrl(fileUrl: string): { kind: ContractFileKind; fileName: string } | null {
  if (!fileUrl || /^https?:\/\//i.test(fileUrl) || fileUrl.includes("\0")) return null;
  const normalized = fileUrl.replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (parts.length !== 2 || !isKind(parts[0])) return null;
  try {
    return { kind: parts[0], fileName: safeFileName(parts[1]) };
  } catch {
    return null;
  }
}

export function contractLogicalUrl(kind: ContractFileKind, fileName: string): string {
  return `/${kind}/${safeFileName(fileName)}`;
}

export async function resolvePrivateContractFilePath(
  kind: ContractFileKind,
  fileName: string,
): Promise<string> {
  const safeName = safeFileName(fileName);
  await fs.mkdir(PRIVATE_ROOT, { recursive: true });
  const realRoot = await fs.realpath(PRIVATE_ROOT);
  const kindDir = path.resolve(realRoot, kind);
  if (!isWithin(realRoot, kindDir)) throw new Error("Contract storage path escapes private root");
  await fs.mkdir(kindDir, { recursive: true });
  const realKindDir = await fs.realpath(kindDir);
  if (!isWithin(realRoot, realKindDir)) throw new Error("Contract storage directory is unsafe");
  const target = path.resolve(realKindDir, safeName);
  if (!isWithin(realKindDir, target)) throw new Error("Contract file path escapes storage directory");
  return target;
}

export async function writePrivateContractFile(
  kind: ContractFileKind,
  fileName: string,
  data: Uint8Array,
): Promise<{ fileUrl: string; absolutePath: string }> {
  const absolutePath = await resolvePrivateContractFilePath(kind, fileName);
  try {
    const existing = await fs.lstat(absolutePath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("Unsafe existing contract storage target");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.writeFile(absolutePath, data);
  return { fileUrl: contractLogicalUrl(kind, fileName), absolutePath };
}

/** Create a unique server-owned working directory inside a private file kind. */
export async function createPrivateContractTempDir(
  kind: ContractFileKind,
  prefix: string,
): Promise<string> {
  const safePrefix = safeFileName(prefix);
  const placeholder = await resolvePrivateContractFilePath(kind, `${safePrefix}.tmp`);
  return fs.mkdtemp(path.join(path.dirname(placeholder), `${safePrefix}-`));
}

/** Resolve an existing logical contract path, preferring private storage. */
export async function resolveContractFilePath(
  fileUrl: string,
  allowedKinds: readonly ContractFileKind[] = CONTRACT_FILE_KINDS,
): Promise<string | null> {
  const parsed = parseLogicalUrl(fileUrl);
  if (!parsed || !allowedKinds.includes(parsed.kind)) return null;

  for (const configuredRoot of [PRIVATE_ROOT, LEGACY_PUBLIC_ROOT]) {
    try {
      const realRoot = await fs.realpath(configuredRoot);
      const candidate = path.resolve(realRoot, parsed.kind, parsed.fileName);
      if (!isWithin(realRoot, candidate)) continue;
      const resolved = await fs.realpath(candidate);
      if (!isWithin(realRoot, resolved)) continue;
      const stat = await fs.stat(resolved);
      if (stat.isFile()) return resolved;
    } catch {
      // Try the legacy root after a private miss; otherwise report not found.
    }
  }
  return null;
}
