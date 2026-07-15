"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";

const EMPTY_FIELDS = {
  partyAName: "",
  partyACreditCode: "",
  partyAAddress: "",
  partyAContact: "",
  partyAPhone: "",
  partyAEmail: "",
};

export function FillForm({ token }: { token: string }) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/contract-fill/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "填写链接不可用");
        if (active) {
          setFields((current) => ({ ...current, partyAName: data.partyAName ?? "" }));
          setExpiry(data.expiry ?? null);
        }
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "填写链接不可用"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/contract-fill/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "提交失败");
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="py-12 text-center text-sm text-slate-500">正在验证填写链接…</p>;
  if (error && !expiry) return <p className="py-12 text-center text-sm text-rose-600">{error}</p>;
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="mb-4 h-16 w-16 text-emerald-500" />
        <h2 className="mb-2 text-xl font-bold text-slate-800">信息提交成功</h2>
        <p className="text-sm text-slate-500">甲方信息已同步至合同草稿，请等待工作人员确认后续流程。</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {expiry && <p className="text-xs text-amber-700">链接有效期至：{new Date(expiry).toLocaleDateString("zh-CN")}</p>}
      <Field label="甲方签约主体公司名称"><input className="input" required maxLength={500} value={fields.partyAName} onChange={set("partyAName")} /></Field>
      <Field label="统一社会信用代码（或商业登记号）"><input className="input" required maxLength={500} value={fields.partyACreditCode} onChange={set("partyACreditCode")} /></Field>
      <Field label="甲方地址"><input className="input" required maxLength={500} value={fields.partyAAddress} onChange={set("partyAAddress")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="甲方指定联系人"><input className="input" required maxLength={500} value={fields.partyAContact} onChange={set("partyAContact")} /></Field>
        <Field label="联系电话"><input className="input" required type="tel" maxLength={500} value={fields.partyAPhone} onChange={set("partyAPhone")} /></Field>
      </div>
      <Field label="电子邮箱"><input className="input" required type="email" maxLength={500} value={fields.partyAEmail} onChange={set("partyAEmail")} /></Field>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      <button type="submit" disabled={submitting} className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">
        {submitting ? "提交中…" : "确认提交甲方信息"}
      </button>
      <p className="text-center text-xs text-slate-400">提交即表示您确认以上信息真实有效，并同意用于合同文件生成。</p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}<span className="ml-0.5 text-rose-500">*</span></label>{children}</div>;
}
