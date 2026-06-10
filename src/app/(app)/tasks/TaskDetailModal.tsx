"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PlayCircle,
  ClipboardCheck,
  XCircle,
  Undo2,
  CheckCircle2,
  Save,
  CalendarClock,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FileUploader, type AttachmentItem } from "@/components/FileUploader";
import {
  setTaskStatus,
  submitTaskForReview,
  returnTask,
  updateTaskContent,
  updateTaskLinks,
  submitMeetingInfo,
} from "@/actions/tasks";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_CATEGORY_LABELS,
  MEETING_MODE_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate, toInputDate } from "@/lib/utils";

type Option = { id: string; name: string };

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string;
  priority: string;
  returnReason: string | null;
  customerName: string | null;
  ownerName: string | null;
  publisherName: string | null;
  dueDate: string | null;
  meetingTime: string | null;
  meetingMode: string | null;
  meetingLocation: string | null;
  attendees: string[];
  externalLinks: { label: string; url: string }[];
};

export function TaskDetailModal({
  task,
  users,
  attachments,
  open,
  onClose,
}: {
  task: TaskDetail;
  users: Option[];
  attachments: AttachmentItem[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [reviewDue, setReviewDue] = useState("");

  // External links state
  const [links, setLinks] = useState<{ label: string; url: string }[]>(task.externalLinks ?? []);
  const [linksSaving, setLinksSaving] = useState(false);
  const [linksSaved, setLinksSaved] = useState(false);

  function addLink() {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }
  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLink(i: number, key: "label" | "url", val: string) {
    setLinks((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  }
  async function saveLinks() {
    setLinksSaving(true);
    setLinksSaved(false);
    try {
      await updateTaskLinks(task.id, links.filter(l => l.url.trim()));
      router.refresh();
      setLinksSaved(true);
      setTimeout(() => setLinksSaved(false), 2500);
    } finally { setLinksSaving(false); }
  }

  // meeting form
  const [mTime, setMTime] = useState(
    task.meetingTime ? task.meetingTime.slice(0, 16) : "",
  );
  const [mMode, setMMode] = useState(task.meetingMode ?? "ONLINE");
  const [mLocation, setMLocation] = useState(task.meetingLocation ?? "");
  const [mAttendees, setMAttendees] = useState<string[]>(task.attendees);

  function run(fn: () => Promise<unknown>, closeOnSuccess = false) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        if (closeOnSuccess) onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });
  }

  function close() {
    setShowReturn(false);
    setShowReview(false);
    setError(null);
    onClose();
  }

  const isMeeting = task.category === "MEETING_BOOKING";

  return (
    <Modal open={open} onClose={close} title="任务详情" wide>
      <div className="space-y-4">
        {/* header: status badges + contextual action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={TASK_STATUS_COLORS[task.status]}>
              {labelOf(TASK_STATUS_LABELS, task.status)}
            </Badge>
            <Badge className={TASK_PRIORITY_COLORS[task.priority]}>
              {labelOf(TASK_PRIORITY_LABELS, task.priority)}
            </Badge>
            <Badge className="bg-slate-100 text-slate-600">
              {labelOf(TASK_CATEGORY_LABELS, task.category)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {(task.status === "TODO" || task.status === "RETURNED") && (
              <button
                className="btn bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                disabled={pending}
                onClick={() => run(() => setTaskStatus(task.id, "IN_PROGRESS"))}
              >
                <PlayCircle className="h-4 w-4" /> 开始处理
              </button>
            )}
            {task.status === "IN_PROGRESS" && (
              <button
                className="btn bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                disabled={pending}
                onClick={() => setShowReview(true)}
              >
                <ClipboardCheck className="h-4 w-4" /> 提交审核
              </button>
            )}
            {task.status === "REVIEW" && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-700">
                <ClipboardCheck className="h-4 w-4" /> 已提交审核，等待审核人确认
              </span>
            )}
            {task.status === "DONE" && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> 任务已完成
              </span>
            )}
          </div>
        </div>

        {task.status === "RETURNED" && task.returnReason && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span className="font-medium">退回理由：</span>
            {task.returnReason}
          </div>
        )}

        {/* 可编辑文本 */}
        <div className="space-y-3">
          <div>
            <label className="label">任务标题</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label">任务描述</label>
            <textarea
              className="input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary btn-sm"
            disabled={pending}
            onClick={() =>
              run(() => updateTaskContent(task.id, title, description))
            }
          >
            <Save className="h-3.5 w-3.5" /> 保存文本修改
          </button>
        </div>

        {/* meta */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <Meta label="关联品牌" value={task.customerName} />
          <Meta label="负责人" value={task.ownerName} />
          <Meta label="发布人" value={task.publisherName} />
          <Meta
            label="截止日期"
            value={task.dueDate ? formatDate(task.dueDate) : null}
          />
        </div>

        {/* 客户会议预约：结构化会议信息 */}
        {isMeeting && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <CalendarClock className="h-4 w-4" /> 客户会议信息
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label text-xs">会议时间</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={mTime}
                  onChange={(e) => setMTime(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">会议形式</label>
                <select
                  className="input"
                  value={mMode}
                  onChange={(e) => setMMode(e.target.value)}
                >
                  {Object.entries(MEETING_MODE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {mMode === "OFFLINE" && (
                <div className="sm:col-span-2">
                  <label className="label text-xs">会议地点（线下必填）</label>
                  <input
                    className="input"
                    value={mLocation}
                    onChange={(e) => setMLocation(e.target.value)}
                    placeholder="请填写线下会议地点"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label text-xs">参会人员（团队内部）</label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
                  {users.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={mAttendees.includes(u.id)}
                        onChange={() =>
                          setMAttendees((a) =>
                            a.includes(u.id)
                              ? a.filter((x) => x !== u.id)
                              : [...a, u.id],
                          )
                        }
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              提交后将自动为参会人创建会议提醒、发送会议邮件，并同步到已授权的飞书 / Google 日历。
            </p>
            <button
              className="btn-primary btn-sm mt-3"
              disabled={pending}
              onClick={() =>
                run(() =>
                  submitMeetingInfo(task.id, {
                    meetingTime: mTime,
                    meetingMode: mMode,
                    meetingLocation: mLocation,
                    attendees: mAttendees,
                  }),
                )
              }
            >
              提交会议信息并通知参会人
            </button>
          </div>
        )}

        {/* 附件 */}
        <div>
          <p className="label">附件</p>
          <FileUploader
            entityType="TASK"
            entityId={task.id}
            label="上传附件"
            attachments={attachments}
          />
        </div>

        {/* 外部链接 / 在线文档 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label flex items-center gap-1.5 mb-0">
              <Link2 className="h-3.5 w-3.5" /> 外部链接 / 在线文档
            </p>
            <button type="button" onClick={addLink} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
              <Plus className="h-3.5 w-3.5" /> 添加链接
            </button>
          </div>
          {links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 text-center">
              可添加 Google Doc、Notion、飞书文档、外部链接等，提交审核时一并推送给审核人
            </p>
          ) : (
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="input w-28 shrink-0 text-xs"
                    placeholder="标题（可选）"
                    value={l.label}
                    onChange={(e) => updateLink(i, "label", e.target.value)}
                  />
                  <input
                    className="input flex-1 text-xs"
                    placeholder="https://..."
                    value={l.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                  />
                  <button type="button" onClick={() => removeLink(i)} className="text-slate-400 hover:text-rose-500 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {links.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm text-xs"
                onClick={saveLinks}
                disabled={linksSaving}
              >
                <Save className="h-3.5 w-3.5" /> {linksSaving ? "保存中…" : "保存链接"}
              </button>
              {linksSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 已保存
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        {/* 提交审核：选择审核人 + 截止日期 + 内容摘要 */}
        {showReview && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
            <p className="text-sm font-semibold text-amber-800">提交审核确认</p>

            {/* What will be pushed */}
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-xs space-y-2">
              <p className="font-medium text-slate-600">将推送以下内容给审核人：</p>
              <div className="space-y-1 text-slate-500">
                <p>• 任务标题：{task.title}</p>
                {task.description && <p>• 任务描述：{task.description.slice(0, 80)}{task.description.length > 80 ? "…" : ""}</p>}
                {attachments.length > 0 && (
                  <p>• 附件（{attachments.length}个）：{attachments.slice(0, 3).map(a => a.fileName).join("、")}{attachments.length > 3 ? "…" : ""}</p>
                )}
                {links.filter(l => l.url).length > 0 && (
                  <p>• 外部链接（{links.filter(l => l.url).length}个）：{links.filter(l => l.url).map(l => l.label || l.url).slice(0, 2).join("、")}{links.filter(l => l.url).length > 2 ? "…" : ""}</p>
                )}
                {attachments.length === 0 && links.filter(l => l.url).length === 0 && (
                  <p className="text-slate-400">（未上传附件或外部链接）</p>
                )}
              </div>
            </div>

            <div>
              <label className="label text-xs">选择审核人（可多选）</label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={reviewerIds.includes(u.id)}
                      onChange={() =>
                        setReviewerIds((ids) =>
                          ids.includes(u.id)
                            ? ids.filter((x) => x !== u.id)
                            : [...ids, u.id],
                        )
                      }
                    />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label text-xs">审核截止日期（可选）</label>
              <input
                type="date"
                className="input"
                value={reviewDue}
                onChange={(e) => setReviewDue(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                className="btn bg-amber-500 text-white hover:bg-amber-600 btn-sm"
                disabled={pending}
                onClick={() => {
                  run(async () => {
                    await submitTaskForReview(task.id, reviewerIds, reviewDue || undefined);
                    setShowReview(false);
                  });
                }}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> 确认提交审核
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setShowReview(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* 退回理由输入 */}
        {showReturn && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label className="label text-xs">退回理由（将退回给任务发布人）</label>
            <textarea
              className="input"
              rows={2}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="btn-danger btn-sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await returnTask(task.id, returnReason);
                    setShowReturn(false);
                  })
                }
              >
                确认退回
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={() => setShowReturn(false)}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 底部：负责人操作按钮 — 仅在可操作状态显示（已完成/已取消则隐藏）*/}
        {(task.status === "TODO" || task.status === "IN_PROGRESS" || task.status === "RETURNED") && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              className="btn-secondary"
              disabled={pending}
              onClick={() => run(() => setTaskStatus(task.id, "CANCELLED"), true)}
            >
              <XCircle className="h-4 w-4" /> 取消
            </button>
            <button
              className="btn-secondary"
              disabled={pending}
              onClick={() => setShowReturn(true)}
            >
              <Undo2 className="h-4 w-4" /> 退回
            </button>
            <button
              className="btn bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={pending}
              onClick={() => run(() => setTaskStatus(task.id, "DONE"), true)}
            >
              <CheckCircle2 className="h-4 w-4" /> 任务完成
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <span className="text-xs text-slate-400">{label}</span>
      <p className="text-slate-700">{value ?? "—"}</p>
    </div>
  );
}
