"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CollapsibleCustomerSection({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700">①</div>
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-bold text-slate-700"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          客户信息
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      {expanded && children}
    </div>
  );
}
