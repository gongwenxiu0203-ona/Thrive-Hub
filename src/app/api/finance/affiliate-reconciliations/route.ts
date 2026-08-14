import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import { isStaff } from "@/lib/dataScope";

export async function GET() {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.affiliate_reconciliation", "READ");
    if (!isStaff(session.role)) {
      return NextResponse.json({ error: "仅内部员工可查看联盟商结算" }, { status: 403 });
    }

    const records = await prisma.affiliateReconciliation.findMany({
      include: {
        submitter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(records);
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限查看联盟商结算" }, { status: 403 });
    }
    return errorResponse(error, "finance.affiliate-reconciliation.list");
  }
}
