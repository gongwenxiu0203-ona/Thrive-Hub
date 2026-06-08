import { notFound } from "next/navigation";
import { FillForm } from "./FillForm";

export const dynamic = "force-dynamic";

export default async function ContractFillPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 获取合同基本信息
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/contract-fill/${token}`, { cache: "no-store" });

  if (res.status === 404 || res.status === 410) {
    notFound();
  }

  if (!res.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500">链接暂时不可用，请联系我们的团队</p>
        </div>
      </div>
    );
  }

  const info = await res.json();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-brand-50/30">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <span className="text-xs font-bold text-white">T</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">THRAIVE 联盟营销</p>
            <p className="text-xs text-slate-400">合同信息填写</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">填写甲方信息</h1>
          <p className="mt-2 text-sm text-slate-500">
            请填写贵司的基本信息，这些信息将用于生成正式合同文件。所有信息仅用于合同相关用途。
          </p>
          {info.expiry && (
            <p className="mt-1 text-xs text-amber-600">
              链接有效期至：{new Date(info.expiry).toLocaleDateString("zh-CN")}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <FillForm token={token} info={info} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED · 如有疑问请联系 ledo.h@thraiveagency.com
        </p>
      </main>
    </div>
  );
}
