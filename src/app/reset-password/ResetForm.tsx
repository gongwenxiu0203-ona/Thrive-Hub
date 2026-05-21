"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/actions/auth";
import { Loader2, KeyRound } from "lucide-react";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          保存中…
        </>
      ) : (
        <>
          <KeyRound className="h-4 w-4" />
          设置新密码
        </>
      )}
    </button>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden token field */}
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="password">
          新密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder="至少 6 位字符"
          minLength={6}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="confirm">
          确认新密码
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder="再次输入新密码"
          minLength={6}
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {state.error}
        </p>
      )}

      <SubmitButton pending={pending} />
    </form>
  );
}
