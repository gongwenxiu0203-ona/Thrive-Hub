import { SignJWT, jwtVerify } from "jose";

export type IntakeTokenType = "GENERAL_NEW" | "CUSTOMER_UPDATE";
export type IntakeTokenClaims = { type: IntakeTokenType; customerId?: string; staffId?: string; channelId?: string; exp: number };

function secret() {
  const value = process.env.INTAKE_LINK_SECRET;
  if (!value || value.length < 32) throw new Error("INTAKE_LINK_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function createIntakeToken(input: Omit<IntakeTokenClaims, "exp">, expiresInSeconds: number) {
  return new SignJWT(input).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setIssuer("thrive-hub").setAudience("customer-intake").setExpirationTime(`${expiresInSeconds}s`).sign(secret());
}

export async function verifyIntakeToken(token: string): Promise<IntakeTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "thrive-hub", audience: "customer-intake", algorithms: ["HS256"] });
    if (payload.type !== "GENERAL_NEW" && payload.type !== "CUSTOMER_UPDATE") return null;
    if (payload.type === "CUSTOMER_UPDATE" && typeof payload.customerId !== "string") return null;
    return { type: payload.type, customerId: typeof payload.customerId === "string" ? payload.customerId : undefined, staffId: typeof payload.staffId === "string" ? payload.staffId : undefined, channelId: typeof payload.channelId === "string" ? payload.channelId : undefined, exp: payload.exp as number };
  } catch { return null; }
}
