import { IntakeForm } from "./IntakeForm";

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
  const channelId = sp.channel ?? "";
  const staffId = sp.staff ?? "";

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
          <IntakeForm channelId={channelId} staffId={staffId} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          您提交的信息将仅用于联盟营销服务对接
        </p>
      </div>
    </div>
  );
}
