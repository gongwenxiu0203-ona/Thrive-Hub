import Link from "next/link";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "账号审核中 · 联盟营销管理系统" };

export default async function PendingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4 py-10">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">账号审核中</h1>
        {session && (
          <p className="mb-1 text-sm text-slate-600">
            你好，<span className="font-medium">{session.name}</span>
          </p>
        )}
        <p className="mb-6 text-sm text-slate-500">
          你的账号正在等待管理员审批。审核通过后你将可以正常访问系统。
          <br />
          如有疑问请联系管理员。
        </p>
        <form action={logoutAction}>
          <button type="submit" className="btn-secondary w-full">
            退出登录
          </button>
        </form>
      </div>
    </div>
  );
}
