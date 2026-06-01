import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const isGuest = session.role === "GUEST";

  const unreadCount = isGuest ? 0 : await prisma.reminder.count({
    where: { targetId: session.userId, isRead: false },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={session.role}
        userId={session.userId}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          name={session.name}
          role={session.role}
          email={session.email}
          unreadCount={unreadCount}
        />
        {isGuest ? (
          <div className="relative flex-1 overflow-hidden">
            {/* Blurred content */}
            <div className="flex-1 overflow-y-auto p-6 blur-md pointer-events-none select-none h-full">
              {children}
            </div>
            {/* Guest overlay */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm">
              <div className="card mx-auto max-w-sm p-8 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl">
                  🔒
                </div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">游客模式</h2>
                <p className="mb-1 text-sm text-slate-500">您当前以游客身份浏览</p>
                <p className="mb-6 text-sm text-slate-500">登录后可查看完整数据内容</p>
                <Link href="/login" className="btn-primary w-full block text-center">
                  立即登录
                </Link>
                <Link href="/register" className="mt-3 block text-center text-sm text-slate-400 hover:text-brand-600">
                  注册新账号
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        )}
      </div>
    </div>
  );
}
