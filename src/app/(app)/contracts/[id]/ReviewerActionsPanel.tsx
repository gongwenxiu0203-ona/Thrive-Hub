"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, FileText, AlertCircle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import {
  approveCurrentReview,
  rejectCurrentReview,
  upsertFieldComment,
  addAnnotation,
} from "@/actions/contractReview";
import { formatDateTime } from "@/lib/utils";

export interface ReviewCommentRow {
  id: string;
  fieldKey: string;
  comment: string;
  decision: string;
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

export interface ReviewFieldRow {
  key: string;
  label: string;
  value: string;
}

export function ReviewerActionsPanel({
  contractId,
  contractStatus,
  canAct,
  currentReview,
  history,
  annotations,
  fields,
  roundDiff,
  sourceUrl,
}: {
  contractId: string;
  contractStatus: string;
  canAct: boolean;
  currentReview: ReviewRoundRow | null;
  history: ReviewRoundRow[];
  annotations: ReviewAnnotationRow[];
  fields: ReviewFieldRow[];
  roundDiff: RoundDiffEntry[];
  sourceUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(!currentReview && history.length > 0);
  const fieldLabels = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, field.label])),
    [fields],
  );

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
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex items-start gap-2 text-left"
        >
          {collapsed ? <ChevronRight className="mt-0.5 h-4 w-4 text-slate-400" /> : <ChevronDown className="mt-0.5 h-4 w-4 text-slate-400" />}
          <span>
          <h2 className="font-semibold text-slate-900">合同审核{collapsed ? "（已完成，点击展开）" : ""}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {history.length === 0 ? "本合同还没有提交过审核。" : `共 ${history.length} 轮审核记录。`}
          </p>
          </span>
        </button>
        <div className="flex items-center gap-2">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" /> 查看原文/在线查看
            </a>
          )}
          {canAct && currentReview && (
            <>
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
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </div>
      )}

      {contractStatus === "REJECTED" && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            合同已被退回，请按审核意见修改后重新提交。
            {annotations.length > 0 ? " 合同有原文批注待查看。" : ""}
          </p>
        </div>
      )}

      {currentReview && currentReview.round >= 2 && roundDiff.length > 0 && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="mb-2 text-xs font-semibold text-sky-700">
            本轮（第 {currentReview.round} 轮）相对上一轮变动的字段（共 {roundDiff.length}）
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
        </div>
      )}

      {currentReview && currentReview.round >= 2 && roundDiff.length === 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          本轮相比上一轮无字段变动。
        </div>
      )}

      {canAct && currentReview && (
        <FieldDecisionEditor
          reviewId={currentReview.id}
          existing={currentReview.comments}
          fields={fields}
          onChange={() => router.refresh()}
        />
      )}

      {canAct && currentReview && (
        <SourceAnnotationBox
          contractId={contractId}
          annotations={annotations}
          onAdded={() => router.refresh()}
        />
      )}

      {history.length > 0 && (
        <ReviewHistory rounds={history} fieldLabels={fieldLabels} />
      )}

      {annotations.length > 0 && (
        <AnnotationList annotations={annotations} />
      )}
        </>
      )}
    </section>
  );
}

function FieldDecisionEditor({
  reviewId,
  existing,
  fields,
  onChange,
}: {
  reviewId: string;
  existing: ReviewCommentRow[];
  fields: ReviewFieldRow[];
  onChange: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const existingByKey = useMemo(() => new Map(existing.map((c) => [c.fieldKey, c])), [existing]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing.map((c) => [c.fieldKey, c.comment])),
  );
  const [decisions, setDecisions] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing.map((c) => [c.fieldKey, c.decision || "PENDING"])),
  );

  function save(fieldKey: string, decision: "APPROVED" | "REJECTED") {
    setError(null);
    const comment = drafts[fieldKey]?.trim() ?? "";
    if (decision === "REJECTED" && !comment) {
      setError("驳回字段时需要填写审核意见");
      return;
    }
    startTransition(async () => {
      const r = await upsertFieldComment(reviewId, fieldKey, comment, null, decision);
      if (!r.ok) { setError(r.error); return; }
      setDecisions((prev) => ({ ...prev, [fieldKey]: decision }));
      onChange();
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-[minmax(0,1.5fr)_160px_minmax(220px,1fr)] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        <div>字段及填写内容</div>
        <div>审核结果</div>
        <div>审核意见</div>
      </div>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      <div className="divide-y divide-slate-100">
        {fields.map((field) => {
          const saved = existingByKey.get(field.key);
          const decision = decisions[field.key] ?? saved?.decision ?? "APPROVED";
          return (
            <div key={field.key} className="grid grid-cols-[minmax(0,1.5fr)_160px_minmax(220px,1fr)] gap-3 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{field.label}</p>
                <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 px-2 py-1.5 text-sm text-slate-600">
                  {field.value || "（空）"}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save(field.key, "APPROVED")}
                  className={`rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    decision === "APPROVED"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  通过
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save(field.key, "REJECTED")}
                  className={`rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    decision === "REJECTED"
                      ? "border-rose-500 bg-rose-50 text-rose-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  驳回
                </button>
              </div>
              <textarea
                rows={2}
                value={drafts[field.key] ?? saved?.comment ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                onBlur={() => {
                  const nextDecision = (decisions[field.key] ?? saved?.decision ?? "APPROVED") as "APPROVED" | "REJECTED";
                  if ((drafts[field.key] ?? "") !== (saved?.comment ?? "")) save(field.key, nextDecision);
                }}
                placeholder="审核意见（一键通过可不填，驳回必填）"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceAnnotationBox({
  contractId,
  annotations,
  onAdded,
}: {
  contractId: string;
  annotations: ReviewAnnotationRow[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-600"
      >
        <span>查看原文 / 在线批注{annotations.length ? `（已有 ${annotations.length} 条）` : ""}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="在这里记录对合同原文的批注；退回时提交人会看到“合同有批注待查看”的提示。"
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
      )}
    </div>
  );
}

function ReviewHistory({
  rounds,
  fieldLabels,
}: {
  rounds: ReviewRoundRow[];
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
                <span className={`ml-2 rounded px-2 py-0.5 text-[11px] ${
                  r.status === "APPROVED"
                    ? "bg-emerald-100 text-emerald-700"
                    : r.status === "REJECTED"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                }`}>
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
                    <span className={c.decision === "REJECTED" ? "text-rose-700" : "text-emerald-700"}>
                      {c.decision === "REJECTED" ? "驳回" : c.decision === "APPROVED" ? "通过" : "意见"}
                    </span>
                    {c.comment ? ` - ${c.comment}` : ""}
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
      <p className="mb-2 text-xs text-slate-500">合同原文批注（{annotations.length}）</p>
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
