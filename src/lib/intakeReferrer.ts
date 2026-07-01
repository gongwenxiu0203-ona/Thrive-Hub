import { prisma } from "@/lib/prisma";

export async function resolveIntakeReferrer(channelId?: string, staffId?: string) {
  const [channel, staff] = await Promise.all([
    channelId
      ? prisma.user.findFirst({
          where: { id: channelId, role: "CHANNEL" },
          select: { id: true, name: true, email: true },
        })
      : null,
    staffId
      ? prisma.user.findFirst({
          where: { id: staffId, role: { in: ["ADMIN", "USER"] } },
          select: { id: true, name: true, email: true },
        })
      : null,
  ]);

  return {
    channelId: channel?.id ?? "",
    staffId: staff?.id ?? "",
    label: channel
      ? `${channel.name}${channel.email ? ` (${channel.email})` : ""}`
      : null,
  };
}
