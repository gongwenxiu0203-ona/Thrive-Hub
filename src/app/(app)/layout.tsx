import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { resolveUserPermissionsMap } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { ensureOverdueInvoiceIssueReminders } from "@/lib/reconciliationInvoiceReminder";
import { ensureChannelInvoiceReminders } from "@/lib/channelPaymentWorkflow";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const permissions = await resolveUserPermissionsMap(session.userId);
  const canViewReminders = hasPermissionLevel(
    permissions["reminders.records"] ?? "NONE",
    "READ",
  );
  if (canViewReminders) {
    try {
      await ensureOverdueInvoiceIssueReminders(session.userId);
      await ensureChannelInvoiceReminders();
    } catch (error) {
      console.error("[invoice-issue-reminder] scan failed", error);
    }
  }

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
