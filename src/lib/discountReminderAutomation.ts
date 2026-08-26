import { prisma } from "@/lib/prisma";
import { projectDataPrisma as projectDb } from "@/lib/projectDataPrisma";

function parseIds(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? [...new Set(parsed.map(String).filter(Boolean))] : []; } catch { return []; } }
function zonedParts(now: Date, timezone: string) {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
type Delivery = { targetId: string; reminderId: string };
function parseDeliveries(value: string): Delivery[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.targetId === "string" && typeof v.reminderId === "string") : []; } catch { return []; } }

export async function runProjectDiscountReminders(now = new Date()) {
  const settings = await projectDb.projectDiscountReminderSetting.findMany({ where: { enabled: true }, include: { source: true } });
  let createdRuns = 0, retriedRuns = 0, sent = 0, skipped = 0, notDue = 0, failed = 0;
  for (const setting of settings) {
    const clock = zonedParts(now, setting.timezone); if (clock.time < setting.scheduleTime) { notDue++; continue; }
    const events: Array<{ type: string; title: string; content: string }> = [];
    if (setting.notifySyncFailure && setting.source.syncStatus === "FAILED") events.push({ type: "SYNC_FAILURE", title: `折扣数据同步失败：${setting.source.name}`, content: setting.source.syncError || "请检查飞书数据源链接、字段映射和应用读取权限。" });
    const end = new Date(now); end.setUTCDate(end.getUTCDate() + Math.max(0, setting.remindBeforeEndDays)); end.setUTCHours(23, 59, 59, 999);
    const expiring = await projectDb.projectDiscountRecord.count({ where: { sourceId: setting.sourceId, activityStatus: "ACTIVE", endDate: { gte: now, lte: end } } });
    if (expiring > 0) events.push({ type: "EXPIRING", title: `折扣活动即将结束：${setting.source.name}`, content: `${expiring} 条折扣活动将在 ${setting.remindBeforeEndDays} 天内结束，请及时检查并更新。` });
    for (const event of events) {
      const key = { projectId: setting.projectId, sourceId: setting.sourceId, scheduleDate: clock.date, planVersion: setting.planVersion, eventType: event.type };
      let run = await projectDb.projectDiscountReminderRun.findUnique({ where: { projectId_sourceId_scheduleDate_planVersion_eventType: key } });
      if (run?.status === "COMPLETED") { skipped++; continue; }
      if (run) { retriedRuns++; run = await projectDb.projectDiscountReminderRun.update({ where: { id: run.id }, data: { status: "PROCESSING", errorMessage: null, completedAt: null } }); }
      else {
        try { run = await projectDb.projectDiscountReminderRun.create({ data: { ...key, settingId: setting.id, targetUserIds: setting.targetUserIds, status: "PROCESSING" } }); createdRuns++; }
        catch { run = await projectDb.projectDiscountReminderRun.findUnique({ where: { projectId_sourceId_scheduleDate_planVersion_eventType: key } }); if (!run || run.status === "COMPLETED") { skipped++; continue; } retriedRuns++; }
      }
      try {
        const creator = await prisma.user.findUnique({ where: { id: setting.createdById }, select: { id: true } }); if (!creator) throw new Error("提醒设置创建人已不存在，无法创建站内信。");
        const requestedIds = parseIds(setting.targetUserIds); const users = await prisma.user.findMany({ where: { id: { in: requestedIds }, status: "APPROVED" }, select: { id: true } });
        const deliveries = parseDeliveries(run.reminderIds); const delivered = new Set(deliveries.map((d) => d.targetId));
        for (const user of users) { if (delivered.has(user.id)) continue; const reminder = await prisma.reminder.create({ data: { title: event.title, content: event.content, remindDate: now, type: "PROJECT_DISCOUNT", targetId: user.id, createdById: creator.id } }); deliveries.push({ targetId: user.id, reminderId: reminder.id }); await projectDb.projectDiscountReminderRun.update({ where: { id: run.id }, data: { reminderIds: JSON.stringify(deliveries) } }); sent++; }
        await projectDb.projectDiscountReminderRun.update({ where: { id: run.id }, data: { status: "COMPLETED", reminderIds: JSON.stringify(deliveries), completedAt: new Date(), errorMessage: users.length ? null : "没有有效的提醒接收人。" } });
      } catch (error) { failed++; await projectDb.projectDiscountReminderRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : String(error), completedAt: new Date() } }); }
    }
  }
  return { settings: settings.length, createdRuns, retriedRuns, sent, skipped, notDue, failed };
}
