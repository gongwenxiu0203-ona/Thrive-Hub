import { createHash } from "node:crypto";

// Only navigation is exported. Never copy Reminder.content into Feishu.
export function feishuReminderUrl(baseUrl: string, content: string | null): string {
  const fallback = new URL('/reminders?scope=received', baseUrl).href;
  const path = content?.match(/\[\[href:(\/[^\]\s]+)\]\]/)?.[1];
  if (!path || path.startsWith('//') || /[\\\x00-\x20]|%2f|%5c/i.test(path)) return fallback;
  try {
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !/^\/(finance|invoices|contracts|customers|tasks|projects|affiliates|reminders)(\/|$)/.test(url.pathname)) return fallback;
    return url.href;
  } catch { return fallback; }
}

// Stable across worker retries/crashes; Feishu's UUID deduplication is time-limited.
export function feishuDeliveryUuid(id: string): string {
  const h = createHash('sha256').update(`thrive-feishu:${id}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

export function feishuRetryDelay(attempt: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1)) * 1000;
}
