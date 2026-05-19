import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "提交成功 · 联盟营销服务",
  robots: { index: false },
};

export default function IntakeSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4">
      <div className="card max-w-md p-10 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          提交成功
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          感谢您的填写！我们的联盟营销团队已收到您的信息，会尽快与您联系。
        </p>
        <Link href="/intake" className="btn-secondary mt-6 inline-flex">
          再填写一份
        </Link>
      </div>
    </div>
  );
}
