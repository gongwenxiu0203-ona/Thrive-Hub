// Plain server utility for the seal PNG file.
// Kept OUT of "use server" because server actions can only be invoked from
// client components / form actions, not from server-component render paths.

import { promises as fs } from "fs";
import path from "path";

export const SEAL_DIR_ABS  = path.join(process.cwd(), "public", "seal");
export const SEAL_FILE     = "thraive-seal.png";
export const SEAL_ABS_PATH = path.join(SEAL_DIR_ABS, SEAL_FILE);
export const SEAL_PUBLIC   = `/seal/${SEAL_FILE}`;

/** Cheap file existence check usable from server components and actions. */
export async function sealExistsServer(): Promise<boolean> {
  try {
    await fs.access(SEAL_ABS_PATH);
    return true;
  } catch {
    return false;
  }
}
