import { OperationPermissionNotice } from "@/components/OperationPermissionNotice";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-start gap-1">
          <h1 className="text-[26px] font-semibold leading-8 text-slate-900">{title}</h1>
          <OperationPermissionNotice />
        </div>
        {description && (
          <p className="mt-1.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
