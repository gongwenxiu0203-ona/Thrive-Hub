import { Inbox } from "lucide-react";

export function EmptyState({
  title = "暂无数据",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#dcd4e7] bg-white px-6 py-16 text-center">
      <Inbox className="h-10 w-10 text-brand-200" />
      <p className="mt-3 text-sm font-medium text-slate-600">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
