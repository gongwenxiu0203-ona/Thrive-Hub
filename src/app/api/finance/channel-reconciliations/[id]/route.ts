import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// PATCH /api/finance/channel-reconciliations/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await req.json();

    const allowed = ["estimatedDate", "actualDate", "note"];
    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (key in body) {
        if (key === "estimatedDate" || key === "actualDate") {
          data[key] = body[key] ? new Date(body[key]) : null;
        } else {
          data[key] = body[key];
        }
      }
    }
    if (body.actualDate) {
      data.status = "SETTLED";
    } else if ("actualDate" in body && !body.actualDate) {
      data.status = "PENDING";
    }

    const updated = await prisma.channelReconciliation.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
