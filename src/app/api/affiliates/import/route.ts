import { NextResponse } from "next/server";

// Deprecated — use /api/affiliates/upload instead
export async function POST() {
  return NextResponse.json(
    { error: "此接口已弃用，请使用 /api/affiliates/upload" },
    { status: 410 },
  );
}
