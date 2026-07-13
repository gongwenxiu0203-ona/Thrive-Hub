import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const isGuest = session.role === "GUEST";
  const unreadCount = isGuest ? 0 : await prisma.reminder.count({
    where: { targetId: session.userId, isRead: false },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={session.role} userId={session.userId} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar name={session.name} role={session.role} email={session.email} unreadCount={unreadCount} />
        {isGuest ? (
          <div className="relative flex-1 overflow-hidden">
            <div className="h-full flex-1 pointer-events-none select-none overflow-y-auto p-4 blur-md sm:p-6">{children}</div>
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm">
              <div className="card mx-auto max-w-sm p-8 text-center shadow-xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">{"\u6e38\u5ba2\u6a21\u5f0f"}</h2>
                <p className="mb-1 text-sm text-slate-500">{"\u60a8\u5f53\u524d\u4ee5\u6e38\u5ba2\u8eab\u4efd\u6d4f\u89c8"}</p>
                <p className="mb-6 text-sm text-slate-500">{"\u767b\u5f55\u540e\u53ef\u67e5\u770b\u5b8c\u6574\u6570\u636e\u5185\u5bb9"}</p>
                <Link href="/login" className="btn-primary block w-full text-center">{"\u7acb\u5373\u767b\u5f55"}</Link>
                <Link href="/register" className="mt-3 block text-center text-sm text-slate-400 hover:text-brand-600">{"\u6ce8\u518c\u65b0\u8d26\u53f7"}</Link>
              </div>
            </div>
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">{children}</main>
        )}
      </div>
    </div>
  );
}
