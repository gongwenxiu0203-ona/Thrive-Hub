import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { resolveUserPermissionsMap } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const permissions = await resolveUserPermissionsMap(session.userId);
  const canViewReminders = hasPermissionLevel(
    permissions["reminders.records"] ?? "NONE",
    "READ",
  );
  const unreadCount = canViewReminders
    ? await prisma.reminder.count({
        where: { targetId: session.userId, isRead: false, deletedAt: null },
      })
    : 0;

  return (
    <AppShell
      name={session.name}
      role={session.role}
      email={session.email}
      userId={session.userId}
      unreadCount={unreadCount}
      canViewReminders={canViewReminders}
      permissions={permissions}
    >
      {children}
    </AppShell>
  );
}
