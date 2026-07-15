import { IntakeForm } from "./IntakeForm";
import { verifyIntakeToken } from "@/lib/intakeToken";

export const metadata = {
  title: "品牌信息收集表 · 联盟营销服务",
  robots: { index: false },
};

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const claims = token ? await verifyIntakeToken(token) : null;
  if (!claims || claims.type !== "GENERAL_NEW") return <InvalidLink />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-brand-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            品牌信息收集表
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            请填写贵品牌的基本信息，我们的联盟营销团队会尽快与您联系
          </p>
        </div>
        <div className="card p-6 sm:p-8">
          <IntakeForm token={token} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          您提交的信息将仅用于联盟营销服务对接
        </p>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">链接无效</h1>
        <p className="mt-2 text-sm text-slate-600">请通过工作人员分享的安全链接打开客户信息表。</p>
      </div>
    </div>
  );
}
