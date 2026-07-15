import { SignJWT, jwtVerify } from "jose";

const TOKEN_ISSUER = "thraive";
const TOKEN_AUDIENCE = "contract-party-a-fill";
export const CONTRACT_FILL_TOKEN_DAYS = 60;

export type ContractFillTokenPayload = {
  contractId: string;
  customerId: string;
};

function signingKey(): Uint8Array {
  const secret = process.env.CONTRACT_FILL_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CONTRACT_FILL_LINK_SECRET 必须配置为至少 32 位的独立随机密钥");
  }
  return new TextEncoder().encode(secret);
}

export async function createContractFillToken(payload: ContractFillTokenPayload) {
  const expiresAt = new Date(Date.now() + CONTRACT_FILL_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({
    contractId: payload.contractId,
    customerId: payload.customerId,
    scope: "party-a:write",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setSubject(payload.contractId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(signingKey());

  return { token, expiresAt };
}

export async function verifyContractFillToken(token: string): Promise<ContractFillTokenPayload> {
  const { payload } = await jwtVerify(token, signingKey(), {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

  if (
    payload.scope !== "party-a:write" ||
    typeof payload.contractId !== "string" ||
    typeof payload.customerId !== "string" ||
    payload.sub !== payload.contractId
  ) {
    throw new Error("合同填写令牌内容无效");
  }

  return { contractId: payload.contractId, customerId: payload.customerId };
}
