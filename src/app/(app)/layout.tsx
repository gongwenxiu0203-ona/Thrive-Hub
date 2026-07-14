import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const unreadCount = await prisma.reminder.count({
    where: { targetId: session.userId, isRead: false },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={session.role} userId={session.userId} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar name={session.name} role={session.role} email={session.email} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
