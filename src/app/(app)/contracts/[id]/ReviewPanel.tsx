"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { reviewField } from "@/actions/contracts";
import { CONTRACT_REVIEW_GROUPS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type ReviewFieldState = {
  key: string;
  label: string;
  value: string;
  decision: string; // APPROVED | REJECTED
  modification: string;
};

function FieldRow({
  contractId,
  field,
  editable,
}: {
  contractId: string;
  field: ReviewFieldState;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState(field.decision);
  const [modification, setModification] = useState(field.modification);

  function save(nextDecision: string, nextModification: string) {
    startTransition(async () => {
      await reviewField(contractId, field.key, nextDecision, nextModification);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-slate-100 py-3 first:border-t-0 md:grid-cols-12">
      {/* 左：审核内容 */}
      <div className="md:col-span-5">
        <p className="text-xs text-slate-400">{field.label}</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">
          {field.value || <span className="text-slate-300">—</span>}
        </p>
      </div>

      {/* 中：审核意见 */}
      <div className="md:col-span-3">
        <p className="mb-1 text-xs text-slate-400">审核意见</p>
        {editable ? (
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setDecision("APPROVED");
                save("APPROVED", modification);
              }}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs",
                decision === "APPROVED"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-slate-500",
              )}
            >
              <Check className="h-3 w-3" /> 通过
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setDecision("REJECTED");
                save("REJECTED", modification);
              }}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs",
                decision === "REJECTED"
                  ? "bg-rose-600 text-white"
                  : "bg-white text-slate-500",
              )}
            >
              <X className="h-3 w-3" /> 驳回
            </button>
          </div>
        ) : (
          <span
            className={cn(
              "badge",
              decision === "REJECTED"
                ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-700",
            )}
          >
            {decision === "REJECTED" ? "驳回" : "通过"}
          </span>
        )}
      </div>

      {/* 右：修改意见 */}
      <div className="md:col-span-4">
        <p className="mb-1 text-xs text-slate-400">修改意见</p>
        {editable ? (
          <textarea
            className="input text-sm"
            rows={2}
            value={modification}
            placeholder="如需驳回请填写修改意见"
            onChange={(e) => setModification(e.target.value)}
            onBlur={() => save(decision, modification)}
          />
        ) : (
          <p className="text-sm text-slate-600">
            {field.modification || (
              <span className="text-slate-300">—</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReviewPanel({
  contractId,
  contractStatus,
  isAdmin,
  fields,
}: {
  contractId: string;
  contractStatus: string;
  isAdmin: boolean;
  fields: Record<string, ReviewFieldState>;
}) {
  const editable = isAdmin && contractStatus === "REVIEWING";

  return (
    <div className="space-y-4">
      {!editable && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {isAdmin
            ? "合同需处于「合同审核中」状态才能进行字段级审核标注。"
            : "字段级审核仅审核人可操作，此处为只读视图。"}
        </p>
      )}
      {CONTRACT_REVIEW_GROUPS.map((group) => (
        <div key={group.group} className="card p-4">
          <h3 className="mb-1 text-sm font-bold text-slate-700">
            {group.group}
          </h3>
          {group.fields.map((gf) => {
            const state = fields[gf.key];
            if (!state) return null;
            return (
              <FieldRow
                key={gf.key}
                contractId={contractId}
                field={state}
                editable={editable}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
