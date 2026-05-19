import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// POST /api/affiliates/cleanup
// Body: { mode: "before_date" | "no_contact" | "by_status", date?: string, status?: string, preview?: boolean }
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { mode, date, status, preview } = body;

  let where: Record<string, unknown> = {};

  if (mode === "before_date") {
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
    where = { createdAt: { lt: new Date(date) } };
  } else if (mode === "no_contact") {
    where = { contactInfo: null, contactEmail: null };
  } else if (mode === "by_status") {
    if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });
    where = { developmentStatus: status };
  } else {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  if (preview) {
    const count = await prisma.affiliate.count({ where });
    return NextResponse.json({ count });
  }

  const result = await prisma.affiliate.deleteMany({ where });
  return NextResponse.json({ deleted: result.count });
}
