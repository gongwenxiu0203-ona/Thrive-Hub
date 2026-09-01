import { NextResponse } from "next/server";
import { createFrameworkContract, updateFrameworkContract } from "@/actions/contractFramework";
import { prisma } from "@/lib/prisma";
import { adminHasFeature, getSession } from "@/lib/session";
import { isStaff } from "@/lib/dataScope";

export const runtime = "nodejs";
export const maxDuration = 300;

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;

  const originUrl = new URL(origin);
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hosts = [request.headers.get("host"), forwardedHost, requestUrl.host].filter(Boolean);
  if (hosts.includes(originUrl.host)) return true;

  return isLoopback(originUrl.hostname)
    && isLoopback(requestUrl.hostname)
    && originUrl.port === requestUrl.port;
}

export async function POST(request: Request) {
  try {
    if (!hasValidOrigin(request)) {
      return NextResponse.json({ ok: false, error: "请求来源无效" }, { status: 403 });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "登录已失效，请重新登录" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, status: true },
    });
    if (!user || user.status !== "APPROVED" || user.role !== session.role || !isStaff(user.role)) {
      return NextResponse.json({ ok: false, error: "当前账号无权上传合同" }, { status: 403 });
    }
    if (!await adminHasFeature(session, "contracts.create_upload", "EDIT")) {
      return NextResponse.json({ ok: false, error: "缺少合同创建与上传权限" }, { status: 403 });
    }

    const form = await request.formData();
    const contractId = String(form.get("contractId") ?? "").trim();
    const result = contractId
      ? await updateFrameworkContract(form)
      : await createFrameworkContract(form);

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[framework-contract-submit]", error);
    return NextResponse.json(
      { ok: false, error: "合同上传请求解析失败，请刷新页面后重试" },
      { status: 400 },
    );
  }
}
