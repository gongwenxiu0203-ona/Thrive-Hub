"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Check, X, Upload, Plus, Trash2, FileDown, DollarSign,
  MessageSquare, CheckCircle2, XCircle, Calculator,
} from "lucide-react";
import {
  submitProjectTo, confirmProjectPrice, submitProjectInfo,
  addProjectNote, decideProjectCoop, settleProject,
} from "@/actions/projects";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string };
type Asin = { name: string; asin: string; stock: string };
type SettleRow = { person: string; parentAsin: string; serviceFee: string };

const STAGE_ORDER = ["REQUIREMENT", "SUBMITTED", "PRICE_CONFIRMED", "INFO_SUBMITTED", "DECIDED", "SETTLED"];
const STAGE_LABELS: Record<string, string> = {
  REQUIREMENT: "需求创建", SUBMITTED: "提交", PRICE_CONFIRMED: "确认价格",
  INFO_SUBMITTED: "提交信息", DECIDED: "确认合作", SETTLED: "结算",
};

export function OneOffFlow({
  projectId,
  stage,
  price,
  coopResult,
  submissionData,
  settlementData,
  submittedToName,
  users,
  biParentAsins,
}: {
  projectId: string;
  stage: string;
  price: string | null;
  coopResult: string | null;
  submissionData: string | null;
  settlementData: string | null;
  submittedToName: string | null;
  users: UserOption[];
  biParentAsins: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stageIdx = STAGE_ORDER.indexOf(stage);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) { setError(r.error ?? "操作失败"); return; }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* 阶段进度条 */}
      <div className="card flex flex-wrap items-center gap-2 p-4">
        {STAGE_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={cn(
              "flex h-6 items-center rounded-full px-3 text-xs font-medium",
              i < stageIdx ? "bg-emerald-100 text-emerald-700"
                : i === stageIdx ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-400",
            )}>
              {i < stageIdx && <Check className="mr-1 h-3 w-3" />}
              {STAGE_LABELS[s]}
            </span>
            {i < STAGE_ORDER.length - 1 && <span className="text-slate-300">→</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-600">{error}</div>
      )}

      {/* 各阶段操作卡片 */}
      {stage === "REQUIREMENT" && (
        <SubmitToCard users={users} pending={pending} onSubmit={(uid) => run(() => submitProjectTo(projectId, uid))} />
      )}

      {stage === "SUBMITTED" && (
        <ActionCard title="确认价格" icon={<DollarSign className="h-4 w-4" />}
          hint={submittedToName ? `已提交给 ${submittedToName}，确认价格后进入提交信息环节` : "确认价格后进入提交信息环节"}>
          <PriceForm pending={pending} onConfirm={(p) => run(() => confirmProjectPrice(projectId, p))} />
        </ActionCard>
      )}

      {stage === "PRICE_CONFIRMED" && (
        <InfoSubmitCard pending={pending} onSubmit={(data) => run(() => submitProjectInfo(projectId, data))} />
      )}

      {stage === "INFO_SUBMITTED" && (
        <ActionCard title="沟通与确认合作" icon={<MessageSquare className="h-4 w-4" />}
          hint="可记录沟通进度（时间流显示），确认最终是否合作">
          <CommunicateAndDecide
            pending={pending}
            onNote={(n) => run(() => addProjectNote(projectId, n))}
            onDecide={(r) => run(() => decideProjectCoop(projectId, r))}
          />
        </ActionCard>
      )}

      {stage === "DECIDED" && coopResult === "COOPERATE" && (
        <SettleCard pending={pending} biParentAsins={biParentAsins}
          onSettle={(rows) => run(() => settleProject(projectId, rows))} />
      )}

      {stage === "DECIDED" && coopResult === "DECLINED" && (
        <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
          <XCircle className="h-5 w-5 text-rose-400" /> 本次合作已确认为「不合作」，流程结束。
        </div>
      )}

      {stage === "SETTLED" && (
        <SettlementView settlementData={settlementData} />
      )}

      {/* 已提交信息回显 */}
      {submissionData && stage !== "PRICE_CONFIRMED" && (
        <SubmissionView submissionData={submissionData} price={price} />
      )}
    </div>
  );
}

// ── 子组件 ───────────────────────────────────────────────────────────────────

