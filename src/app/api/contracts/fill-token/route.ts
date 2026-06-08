import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { generateFillToken } from "@/actions/contracts";

export async function POST(req: NextRequest) {
  await requireSession();
  const { contractId } = await req.json();
  if (!contractId) return NextResponse.json({ error: "缺少合同ID" }, { status: 400 });

  const result = await generateFillToken(contractId);
  return NextResponse.json(result);
}
