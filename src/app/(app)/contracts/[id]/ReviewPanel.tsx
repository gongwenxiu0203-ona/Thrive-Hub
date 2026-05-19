"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Lock, AlertCircle } from "lucide-react";
import { reviewField, saveReviewComment } from "@/actions/contracts";
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
  locked,
}: {
  contractId: string;
  field: ReviewFieldState;
  editable: boolean;
  locked: boolean;
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

  const isRejected = decision === "REJECTED";

  return (
    <div className={cn(
      "grid grid-cols-1 gap-3 border-t border-slate-100 py-3 first:border-t-0 md:grid-cols-12",
      isRejected && editable && "rounded-lg bg-rose-50/60 px-2",
      locked && "opacity-60",
    )}>
      {/* 左：审核内容 */}
      <div className="md:col-span-5">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-slate-400">{field.label}</p>
          {locked && (
            <span className="flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              <Lock className="h-2.5 w-2.5" /> 已锁定
            </span>
          )}
          {isRejected && !locked && (
            <span className="flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-600">
              <AlertCircle className="h-2.5 w-2.5" /> 需重审
            </span>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">
          {field.value || <span className="text-slate-300">—</span>}
        </p>
      </div>

      {/* 中：审核意见 */}
      <div className="md:col-span-3">
        <p className="mb-1 text-xs text-slate-400">审核意见</p>
        {editable && !locked ? (
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
        {editable && !locked ? (
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

function ReviewCommentBox({
  contractId,
  initialComment,
  editable,
}: {
  contractId: string;
  initialComment: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState(initialComment);

  function save() {
    startTransition(async () => {
      await saveReviewComment(contractId, comment);
      router.refresh();
    });
  }

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-slate-700">整体审核意见</h3>
      {editable ? (
        <textarea
          className="input text-sm"
          rows={3}
          value={comment}
          placeholder="填写整体审核意见（可选）…"
          onChange={(e) => setComment(e.target.value)}
          onBlur={save}
          disabled={pending}
        />
      ) : (
        <p className="text-sm text-slate-600 whitespace-pre-wrap">
          {comment || <span className="text-slate-400">暂无整体意见</span>}
        </p>
      )}
    </div>
  );
}

export function ReviewPanel({
  contractId,
  contractStatus,
  isAdmin,
  fields,
  lockedFieldKeys,
  reviewComment,
}: {
  contractId: string;
  contractStatus: string;
  isAdmin: boolean;
  fields: Record<string, ReviewFieldState>;
  lockedFieldKeys: string[];
  reviewComment: string;
}) {
  const editable = isAdmin && contractStatus === "REVIEWING";
  const lockedSet = new Set(lockedFieldKeys);
  const hasRejected = Object.values(fields).some((f) => f.decision === "REJECTED");

  return (
    <div className="space-y-4">
      {!editable && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {isAdmin
            ? "合同需处于「合同审核中」状态才能进行字段级审核标注。"
            : "字段级审核仅审核人可操作，此处为只读视图。"}
        </p>
      )}

      {editable && lockedFieldKeys.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          上轮已通过的字段已锁定，仅需重审被驳回的字段
        </div>
      )}

      {editable && hasRejected && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          存在被驳回的字段，完成审核后将退回给提交人修改
        </div>
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
                locked={lockedSet.has(gf.key)}
              />
            );
          })}
        </div>
      ))}

      <ReviewCommentBox
        contractId={contractId}
        initialComment={reviewComment}
        editable={editable}
      />
    </div>
  );
}
