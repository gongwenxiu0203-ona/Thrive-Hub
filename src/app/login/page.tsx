import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "登录 · 联盟营销管理系统" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const passwordReset = sp.reset === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            联盟营销管理系统
          </h1>
          <p className="mt-1 text-sm text-slate-500">登录以进入工作台</p>
        </div>

        {passwordReset && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            密码已重置成功，请使用新密码登录
          </div>
        )}

        <LoginForm />

        <p className="mt-6 text-center text-sm text-slate-500">
          还没有账号？
          <Link href="/register" className="ml-1 text-brand-600 hover:underline">
            注册新账号
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          演示账号：admin@demo.com / admin123
        </p>
      </div>
    </div>
  );
}
