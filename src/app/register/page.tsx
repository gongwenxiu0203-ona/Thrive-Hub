import Link from "next/link";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "注册 · 联盟营销管理系统" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            注册账号
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            使用邮箱注册，加入联盟营销团队
          </p>
        </div>
        <RegisterForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          已有账号？
          <Link href="/login" className="ml-1 text-brand-600 hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
