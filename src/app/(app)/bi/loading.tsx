export default function BILoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="推广数据 BI 加载中">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-8 w-36 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="flex gap-5 border-b border-slate-200 pb-2">
        {["w-20", "w-20", "w-20", "w-20", "w-20"].map((width, index) => (
          <div key={index} className={`h-5 ${width} animate-pulse rounded bg-slate-100`} />
        ))}
      </div>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded border border-slate-100 bg-slate-50" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
