import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const customers = await prisma.customer.findMany({
    where: q
      ? { brandName: { contains: q } }
      : undefined,
    select: { brandName: true },
    orderBy: { brandName: "asc" },
    take: 20,
  });

  const brands = [...new Set(customers.map((c) => c.brandName).filter(Boolean))];

  return NextResponse.json({ brands });
}
