"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, guestLoginAction } from "@/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "登录中…" : "登录"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, {});
  const [guestPending, startGuest] = useTransition();

  function handleGuest() {
    startGuest(() => guestLoginAction());
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
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
        <div>
          <label className="label" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
            required
          />
        </div>
        {state?.error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {state.error}
          </p>
        )}
        <SubmitButton />
      </form>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs text-slate-400">
          <span className="bg-white px-2">或</span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleGuest}
        disabled={guestPending}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
      >
        {guestPending ? "进入中…" : "游客体验（数据模糊）"}
      </button>
    </div>
  );
}
