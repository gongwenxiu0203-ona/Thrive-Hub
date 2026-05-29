import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "注册 · Thraive联盟营销系统" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ inviter?: string }>;
}) {
  const sp = await searchParams;
  let inviterName: string | null = null;
  if (sp.inviter) {
    const u = await prisma.user.findUnique({
      where: { id: sp.inviter },
      select: { name: true },
    });
    if (u) inviterName = u.name;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-xl font-semibold text-slate-900">注册账号</h1>
          <p className="mt-1 text-sm text-slate-500">
            使用邮箱注册，加入联盟营销团队
          </p>
          {inviterName && (
            <p className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
              邀请人：{inviterName}
            </p>
          )}
        </div>
        <RegisterForm inviterId={sp.inviter ?? ""} />
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
