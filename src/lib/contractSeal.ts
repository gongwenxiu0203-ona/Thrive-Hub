import { promises as fs } from "fs";
import path from "path";

export type SealCompany = "FOSHAN" | "HONGKONG";

export const SEAL_DIR_ABS = path.join(process.cwd(), "private", "seal");
const LEGACY_SEAL_DIR_ABS = path.join(process.cwd(), "public", "seal");

export const SEAL_FILE = "thraive-seal.png";
export const SEAL_ABS_PATH = path.join(SEAL_DIR_ABS, SEAL_FILE);
export const SEAL_PUBLIC = "/api/contracts/seal/FOSHAN";

export const SIGNATURE_FILE = "signature-party-b.png";
export const SIGNATURE_ABS_PATH = path.join(
  process.cwd(),
  "private",
  "signature",
  SIGNATURE_FILE,
);
const LEGACY_SIGNATURE_ABS_PATH = path.join(process.cwd(), "public", SIGNATURE_FILE);

export const COMPANY_SEALS: Record<
  SealCompany,
  { label: string; file: string; publicUrl: string; absPath: string; legacyAbsPath: string }
> = {
  FOSHAN: {
    label: "佛山公司",
    file: "foshan-seal.png",
    publicUrl: "/api/contracts/seal/FOSHAN",
    absPath: path.join(SEAL_DIR_ABS, "foshan-seal.png"),
    legacyAbsPath: path.join(LEGACY_SEAL_DIR_ABS, "foshan-seal.png"),
  },
  HONGKONG: {
    label: "香港公司",
    file: "hongkong-seal.png",
    publicUrl: "/api/contracts/seal/HONGKONG",
    absPath: path.join(SEAL_DIR_ABS, "hongkong-seal.png"),
    legacyAbsPath: path.join(LEGACY_SEAL_DIR_ABS, "hongkong-seal.png"),
  },
};

async function firstExistingFile(paths: readonly string[]): Promise<string | null> {
  for (const filePath of paths) {
    try {
      const root = path.dirname(filePath);
      const realRoot = await fs.realpath(root);
      const resolved = await fs.realpath(filePath);
      const relative = path.relative(realRoot, resolved);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
      const info = await fs.lstat(resolved);
      if (info.isFile() && !info.isSymbolicLink()) return resolved;
    } catch {
      // Try the next private/legacy candidate.
    }
  }
  return null;
}

async function safeWritePrivateAsset(filePath: string, data: Uint8Array): Promise<void> {
  const root = path.dirname(filePath);
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, path.basename(filePath));
  const relative = path.relative(realRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe private contract asset path");
  }
  try {
    const existing = await fs.lstat(target);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("Unsafe existing private contract asset");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.writeFile(target, data);
}

export async function writeCompanySeal(company: SealCompany, data: Uint8Array): Promise<void> {
  await safeWritePrivateAsset(COMPANY_SEALS[company].absPath, data);
}

export async function writePartyBSignature(data: Uint8Array): Promise<void> {
  await safeWritePrivateAsset(SIGNATURE_ABS_PATH, data);
}

export function resolveSealCompany(company: string | null | undefined): SealCompany | null {
  return company === "FOSHAN" || company === "HONGKONG" ? company : null;
}

export async function resolveCompanySealPath(company: SealCompany): Promise<string | null> {
  const seal = COMPANY_SEALS[company];
  return firstExistingFile([seal.absPath, seal.legacyAbsPath]);
}

export async function companySealExistsServer(company: SealCompany): Promise<boolean> {
  return Boolean(await resolveCompanySealPath(company));
}

export async function sealExistsServer(): Promise<boolean> {
  return Boolean(
    await firstExistingFile([
      SEAL_ABS_PATH,
      path.join(LEGACY_SEAL_DIR_ABS, SEAL_FILE),
    ]),
  );
}

export async function resolvePartyBSignaturePath(): Promise<string | null> {
  return firstExistingFile([SIGNATURE_ABS_PATH, LEGACY_SIGNATURE_ABS_PATH]);
}
