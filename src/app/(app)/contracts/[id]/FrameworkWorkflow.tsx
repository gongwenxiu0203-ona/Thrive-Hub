"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, Send, SkipForward, XCircle } from "lucide-react";
import { decideFrameworkReview, skipFrameworkReview, submitFrameworkForReview } from "@/actions/frameworkContractReview";

export type FrameworkTimelineRow = {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
};

const actionLabels: Record<string, string> = {
  CREATE_FRAMEWORK: "创建主格式合同",
  UPDATE_FRAMEWORK: "修改主合同资料",
  SAVE_CONFIRMATION_DRAFT: "修改项目确认书",
  SAVE_REPLACEMENT_DRAFT: "建立确认书替换版本",
  EXPORT_FRAMEWORK: "导出合同文件",
  SUBMIT_REVIEW: "提交合同审核",
  SKIP_REVIEW: "跳过审核",
  APPROVE_REVIEW: "审核通过",
  REJECT_REVIEW: "审核退回",
  ARCHIVE_SIGNED_FRAMEWORK: "上传签署完成原件",
  INVALIDATE_SIGNED_FILE: "确认书修改并撤销当前签署件",
  VERSION_FILE: "合同文件版本",
  REVIEW_ROUND: "审核轮次记录",
};

const statusLabels: Record<string, string> = { DRAFT: "草稿", REVIEWING: "审核中", REJECTED: "审核退回", SIGNING: "待签署", COMPLETED: "签署完成" };

export function FrameworkWorkflow({ contractId, status, reviewerName, canEdit, canReview, selectedExportUrl, timeline }: { contractId: string; status: string; reviewerName: string; canEdit: boolean; canReview: boolean; selectedExportUrl: string; timeline: FrameworkTimelineRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(true);

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError("");
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return setError(result.error);
      after?.();
      router.refresh();
    });
  }

  function skipAndExport() {
    run(() => skipFrameworkReview(contractId), () => window.location.assign(selectedExportUrl));
  }

  const stages = [
    { key: "DRAFT", label: "字段完整", description: "选择审核方式" },
    { key: "REVIEWING", label: "合同审核", description: "默认提交审核" },
    { key: "SIGNING", label: "合同签署中", description: "导出并线下签署" },
    { key: "COMPLETED", label: "签署完成", description: "完整原件已归档" },
  ];
  const activeIndex = status === "REJECTED" ? 0 : Math.max(0, stages.findIndex((item) => item.key === status));

  return <section className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="mb-5 overflow-x-auto border-b border-slate-100 pb-5"><ol className="flex min-w-[680px] items-start">{stages.map((stage, index) => <li key={stage.key} className="relative flex flex-1 items-start gap-3 pr-5 before:absolute before:left-7 before:right-0 before:top-3 before:h-px before:bg-slate-200 last:before:hidden"><span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index < activeIndex ? "bg-emerald-600 text-white" : index === activeIndex ? "bg-purple-600 text-white ring-4 ring-purple-100" : "bg-slate-100 text-slate-500"}`}>{index < activeIndex ? "✓" : index + 1}</span><span><b className={`block text-sm ${index === activeIndex ? "text-purple-800" : "text-slate-800"}`}>{stage.label}</b><span className="mt-0.5 block text-xs text-slate-500">{stage.description}</span></span></li>)}</ol>{status === "REJECTED" && <p className="mt-3 text-sm text-red-700">审核已退回：修改合同或项目确认书并填写原因后，可重新提交审核。</p>}</div>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><h2 className="font-semibold text-slate-950">审核、导出与操作记录</h2><p className="mt-1 text-sm text-slate-600">当前状态：{statusLabels[status] || status} · 审核人：{reviewerName || "未设置"}</p></div>
      <div className="flex flex-wrap gap-2">
        {canEdit && ["DRAFT", "REJECTED"].includes(status) && <>
          <button className="btn-primary inline-flex items-center gap-1.5 text-sm" disabled={busy} onClick={() => run(() => submitFrameworkForReview(contractId))}><Send className="h-4 w-4" />提交审核</button>
          <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" disabled={busy} onClick={skipAndExport}><SkipForward className="h-4 w-4" />跳过审核并导出</button>
        </>}
        {["SIGNING", "REVIEWING"].includes(status) && <a className="btn-secondary inline-flex items-center gap-1.5 text-sm" href={selectedExportUrl}><Download className="h-4 w-4" />导出当前合同</a>}
      </div>
    </div>
    {canReview && status === "REVIEWING" && <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50/60 p-4"><label className="text-sm font-medium text-slate-800">审核意见（退回时必填）<textarea className="input mt-2 bg-white" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} /></label><div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary inline-flex items-center gap-1.5 text-sm" disabled={busy} onClick={() => run(() => decideFrameworkReview(contractId, "APPROVE", comment))}><CheckCircle2 className="h-4 w-4" />审核通过</button><button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700" disabled={busy} onClick={() => run(() => decideFrameworkReview(contractId, "REJECT", comment))}><XCircle className="h-4 w-4" />退回修改</button></div></div>}
    {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 border-t border-slate-100 pt-4">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((value) => !value)}><span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800"><Clock3 className="h-4 w-4 text-purple-600" />操作时间线（{timeline.length}）</span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      {open && <ol className="relative mt-4 space-y-4 border-l-2 border-slate-200 pl-6">{timeline.map((row) => <li key={row.id} className="relative"><span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white bg-purple-500 ring-1 ring-purple-200" /><div className="rounded-lg bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-900">{actionLabels[row.action] || row.action}</p><time className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString("zh-CN", { hour12: false })}</time></div><p className="mt-1 text-xs text-slate-600">{row.actor}{row.fromStatus || row.toStatus ? ` · ${statusLabels[row.fromStatus || ""] || row.fromStatus || "—"} → ${statusLabels[row.toStatus || ""] || row.toStatus || "—"}` : ""}</p>{row.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{row.note}</p>}</div></li>)}{!timeline.length && <li className="text-sm text-slate-500">暂无操作记录</li>}</ol>}
    </div>
  </section>;
}
