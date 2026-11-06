import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, beginAuthorization, cookieOptions, OAUTH_COOKIE, sameOrigin, withFeishuUser } from "@/lib/feishuOAuth";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return apiError("请求来源不合法", 403);
  return withFeishuUser(async user => {
  if (await prisma.feishuBinding.findUnique({ where: { userId: user.id } })) return apiError("请先解绑已有飞书账号");
    const auth = await beginAuthorization(user.id);
    const res = NextResponse.json({ url: auth.url }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(OAUTH_COOKIE, auth.token, cookieOptions);
    return res;
  });
}
