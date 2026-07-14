"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { loginAction } from "@/actions/auth";

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
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0" htmlFor="password">
              密码
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand-600 hover:underline"
              tabIndex={-1}
            >
              忘记密码？
            </Link>
          </div>
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
    </div>
  );
}
