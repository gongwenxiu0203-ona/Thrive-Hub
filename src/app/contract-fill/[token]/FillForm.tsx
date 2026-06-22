"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";

interface ContractInfo {
  contractNo: string;
  brandName: string;
  partyAName: string;
  expiry: string;
}

export function FillForm({ token, info }: { token: string; info: ContractInfo }) {
  const [fields, setFields] = useState({
    partyAName: info.partyAName ?? "",
    partyACreditCode: "",
    partyAAddress: "",
    partyAContact: "",
    partyAPhone: "",
    partyAEmail: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 所有甲方字段必填
    const checks: [string, string][] = [
      [fields.partyAName, "甲方签约主体公司名称"],
      [fields.partyACreditCode, "统一社会信用代码"],
      [fields.partyAAddress, "甲方地址"],
      [fields.partyAContact, "甲方指定联系人"],
      [fields.partyAPhone, "联系电话"],
      [fields.partyAEmail, "电子邮箱"],
    ];
    for (const [val, label] of checks) {
      if (!val.trim()) { setError(`请填写${label}`); return; }
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/contract-fill/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "提交失败"); return; }
      setDone(true);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="h-16 w-16 text-emerald-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">信息提交成功！</h2>
        <p className="text-slate-500 text-sm">我们的团队会尽快与您确认合同细节，感谢您的配合。</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        合同编号：<strong>{info.contractNo}</strong>
        {info.brandName && <span className="ml-3 text-slate-500">关联品牌：{info.brandName}</span>}
      </div>

      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-1">甲方信息</h2>
      </div>

      <Field label="甲方签约主体公司名称" required>
        <input className="input" required value={fields.partyAName} onChange={set("partyAName")}
          placeholder="请填写公司全称" />
      </Field>

      <Field label="统一社会信用代码（或其他对应信息）" required>
        <input className="input" required value={fields.partyACreditCode} onChange={set("partyACreditCode")}
          placeholder="18位统一社会信用代码" />
      </Field>

      <Field label="甲方地址" required>
        <input className="input" required value={fields.partyAAddress} onChange={set("partyAAddress")}
          placeholder="公司注册/办公地址" />
      </Field>

      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-1 mt-4">联系人信息</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="甲方指定联系人" required>
          <input className="input" required value={fields.partyAContact} onChange={set("partyAContact")}
            placeholder="联系人姓名" />
        </Field>
        <Field label="联系电话" required>
          <input className="input" required type="tel" value={fields.partyAPhone} onChange={set("partyAPhone")}
            placeholder="手机或座机号码" />
        </Field>
      </div>

      <Field label="电子邮箱" required>
        <input className="input" required type="email" value={fields.partyAEmail} onChange={set("partyAEmail")}
          placeholder="business@company.com" />
      </Field>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-600">
          {error}
        </div>
      )}

      <div className="pt-2">
        <button type="submit" disabled={submitting}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {submitting ? "提交中…" : "确认提交甲方信息"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          提交即表示您确认以上信息真实有效，将用于合同文件生成
        </p>
      </div>
    </form>
  );
}

function Field({ label, required = false, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
