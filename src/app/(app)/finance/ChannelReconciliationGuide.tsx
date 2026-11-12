import { CHANNEL_RECONCILIATION_GUIDE, CHANNEL_RECONCILIATION_WARNING } from "@/lib/channelReconciliationGuide";

export function ChannelReconciliationGuide() {
  return <section aria-labelledby="channel-guide-title" className="space-y-3">
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{CHANNEL_RECONCILIATION_WARNING}</p>
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
        <span id="channel-guide-title" className="font-semibold text-slate-900">渠道分账生成规则与办理要求</span>
        <span className="ml-2 text-xs text-slate-600">展开查看权限、到账来源、金额及付款条件</span>
      </summary>
      <dl className="grid gap-x-8 gap-y-5 border-t border-slate-100 px-4 py-4 md:grid-cols-2">
        {CHANNEL_RECONCILIATION_GUIDE.map(item => <div key={item.title}>
          <dt className="text-sm font-semibold text-slate-800">{item.title}</dt>
          <dd className="mt-1 text-sm leading-6 text-slate-600">{item.text}</dd>
        </div>)}
      </dl>
    </details>
  </section>;
}