function ActionCard({ title, icon, hint, children }: {
  title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-brand-600">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {hint && <p className="mb-3 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

function SubmitToCard({ users, pending, onSubmit }: {
  users: UserOption[]; pending: boolean; onSubmit: (uid: string) => void;
}) {
  const [uid, setUid] = useState("");
  return (
    <ActionCard title="提交给成员处理" icon={<Send className="h-4 w-4" />}
      hint="选择站内成员提交，系统会发送站内通知（邮件通知暂未开启）">
      <div className="flex gap-2">
        <select className="input flex-1" value={uid} onChange={(e) => setUid(e.target.value)}>
          <option value="">选择提交对象…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button className="btn-primary shrink-0" disabled={pending || !uid} onClick={() => onSubmit(uid)}>
          <Send className="h-4 w-4" /> 提交
        </button>
      </div>
    </ActionCard>
  );
}

function PriceForm({ pending, onConfirm }: { pending: boolean; onConfirm: (p: string) => void }) {
  const [price, setPrice] = useState("");
  return (
    <div className="flex gap-2">
      <input className="input flex-1" value={price} onChange={(e) => setPrice(e.target.value)}
        placeholder="如：$500 / 件 或 ¥3000 一口价" />
      <button className="btn-primary shrink-0" disabled={pending || !price.trim()} onClick={() => onConfirm(price)}>
        <Check className="h-4 w-4" /> 确认价格
      </button>
    </div>
  );
}

function InfoSubmitCard({ pending, onSubmit }: {
  pending: boolean;
  onSubmit: (data: { asins: Asin[]; hasCode: boolean; code?: string; startDate?: string; endDate?: string }) => void;
}) {
  const [asins, setAsins] = useState<Asin[]>([{ name: "", asin: "", stock: "" }]);
  const [hasCode, setHasCode] = useState(false);
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const update = (i: number, k: keyof Asin, v: string) =>
    setAsins((a) => { const n = [...a]; n[i] = { ...n[i], [k]: v }; return n; });

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = (ev.target?.result as string).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = text.split("\n").filter((l) => l.trim());
        const rows: Asin[] = lines.slice(1).map((l) => {
          const c = l.split(",").map((x) => x.replace(/^"|"$/g, "").trim());
          return { name: c[0] ?? "", asin: c[1] ?? "", stock: c[2] ?? "" };
        }).filter((r) => r.name || r.asin);
        if (rows.length) { setAsins(rows); setNote(`✅ 已导入 ${rows.length} 个 ASIN`); }
        else setNote("未识别到有效数据");
      } catch { setNote("解析失败，请用下载的模板"); }
      finally { if (e.target) e.target.value = ""; }
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <ActionCard title="提交合作信息" icon={<Upload className="h-4 w-4" />}
      hint="提交 ASIN 库存（可下载模板批量上传），并设置是否使用 code">
      {/* ASIN 库存 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">ASIN 库存清单</span>
          <div className="flex gap-2">
            <a href="/api/projects/asin-template" download className="btn-ghost btn-sm">
              <FileDown className="h-3.5 w-3.5" /> 下载模板
            </a>
            <label className="btn-ghost btn-sm cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> 上传 CSV
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
            </label>
            <button className="btn-ghost btn-sm" onClick={() => setAsins((a) => [...a, { name: "", asin: "", stock: "" }])}>
              <Plus className="h-3.5 w-3.5" /> 添加
            </button>
          </div>
        </div>
        {note && <p className={`text-xs ${note.startsWith("✅") ? "text-emerald-600" : "text-rose-500"}`}>{note}</p>}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-2 py-1.5 text-left">商品名称</th><th className="px-2 py-1.5 text-left">ASIN</th>
              <th className="px-2 py-1.5 text-left">库存数量</th><th className="w-8"></th>
            </tr></thead>
            <tbody>
              {asins.map((a, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.name} onChange={(e) => update(i, "name", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.asin} onChange={(e) => update(i, "asin", e.target.value)} placeholder="B0XXXX" /></td>
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.stock} onChange={(e) => update(i, "stock", e.target.value)} /></td>
                  <td className="px-2 py-1">{asins.length > 1 && (
                    <button onClick={() => setAsins((x) => x.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 是否设置 code */}
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={hasCode} onChange={(e) => setHasCode(e.target.checked)} />
          是否设置 code（优惠码）
        </label>
        {hasCode && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label text-xs">code 码 *</label>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 SAVE20" />
            </div>
            <div>
              <label className="label text-xs">开始时间 *</label>
              <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">结束时间 *</label>
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={pending}
          onClick={() => onSubmit({ asins, hasCode, code, startDate, endDate })}>
          <Check className="h-4 w-4" /> 提交信息
        </button>
      </div>
    </ActionCard>
  );
}

function CommunicateAndDecide({ pending, onNote, onDecide }: {
  pending: boolean; onNote: (n: string) => void; onDecide: (r: "COOPERATE" | "DECLINED") => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input flex-1" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="记录沟通进度（如：已发邮件 / 对方回复…）" />
        <button className="btn-secondary shrink-0" disabled={pending || !note.trim()}
          onClick={() => { onNote(note); setNote(""); }}>
          <MessageSquare className="h-4 w-4" /> 记录
        </button>
      </div>
      <div className="flex gap-2 border-t border-slate-100 pt-3">
        <button className="btn-primary flex-1 justify-center" disabled={pending} onClick={() => onDecide("COOPERATE")}>
          <CheckCircle2 className="h-4 w-4" /> 确认合作
        </button>
        <button className="btn-danger flex-1 justify-center" disabled={pending} onClick={() => onDecide("DECLINED")}>
          <XCircle className="h-4 w-4" /> 确认不合作
        </button>
      </div>
    </div>
  );
}

function SettleCard({ pending, biParentAsins, onSettle }: {
  pending: boolean; biParentAsins: string[]; onSettle: (rows: SettleRow[]) => void;
}) {
  const [rows, setRows] = useState<SettleRow[]>([{ person: "", parentAsin: "", serviceFee: "" }]);
  const update = (i: number, k: keyof SettleRow, v: string) =>
    setRows((a) => { const n = [...a]; n[i] = { ...n[i], [k]: v }; return n; });
  const total = rows.reduce((s, r) => s + (parseFloat(r.serviceFee) || 0), 0);

  return (
    <ActionCard title="结算" icon={<Calculator className="h-4 w-4" />}
      hint="上贴后结算：填写人员 / 父ASIN / 服务费金额。父ASIN 可从推广 BI 数据选择">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            <th className="px-2 py-1.5 text-left">人员</th><th className="px-2 py-1.5 text-left">父 ASIN</th>
            <th className="px-2 py-1.5 text-left">服务费金额</th><th className="w-8"></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="px-2 py-1"><input className="input py-1 text-xs" value={r.person} onChange={(e) => update(i, "person", e.target.value)} placeholder="负责人/人员" /></td>
                <td className="px-2 py-1">
                  <input className="input py-1 text-xs" list={`bi-asins-${i}`} value={r.parentAsin} onChange={(e) => update(i, "parentAsin", e.target.value)} placeholder="父 ASIN" />
                  <datalist id={`bi-asins-${i}`}>{biParentAsins.map((a) => <option key={a} value={a} />)}</datalist>
                </td>
                <td className="px-2 py-1"><input className="input py-1 text-xs" value={r.serviceFee} onChange={(e) => update(i, "serviceFee", e.target.value)} placeholder="金额" /></td>
                <td className="px-2 py-1">{rows.length > 1 && (
                  <button onClick={() => setRows((x) => x.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button className="btn-ghost btn-sm" onClick={() => setRows((a) => [...a, { person: "", parentAsin: "", serviceFee: "" }])}>
          <Plus className="h-3.5 w-3.5" /> 添加一行
        </button>
        <span className="text-sm text-slate-600">合计服务费：<b className="text-brand-700">{total.toLocaleString()}</b></span>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="btn-primary" disabled={pending} onClick={() => onSettle(rows)}>
          <Check className="h-4 w-4" /> 完成结算
        </button>
      </div>
    </ActionCard>
  );
}

function SubmissionView({ submissionData, price }: { submissionData: string; price: string | null }) {
  let d: { asins?: Asin[]; hasCode?: boolean; code?: string; startDate?: string; endDate?: string } = {};
  try { d = JSON.parse(submissionData); } catch {}
  const asins = d.asins ?? [];
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">已提交合作信息</h3>
      {price && <p className="mb-2 text-xs text-slate-500">确认价格：<b className="text-slate-700">{price}</b></p>}
      {asins.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-3 py-1.5 text-left">商品名称</th><th className="px-3 py-1.5 text-left">ASIN</th><th className="px-3 py-1.5 text-left">库存</th>
            </tr></thead>
            <tbody>
              {asins.map((a, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5">{a.name || "—"}</td><td className="px-3 py-1.5 font-mono text-xs">{a.asin || "—"}</td><td className="px-3 py-1.5">{a.stock || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.hasCode && (
        <p className="mt-2 text-xs text-slate-600">
          Code：<b>{d.code}</b>（{d.startDate} ~ {d.endDate}）
        </p>
      )}
    </div>
  );
}

function SettlementView({ settlementData }: { settlementData: string | null }) {
  let rows: SettleRow[] = [];
  try { rows = JSON.parse(settlementData ?? "[]"); } catch {}
  const total = rows.reduce((s, r) => s + (parseFloat(r.serviceFee) || 0), 0);
  return (
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Calculator className="h-4 w-4 text-emerald-600" /> 结算结果
      </h3>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            <th className="px-3 py-1.5 text-left">人员</th><th className="px-3 py-1.5 text-left">父 ASIN</th><th className="px-3 py-1.5 text-left">服务费金额</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-1.5">{r.person || "—"}</td><td className="px-3 py-1.5 font-mono text-xs">{r.parentAsin || "—"}</td><td className="px-3 py-1.5">{r.serviceFee || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-slate-50"><td colSpan={2} className="px-3 py-1.5 text-right text-xs font-medium text-slate-500">合计</td><td className="px-3 py-1.5 font-bold text-brand-700">{total.toLocaleString()}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
