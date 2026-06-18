// Plain server utility for the seal PNG file.
// Kept OUT of "use server" because server actions can only be invoked from
// client components / form actions, not from server-component render paths.

import { promises as fs } from "fs";
import path from "path";

export const SEAL_DIR_ABS  = path.join(process.cwd(), "public", "seal");
export const SEAL_FILE     = "thraive-seal.png";
export const SEAL_ABS_PATH = path.join(SEAL_DIR_ABS, SEAL_FILE);
export const SEAL_PUBLIC   = `/seal/${SEAL_FILE}`;

export type SealCompany = "FOSHAN" | "HONGKONG";

export const COMPANY_SEALS: Record<SealCompany, { label: string; file: string; publicUrl: string; absPath: string }> = {
  FOSHAN: {
    label: "佛山公司",
    file: "foshan-seal.png",
    publicUrl: "/seal/foshan-seal.png",
    absPath: path.join(SEAL_DIR_ABS, "foshan-seal.png"),
  },
  HONGKONG: {
    label: "香港公司",
    file: "hongkong-seal.png",
    publicUrl: "/seal/hongkong-seal.png",
    absPath: path.join(SEAL_DIR_ABS, "hongkong-seal.png"),
  },
};

/** Cheap file existence check usable from server components and actions. */
export async function sealExistsServer(): Promise<boolean> {
  try {
    await fs.access(SEAL_ABS_PATH);
    return true;
  } catch {
    return false;
  }
}

export function resolveSealCompany(company: string | null | undefined): SealCompany | null {
  if (company === "FOSHAN" || company === "HONGKONG") return company;
  return null;
}

export async function companySealExistsServer(company: SealCompany): Promise<boolean> {
  try {
    await fs.access(COMPANY_SEALS[company].absPath);
    return true;
  } catch {
    return false;
  }
}
