"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function TaskModeTabs({ mode }: { mode: "owned" | "published" }) {
  const searchParams = useSearchParams();

  function href(nextMode: "owned" | "published") {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "owned") params.delete("mode");
    else params.set("mode", nextMode);
    const query = params.toString();
    return query ? `/tasks?${query}` : "/tasks";
  }

  const tabs = [
    { value: "owned" as const, label: "我负责的", icon: ClipboardList },
    { value: "published" as const, label: "我发起的", icon: Send },
  ];

  return (
    <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = mode === tab.value;
        return (
          <Link
            key={tab.value}
            href={href(tab.value)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
