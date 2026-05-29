"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * 数据范围切换器：仅显示给内部员工（ADMIN/USER）
 * - 我的：只看自己负责/创建的数据（默认）
 * - 全部：查看系统全部数据
 */
export function ScopeToggle({ canToggle = true }: { canToggle?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current: "mine" | "all" = sp.get("scope") === "all" ? "all" : "mine";

  if (!canToggle) return null;

  function setScope(v: "mine" | "all") {
    const params = new URLSearchParams(sp.toString());
    if (v === "all") params.set("scope", "all");
    else params.delete("scope");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => setScope("mine")}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          current === "mine"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        我的
      </button>
      <button
        type="button"
        onClick={() => setScope("all")}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          current === "all"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        全部
      </button>
    </div>
  );
}
