import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const unreadCount = await prisma.reminder.count({
    where: { targetId: session.userId, isRead: false },
  });

  return (
    <AppShell
      name={session.name}
      role={session.role}
      email={session.email}
      userId={session.userId}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
