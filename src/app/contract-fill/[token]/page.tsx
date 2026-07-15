import { FillForm } from "./FillForm";

export const dynamic = "force-dynamic";

export default async function ContractFillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-brand-50/30">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <span className="text-xs font-bold text-white">T</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">THRAIVE 联盟营销</p>
            <p className="text-xs text-slate-400">合同甲方信息填写</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">填写甲方信息</h1>
          <p className="mt-2 text-sm text-slate-500">
            请填写贵司签约主体及联系人信息。页面不会展示合同内部状态、负责人、财务或其他管理信息。
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <FillForm token={token} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED
        </p>
      </main>
    </div>
  );
}
