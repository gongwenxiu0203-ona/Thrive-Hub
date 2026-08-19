"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Mail, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { clientUnknownError, readApiError } from "@/lib/clientError";
import {
  EMAIL_REPLY_CATEGORIES,
  EMAIL_REPLY_CATEGORY_LABELS,
  type EmailReplyCategory,
} from "@/lib/emailTemplates";
import { ROLE_LABELS } from "@/lib/constants";

type EmailUser = { id: string; name: string; email: string; role: string };
type DeliveryLog = {
  id: string;
  eventKey: string;
  recipientEmail: string;
  status: string;
  errorCode: string | null;
  errorSummary: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
};
type EmailSettingsPayload = {
  users: EmailUser[];
  settings: Partial<Record<EmailReplyCategory, { userId: string }>>;
  environment: { configured: boolean; region: string; fromAddress: string; fromName: string };
  logs: DeliveryLog[];
};

const EVENT_LABELS: Record<string, string> = {
  PASSWORD_RESET: "密码重置",
  PASSWORD_CHANGED: "密码修改通知 / 测试",
  CUSTOMER_RECONCILIATION_REVIEW: "客户对账待确认",
  CUSTOMER_RECONCILIATION_RESULT: "客户对账结果",
  CHANNEL_RECONCILIATION_REVIEW: "渠道商对账待确认",
  CHANNEL_RECONCILIATION_RESULT: "渠道商对账结果",
  INVOICE_DELIVERY: "Invoice 发送",
  INVOICE_OVERDUE: "Invoice 逾期提醒",
};

export function EmailSettingsPanel({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<EmailSettingsPayload | null>(null);
  const [values, setValues] = useState<Record<EmailReplyCategory, string>>(
    Object.fromEntries(EMAIL_REPLY_CATEGORIES.map((category) => [category, ""])) as Record<EmailReplyCategory, string>,
  );
  const [testRecipient, setTestRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/email-settings", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = await response.json() as EmailSettingsPayload;
      setData(payload);
      setValues(Object.fromEntries(EMAIL_REPLY_CATEGORIES.map((category) => [category, payload.settings[category]?.userId ?? ""])) as Record<EmailReplyCategory, string>);
      setTestRecipient((current) => current || payload.users[0]?.id || "");
    } catch (loadError) {
      console.error("[email-settings-load]", loadError);
      setError(loadError instanceof Error && loadError.message ? loadError.message : clientUnknownError());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const defaultEmail = useMemo(
    () => data?.users.find((user) => user.id === values.DEFAULT)?.email ?? "未配置",
    [data?.users, values.DEFAULT],
  );

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: values }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setMessage("邮件回复配置已保存，后续发送立即使用新邮箱，无需重新部署");
      await load();
    } catch (saveError) {
      console.error("[email-settings-save]", saveError);
      setError(saveError instanceof Error && saveError.message ? saveError.message : clientUnknownError());
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: testRecipient }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setMessage("测试邮件已提交腾讯云，请检查收件箱和投递记录");
      await load();
    } catch (testError) {
      console.error("[email-settings-test]", testError);
      setError(testError instanceof Error && testError.message ? testError.message : clientUnknownError());
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="card p-6 text-sm text-slate-600">正在读取邮件配置…</div>;
  if (!data) return <div className="card p-6 text-sm text-rose-700">{error || "邮件配置加载失败"}</div>;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">腾讯云邮件服务</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              发件地址由服务器环境变量控制；Reply-To 从已审核的网站账号中选择，可随时修改并立即生效。
            </p>
          </div>
          <span className={data.environment.configured ? "badge bg-emerald-100 text-emerald-700" : "badge bg-amber-100 text-amber-800"}>
            {data.environment.configured ? "服务器已配置" : "服务器密钥待配置"}
          </span>
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 border-t border-[#e7e0ef] pt-4 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">发件人</dt><dd className="mt-1 font-medium text-slate-800">{data.environment.fromName}</dd></div>
          <div><dt className="text-slate-500">发件地址</dt><dd className="mt-1 font-medium text-slate-800">{data.environment.fromAddress}</dd></div>
          <div><dt className="text-slate-500">区域</dt><dd className="mt-1 font-medium text-slate-800">{data.environment.region}</dd></div>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">回复邮箱规则</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          默认邮箱为必填；其他类型留空时自动使用默认邮箱。当前默认回复地址：<strong>{defaultEmail}</strong>
        </p>
        <div className="mt-5 divide-y divide-[#f0ecf4]">
          {EMAIL_REPLY_CATEGORIES.map((category) => (
            <div key={category} className="grid gap-2 py-4 sm:grid-cols-[220px_minmax(260px,1fr)] sm:items-center">
              <label htmlFor={`email-setting-${category}`} className="text-sm font-medium text-slate-700">
                {EMAIL_REPLY_CATEGORY_LABELS[category]}
                {category === "DEFAULT" && <span className="ml-1 text-rose-600">*</span>}
              </label>
              <select
                id={`email-setting-${category}`}
                className="input"
                value={values[category]}
                disabled={!canManage || saving}
                onChange={(event) => setValues((current) => ({ ...current, [category]: event.target.value }))}
              >
                {category !== "DEFAULT" && <option value="">使用默认回复邮箱</option>}
                {category === "DEFAULT" && <option value="">请选择网站账号</option>}
                {data.users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} · {ROLE_LABELS[user.role] ?? user.role} · {user.email}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {canManage && (
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn-primary" onClick={save} disabled={saving || !values.DEFAULT}>
              {saving ? "保存中…" : "保存邮件配置"}
            </button>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">投递测试</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">使用“密码修改成功通知”模板验证代码、密钥、模板和 Reply-To 配置。</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select className="input sm:max-w-xl" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} disabled={!canManage || testing}>
            <option value="">请选择测试收件账号</option>
            {data.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
          </select>
          <button type="button" className="btn-secondary shrink-0" onClick={sendTest} disabled={!canManage || testing || !testRecipient || !data.environment.configured}>
            <Send className="h-4 w-4" aria-hidden="true" />{testing ? "发送中…" : "发送测试邮件"}
          </button>
          <button type="button" className="btn-ghost shrink-0" onClick={() => void load()} disabled={loading} aria-label="刷新邮件投递记录">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />刷新
          </button>
        </div>
      </section>

      {(message || error) && (
        <div className={error ? "flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" : "flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"}>
          {error ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error || message}</span>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-[#e7e0ef] px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">最近投递记录</h2>
          <p className="mt-1 text-sm text-slate-600">只保存投递元数据，不保存邮件正文、密码重置 token 或腾讯云密钥。</p>
        </div>
        {data.logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">暂无邮件投递记录。保存配置后可先发送一封测试邮件。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead><tr><th>类型</th><th>收件人</th><th>状态</th><th>时间</th><th>腾讯云 MessageId / 失败原因</th></tr></thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{EVENT_LABELS[log.eventKey] ?? log.eventKey}</td>
                    <td>{log.recipientEmail}</td>
                    <td><span className={log.status === "SENT" ? "badge bg-emerald-100 text-emerald-700" : log.status === "FAILED" ? "badge bg-rose-100 text-rose-700" : "badge bg-amber-100 text-amber-800"}>{log.status === "SENT" ? "已提交" : log.status === "FAILED" ? "失败" : "发送中"}</span></td>
                    <td>{new Date(log.sentAt ?? log.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="max-w-md whitespace-normal text-xs text-slate-600">{log.providerMessageId ?? log.errorSummary ?? log.errorCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
