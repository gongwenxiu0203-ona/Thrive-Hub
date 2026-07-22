import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateReceivableTasks } from "@/lib/receivableTaskAutomation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function suppliedSecret(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-cron-secret")?.trim() ?? "";
}

async function run(request: NextRequest) {
  const expectedSecret = process.env.RECEIVABLE_CRON_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "RECEIVABLE_CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!safeEqual(suppliedSecret(request), expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateReceivableTasks();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[receivable-tasks] generation failed", error);
    return NextResponse.json({ error: "Failed to generate receivable tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}
