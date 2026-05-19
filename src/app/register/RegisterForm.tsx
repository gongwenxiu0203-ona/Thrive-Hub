"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { registerAction } from "@/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "注册中…" : "注册"}
    </button>
  );
}

const PERMISSIONS = [
  {
    name: "feishuAuth",
    title: "飞书日历同步",
    desc: "授权后可将会议日程自动同步到你的飞书日历",
  },
  {
    name: "googleAuth",
    title: "Google 日历同步",
    desc: "授权后可将会议日程自动同步到你的 Google 日历",
  },
  {
    name: "emailAuth",
    title: "邮件收发",
    desc: "授权后系统可代发会议邀请、通知等邮件",
  },
];

const IDENTITIES = [
  {
    value: "LYNQ_STAFF",
    label: "LYNQ内部员工",
    desc: "联盟营销团队成员，需管理员审核",
  },
  {
    value: "BRAND",
    label: "品牌方/客户",
    desc: "查看自己品牌的销售数据，需管理员审核",
  },
  {
    value: "CHANNEL",
    label: "渠道商",
    desc: "管理自己的客户，立即可用",
  },
];

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, {});
  const [identity, setIdentity] = useState<string>("");

  return (
    <form action={formAction} className="space-y-4">
      {/* Identity selection */}
      <div>
        <label className="label">我的身份</label>
        <input type="hidden" name="identity" value={identity} />
        <div className="grid gap-2">
          {IDENTITIES.map((id) => (
            <label
              key={id.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                identity === id.value
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="_identity_radio"
                value={id.value}
                checked={identity === id.value}
                onChange={() => setIdentity(id.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {id.label}
                </span>
                <span className="block text-xs text-slate-400">{id.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Brand name field for BRAND role */}
      {identity === "BRAND" && (
        <div>
          <label className="label" htmlFor="brandName">
            所属品牌/客户名称
          </label>
          <input
            id="brandName"
            name="brandName"
            className="input"
            placeholder="请输入品牌或客户名称"
            required={identity === "BRAND"}
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="name">
          姓名
        </label>
        <input id="name" name="name" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="email">
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          className="input"
          placeholder="you@company.com"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="至少 6 位"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            确认密码
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            required
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">
          集成授权（可稍后在设置中调整）
        </p>
        <div className="space-y-2">
          {PERMISSIONS.map((p) => (
            <label key={p.name} className="flex items-start gap-2">
              <input
                type="checkbox"
                name={p.name}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm text-slate-700">{p.title}</span>
                <span className="block text-xs text-slate-400">{p.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {state.error}
        </p>
      )}

      {!identity && (
        <p className="text-center text-xs text-slate-400">请先选择身份后继续</p>
      )}

      <SubmitButton />
    </form>
  );
}
