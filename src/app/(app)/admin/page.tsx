import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminClient } from "./AdminClient";

export const metadata = { title: "管理员面板 · 联盟营销管理系统" };

export default async function AdminPage() {
  await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = await (prisma.user.findMany as any)({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      brandName: true,
      uniqueCode: true,
      invitedById: true,
      invitedBy: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
  });

  const usersWithExtra = (users as Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string | null;
    brandName: string | null;
    uniqueCode: string | null;
    invitedById: string | null;
    invitedBy: { id: string; name: string; email: string } | null;
    createdAt: Date;
  }>).map((u) => ({
    ...u,
    status: u.status ?? "APPROVED",
    brandName: u.brandName ?? null,
    uniqueCode: u.uniqueCode ?? null,
    inviter: u.invitedBy
      ? { id: u.invitedBy.id, name: u.invitedBy.name, email: u.invitedBy.email }
      : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return <AdminClient initialUsers={usersWithExtra} />;
}
