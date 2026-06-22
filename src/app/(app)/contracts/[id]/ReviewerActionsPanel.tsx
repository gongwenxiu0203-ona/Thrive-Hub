"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, MessageSquarePlus, FileText, AlertCircle } from "lucide-react";
import {
  approveCurrentReview,
  rejectCurrentReview,
  upsertFieldComment,
  deleteFieldComment,
  addAnnotation,
} from "@/actions/contractReview";
import { formatDateTime } from "@/lib/utils";

export interface ReviewCommentRow {
  id: string;
  fieldKey: string;
  comment: string;
  annotationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAnnotationRow {
  id: string;
  versionNo: number;
  content: string;
  fileUrl: string | null;
  createdAt: string;
}

export interface ReviewRoundRow {
  id: string;
  round: number;
  status: string;
  reviewerName: string;
  createdAt: string;
  updatedAt: string;
  comments: ReviewCommentRow[];
}

export interface RoundDiffEntry {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function ReviewerActionsPanel({
  contractId,
  contractStatus,
  canAct,
  currentReview,
  history,
  annotations,
  fieldLabels,
  roundDiff,
}: {
  contractId: string;
  contractStatus: string;
  canAct: boolean;             // 当前用户是 reviewer/admin 且合同处于 REVIEWING
  currentReview: ReviewRoundRow | null;
  history: ReviewRoundRow[];   // 完整历史（含 currentReview）
  annotations: ReviewAnnotationRow[];
  fieldLabels: Record<string, string>;
  roundDiff: RoundDiffEntry[]; // 第二轮起：本轮相对上一轮的字段变动；第一轮为空数组
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doApprove() {
    setError(null);
    startTransition(async () => {
      const r = await approveCurrentReview(contractId);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }
  function doReject() {
    setError(null);
    startTransition(async () => {
      const r = await rejectCurrentReview(contractId);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">合同审核</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {history.length === 0
              ? "本合同还没有提交过审核。"
              : `共 ${history.length} 轮审核记录。`}
          </p>
        </div>
        {canAct && currentReview && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doReject}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> 退回
            </button>
            <button
              type="button"
              onClick={doApprove}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> 通过
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
          {error}
        </div>
      )}

      {contractStatus === "REJECTED" && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>合同被退回。请按以下意见修改后，在「合同流程」面板重新提交审核。</p>
        </div>
      )}

      {currentReview && currentReview.round >= 2 && roundDiff.length > 0 && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="mb-2 text-xs font-semibold text-sky-700">
            本轮（第 {currentReview.round} 轮）相比上一轮变动的字段（共 {roundDiff.length}）
          </p>
          <ul className="space-y-1.5">
            {roundDiff.map((d) => (
              <li key={d.key} className="rounded bg-white px-2 py-1.5 text-sm">
                <span className="text-xs font-semibold text-slate-500">{d.label}：</span>
                <span className="text-rose-600 line-through">{d.from || "（空）"}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-emerald-700">{d.to || "（空）"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-sky-700">仅显示变动字段，未变动字段沿用上一轮提交版本。</p>
        </div>
      )}
      {currentReview && currentReview.round >= 2 && roundDiff.length === 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          本轮相比上一轮无字段变动。
        </div>
      )}

      {canAct && currentReview && (
        <CommentEditor
          reviewId={currentReview.id}
          existing={currentReview.comments}
          fieldLabels={fieldLabels}
          onChange={() => router.refresh()}
        />
      )}

      {canAct && currentReview && (
        <AnnotationCreator
          contractId={contractId}
          onAdded={() => router.refresh()}
        />
      )}

      {history.length > 0 && (
        <ReviewHistory rounds={history} annotations={annotations} fieldLabels={fieldLabels} />
      )}

      {annotations.length > 0 && (
        <AnnotationList annotations={annotations} />
      )}
    </section>
  );
}

function CommentEditor({
  reviewId,
  existing,
  fieldLabels,
  onChange,
}: {
  reviewId: string;
  existing: ReviewCommentRow[];
  fieldLabels: Record<string, string>;
  onChange: () => void;
}) {
  const [fieldKey, setFieldKey] = useState<string>("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!fieldKey) { setError("请选择字段"); return; }
    if (!comment.trim()) { setError("请填写意见"); return; }
    startTransition(async () => {
      const r = await upsertFieldComment(reviewId, fieldKey, comment.trim(), null);
      if (!r.ok) { setError(r.error); return; }
      setComment("");
      onChange();
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await deleteFieldComment(id);
      if (!r.ok) { setError(r.error); return; }
      onChange();
    });
  }

  const fieldOptions = Object.entries(fieldLabels);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">为字段填写审核意见</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={fieldKey}
          onChange={(e) => setFieldKey(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1.5 text-sm"
        >
          <option value="">选择字段…</option>
          {fieldOptions.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="对该字段的修改意见"
          className="flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={add}
          className="flex items-center justify-center gap-1 rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" /> 保存
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}

      {existing.length > 0 && (
        <ul className="mt-3 space-y-2">
          {existing.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded bg-slate-50 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-700">
                  {fieldLabels[c.fieldKey] ?? c.fieldKey}
                </p>
                <p className="mt-0.5 text-sm text-slate-700">{c.comment}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(c.id)}
                className="text-xs text-rose-600 hover:underline"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnotationCreator({
  contractId,
  onAdded,
}: {
  contractId: string;
  onAdded: () => void;
}) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!content.trim()) { setError("请填写批注内容"); return; }
    startTransition(async () => {
      const r = await addAnnotation(contractId, content.trim());
      if (!r.ok) { setError(r.error); return; }
      setContent("");
      onAdded();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">合同源文件批注（系统内显示）</p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
        placeholder="对合同源文件的批注；提交后会随审核记录退回给提交人。"
      />
      <div className="mt-2 flex items-center justify-between">
        {error ? <p className="text-xs text-rose-600">{error}</p> : <span />}
        <button
          type="button"
          disabled={pending}
          onClick={add}
          className="flex items-center gap-1 rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <FileText className="h-4 w-4" /> 添加批注
        </button>
      </div>
    </div>
  );
}

function ReviewHistory({
  rounds,
  fieldLabels,
}: {
  rounds: ReviewRoundRow[];
  annotations: ReviewAnnotationRow[];
  fieldLabels: Record<string, string>;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs text-slate-500">审核历史</p>
      <ol className="space-y-3">
        {rounds.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-800">
                第 {r.round} 轮
                <span
                  className={`ml-2 rounded px-2 py-0.5 text-[11px] ${
                    r.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-700"
                      : r.status === "REJECTED"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.status === "APPROVED" ? "通过" : r.status === "REJECTED" ? "退回" : "审核中"}
                </span>
              </p>
              <span className="text-[11px] text-slate-400">
                {r.reviewerName} · {formatDateTime(new Date(r.updatedAt))}
              </span>
            </div>
            {r.comments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {r.comments.map((c) => (
                  <li key={c.id} className="rounded bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                    <span className="mr-2 text-xs font-semibold text-slate-500">
                      {fieldLabels[c.fieldKey] ?? c.fieldKey}：
                    </span>
                    {c.comment}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AnnotationList({ annotations }: { annotations: ReviewAnnotationRow[] }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs text-slate-500">合同源文件批注（{annotations.length}）</p>
      <ul className="space-y-2">
        {annotations.map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                v{a.versionNo} · {formatDateTime(new Date(a.createdAt))}
              </p>
              {a.fileUrl && (
                <a
                  href={`/api/contracts/annotation-download/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-700 hover:underline"
                >
                  下载带批注文件
                </a>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{a.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
