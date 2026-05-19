"use client";

import { useState } from "react";
import { Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContractField = { key: string; label: string; value: string };

export function ContractCompare({
  contractText,
  fields,
}: {
  contractText: string;
  fields: ContractField[];
}) {
  const [compare, setCompare] = useState(false);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">合同关键字段</h2>
        <button
          className={cn(
            "btn-sm btn",
            compare
              ? "bg-brand-600 text-white"
              : "border border-slate-300 bg-white text-slate-600",
          )}
          onClick={() => setCompare((v) => !v)}
        >
          <Columns2 className="h-3.5 w-3.5" />
          {compare ? "退出原文对照" : "原文对照模式"}
        </button>
      </div>

      <div className={compare ? "grid gap-4 lg:grid-cols-2" : ""}>
        {compare && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">
              合同原文
            </p>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
              {contractText || "（未保存合同正文，新建/编辑合同时可上传文件或粘贴正文）"}
            </pre>
          </div>
        )}
        <div className="space-y-2">
          {compare && (
            <p className="text-xs font-semibold text-slate-500">
              AI / 规则提取结果
            </p>
          )}
          <dl
            className={
              compare
                ? "space-y-2"
                : "grid gap-x-6 gap-y-3 sm:grid-cols-2"
            }
          >
            {fields.map((f) => (
              <div
                key={f.key}
                className={
                  compare
                    ? "rounded-lg border border-slate-100 bg-white p-2"
                    : ""
                }
              >
                <dt className="text-xs text-slate-400">{f.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {f.value || <span className="text-slate-300">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
