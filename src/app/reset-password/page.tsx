import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ResetForm } from "./ResetForm";
import { ArrowLeft, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "重置密码 · Thraive联盟营销系统" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";

  // Validate the token before rendering the form.
  let isValid = false;
  if (token) {
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });
    isValid = !!record && record.expiresAt > new Date();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-xl font-semibold text-slate-900">重置密码</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isValid ? "请设置您的新密码" : "链接无效或已过期"}
          </p>
        </div>

        {isValid ? (
          <ResetForm token={token} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                该重置链接已失效或已被使用。重置链接有效期为 1 小时，请重新申请。
              </p>
            </div>
            <Link
              href="/forgot-password"
              className="btn-primary w-full justify-center"
            >
              重新申请重置链接
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回登录
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
