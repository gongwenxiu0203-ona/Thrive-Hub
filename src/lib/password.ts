import bcrypt from "bcryptjs";

// Kept separate from auth.ts so the Edge middleware (which only needs JWT
// verification) never pulls bcryptjs into the Edge bundle.

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
