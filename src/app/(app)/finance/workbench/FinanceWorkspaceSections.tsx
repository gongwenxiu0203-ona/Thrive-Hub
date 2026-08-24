"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

export function FinanceWorkspaceSections({ workbench, flows }: { workbench: ReactNode; flows: ReactNode }) {
  const search = useSearchParams();
  const [section, setSection] = useState<"WORKBENCH" | "FLOWS">(
    search.get("action") === "new-billing" ? "FLOWS" : "WORKBENCH",
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg border border-[#e7e0ef] bg-white p-1.5" aria-label="财务工作台主要区域">
        <button
          type="button"
          onClick={() => setSection("FLOWS")}
          className={`min-h-11 flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${section === "FLOWS" ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
        >
          财务流程
          <span className={`ml-2 text-xs font-normal ${section === "FLOWS" ? "text-white/80" : "text-slate-500"}`}>发起开票、付款、报销与维护资料</span>
        </button>
        <button
          type="button"
          onClick={() => setSection("WORKBENCH")}
          className={`min-h-11 flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${section === "WORKBENCH" ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
        >
          财务工作台
          <span className={`ml-2 text-xs font-normal ${section === "WORKBENCH" ? "text-white/80" : "text-slate-500"}`}>开票申请、应收核销与渠道付款</span>
        </button>
      </div>
      {section === "WORKBENCH" ? workbench : flows}
    </div>
  );
}
