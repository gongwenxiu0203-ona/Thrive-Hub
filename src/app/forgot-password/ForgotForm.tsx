"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/actions/auth";
import Link from "next/link";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      className="btn-primary w-full"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          发送中…
        </>
      ) : (
        <>
          <Mail className="h-4 w-4" />
          发送重置链接
        </>
      )}
    </button>
  );
}

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  if (state?.success) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">请查收邮件</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          如果该邮箱已在系统中注册，重置链接已发送至您的邮箱。
          <br />
          链接有效期为 <strong>1 小时</strong>，请尽快操作。
        </p>
        <p className="text-xs text-slate-400">未收到？请检查垃圾邮件文件夹</p>
        <Link href="/login" className="btn-secondary w-full justify-center mt-2">
          <ArrowLeft className="h-4 w-4" />
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          注册邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="input"
          placeholder="you@company.com"
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {state.error}
        </p>
      )}

      <SubmitButton pending={pending} />

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回登录
      </Link>
    </form>
  );
}
