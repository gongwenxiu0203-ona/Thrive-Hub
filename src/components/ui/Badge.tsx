import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("badge", className ?? "bg-slate-100 text-slate-700")}>
      {children}
    </span>
  );
}
