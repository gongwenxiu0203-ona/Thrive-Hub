import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./SettingsClient";
import { ROLE_LABELS } from "@/lib/constants";

export const metadata = { title: "账号设置 · 联盟营销管理系统" };

export default async function SettingsPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return (
    <SettingsClient
      id={user.id}
      name={user.name}
      email={user.email}
      role={ROLE_LABELS[user.role] ?? user.role}
      feishuAuth={user.feishuAuth}
      googleAuth={user.googleAuth}
      emailAuth={user.emailAuth}
    />
  );
}
