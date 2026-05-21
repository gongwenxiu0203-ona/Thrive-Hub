import { ForgotForm } from "./ForgotForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "忘记密码 · 联盟营销管理系统" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-xl font-semibold text-slate-900">忘记密码</h1>
          <p className="mt-1 text-sm text-slate-500">
            输入注册邮箱，我们将发送重置链接
          </p>
        </div>
        <ForgotForm />
      </div>
    </div>
  );
}
