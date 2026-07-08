import { prisma } from "@/lib/prisma";
import { MEETING_MODE_LABELS, labelOf } from "@/lib/constants";
import { sendMail } from "@/lib/mailer";

// In-system notification layer.
//
// This first iteration keeps everything inside the app: meeting invites become
// reminders for each attendee. Real Feishu / Google Calendar sync and SMTP
// email are intentionally stubbed behind `dispatchEmail` / `dispatchCalendar`
// so they can be wired up later without touching callers.

function formatMeetingTime(d: Date): string {
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- integration stubs -----------------------------------------------------

async function dispatchEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  await sendMail({
    to: opts.to,
    subject: opts.subject,
    html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${opts.body}</pre>`,
    text: opts.body,
  }).catch((err) =>
    console.error(`[notify] email dispatch failed to ${opts.to}:`, err),
  );
}

async function dispatchCalendar(opts: {
  userId: string;
  feishu: boolean;
  google: boolean;
  title: string;
  time: Date;
}): Promise<void> {
  // TODO: call Feishu / Google Calendar APIs for users who granted access.
  if (opts.feishu || opts.google) {
    console.info(
      `[calendar] user=${opts.userId} feishu=${opts.feishu} google=${opts.google} | ${opts.title} @ ${opts.time.toISOString()}`,
    );
  }
}

// --- owner assignment notifications ----------------------------------------

export async function sendOwnerAssignmentNotification(opts: {
  ownerId: string;
  ownerRole: "business" | "backend";
  customerId: string;
  customerName: string;
  assignedById: string;
}): Promise<void> {
  const [owner, assigner] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.ownerId } }),
    prisma.user.findUnique({ where: { id: opts.assignedById } }),
  ]);
  if (!owner || !assigner) return;

  const roleLabel = opts.ownerRole === "business" ? "商务负责人" : "售前方案负责人";
  const title = `您已被指派为「${opts.customerName}」的${roleLabel}`;
  const body = `系统通知：您已被指派为客户「${opts.customerName}」的${roleLabel}，请登录系统查看相关任务。`;

  try {
    await prisma.reminder.create({
      data: {
        title,
        content: body,
        remindDate: new Date(),
        type: "FOLLOWUP",
        targetId: opts.ownerId,
        createdById: opts.assignedById,
      },
    });
  } catch (e) {
    console.error("[notify] reminder.create failed:", e);
  }

  await dispatchEmail({ to: owner.email, subject: `【指派通知】${title}`, body });
}

// --- meeting invites -------------------------------------------------------

export async function sendMeetingInvite(opts: {
  taskTitle: string;
  customerName: string | null;
  meetingTime: Date;
  meetingMode: string;
  meetingLocation: string | null;
  attendeeIds: string[];
  organizerId: string;
}): Promise<void> {
  const attendees = await prisma.user.findMany({
    where: { id: { in: opts.attendeeIds } },
  });

  const when = formatMeetingTime(opts.meetingTime);
  const modeLabel = labelOf(MEETING_MODE_LABELS, opts.meetingMode);
  const locationLine =
    opts.meetingMode === "OFFLINE" && opts.meetingLocation
      ? `\n会议地点：${opts.meetingLocation}`
      : "";
  const customerLine = opts.customerName
    ? `\n关联客户：${opts.customerName}`
    : "";

  const body = `会议主题：${opts.taskTitle}${customerLine}\n会议时间：${when}\n会议形式：${modeLabel}${locationLine}`;

  const organizer = await prisma.user.findUnique({ where: { id: opts.organizerId } });

  for (const user of attendees) {
    // 1. In-system reminder (always).
    if (organizer) {
      try {
        await prisma.reminder.create({
          data: {
            title: `会议邀请：${opts.taskTitle}`,
            content: body,
            remindDate: opts.meetingTime,
            type: "MEETING",
            targetId: user.id,
            createdById: opts.organizerId,
          },
        });
      } catch (e) {
        console.error("[notify] reminder.create failed:", e);
      }
    }
    // 2. Email invite (stubbed dispatch).
    await dispatchEmail({
      to: user.email,
      subject: `【会议邀请】${opts.taskTitle} · ${when}`,
      body,
    });
    // 3. Calendar sync for users who authorized it (stubbed dispatch).
    await dispatchCalendar({
      userId: user.id,
      feishu: user.feishuAuth,
      google: user.googleAuth,
      title: opts.taskTitle,
      time: opts.meetingTime,
    });
  }
}
