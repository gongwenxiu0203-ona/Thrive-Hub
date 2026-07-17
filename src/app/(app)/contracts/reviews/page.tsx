import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { REVIEWER_EMAIL } from "@/lib/contractReviewer";
import { formatDateTime } from "@/lib/utils";

export default async function ContractReviewQueuePage() {
  const session = await requireSession();

  // 审核队列对所有用户可见；非审核人/非管理员只能看到自己提交的合同
  const reviewer = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { id: true },
  });

  const isReviewer = !!reviewer && reviewer.id === session.userId;
  const isAdmin = session.role === "ADMIN";

  const pending = await prisma.contractReview.findMany({
    where: {
      status: "PENDING",
      ...(isReviewer || isAdmin
        ? {}
        : {
            contract: {
              OR: [
                { createdById: session.userId },
                { ownerId: session.userId },
              ],
            },
          }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      contract: {
        select: {
          id: true,
          contractNo: true,
          customer: { select: { brandName: true } },
          status: true,
        },
      },
      reviewer: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-brand-600" />
        <h1 className="text-2xl font-semibold text-slate-900">合同审核队列</h1>
      </div>
      <p className="text-sm text-slate-500">
        当前共 {pending.length} 条待审核合同。
        {isReviewer ? "" : `审核人为 ${REVIEWER_EMAIL}。`}
      </p>

      {pending.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">暂无待审核合同。</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-2 text-left">合同编号</th>
                <th className="px-4 py-2 text-left">客户</th>
                <th className="px-4 py-2 text-left">轮次</th>
                <th className="px-4 py-2 text-left">审核人</th>
                <th className="px-4 py-2 text-left">提交时间</th>
                <th className="px-4 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{r.contract.contractNo}</td>
                  <td className="px-4 py-2">{r.contract.customer?.brandName ?? "—"}</td>
                  <td className="px-4 py-2">第 {r.round} 轮</td>
                  <td className="px-4 py-2">{r.reviewer.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/contracts/${r.contract.id}`}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      去审核 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
