"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Check, X, Upload, Plus, Trash2, FileDown, DollarSign,
  MessageSquare, CheckCircle2, XCircle, Calculator,
} from "lucide-react";
import {
  submitProjectTo, confirmProjectPrice, submitProjectInfo,
  addProjectNote, decideProjectCoop, settleProject, sendAffiliateEmailStep,
  uploadCoopInfoTable,
} from "@/actions/projects";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string };
type Asin = { parentAsin: string; childAsin: string; color: string; size: string; stock: string };
type SettleRow = { person: string; parentAsin: string; serviceFee: string };

const STAGE_ORDER = ["REQUIREMENT", "SUBMITTED", "PRICE_CONFIRMED", "INFO_SUBMITTED", "EMAIL_SENT", "DECIDED", "SETTLED"];
const STAGE_LABELS: Record<string, string> = {
  REQUIREMENT: "需求创建", SUBMITTED: "提交", PRICE_CONFIRMED: "确认价格",
  INFO_SUBMITTED: "提交信息", EMAIL_SENT: "发送邮件", DECIDED: "确认合作", SETTLED: "结算",
};

export function OneOffFlow({
  canEdit,
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
  canEdit: boolean;
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
    <fieldset disabled={!canEdit} className="space-y-4">
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
        <>
          <CoopInfoUploadCard pending={pending}
            onUpload={(d) => run(() => uploadCoopInfoTable(projectId, d))} />
          <SubmitToCard users={users} pending={pending} onSubmit={(uid) => run(() => submitProjectTo(projectId, uid))} />
        </>
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
        <EmailStepCard pending={pending}
          onSend={(d) => run(() => sendAffiliateEmailStep(projectId, d))} />
      )}

      {stage === "EMAIL_SENT" && (
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
    </fieldset>
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

// 上传合作信息表格（识别表头作为推广基本信息展示字段）
function CoopInfoUploadCard({ pending, onUpload }: {
  pending: boolean; onUpload: (d: { headers: string[]; rows: string[][] }) => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [note, setNote] = useState<string | null>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = (ev.target?.result as string).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = text.split("\n").filter((l) => l.trim());
        if (!lines.length) { setNote("文件为空"); return; }
        const hdr = lines[0].split(",").map((x) => x.replace(/^"|"$/g, "").trim()).filter(Boolean);
        const rws = lines.slice(1).map((l) => l.split(",").map((x) => x.replace(/^"|"$/g, "").trim()));
        setHeaders(hdr); setRows(rws);
        setNote(`✅ 识别到 ${hdr.length} 个字段、${rws.length} 行数据`);
      } catch { setNote("解析失败，请上传 CSV 表格"); }
      finally { if (e.target) e.target.value = ""; }
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <ActionCard title="上传合作信息（推广基本信息）" icon={<Upload className="h-4 w-4" />}
      hint="上传 CSV 表格，系统自动识别表头字段作为推广基本信息展示">
      <div className="flex items-center gap-2">
        <label className="btn-secondary btn-sm cursor-pointer">
          <Upload className="h-3.5 w-3.5" /> 上传表格 CSV
          <input type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
        </label>
        {headers.length > 0 && (
          <button className="btn-primary btn-sm" disabled={pending} onClick={() => onUpload({ headers, rows })}>
            <Check className="h-3.5 w-3.5" /> 保存合作信息
          </button>
        )}
      </div>
      {note && <p className={`mt-2 text-xs ${note.startsWith("✅") ? "text-emerald-600" : "text-rose-500"}`}>{note}</p>}
      {headers.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              {headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  {headers.map((_, j) => <td key={j} className="px-2 py-1.5 text-xs text-slate-600">{r[j] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 5 && <p className="px-2 py-1 text-[11px] text-slate-400">…共 {rows.length} 行，保存后全部展示</p>}
        </div>
      )}
    </ActionCard>
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

function emptyAsin(): Asin { return { parentAsin: "", childAsin: "", color: "", size: "", stock: "" }; }

function InfoSubmitCard({ pending, onSubmit }: {
  pending: boolean;
  onSubmit: (data: { lowestPrice: string; asins: Asin[]; hasCode: boolean; code?: string; startDate?: string; endDate?: string }) => void;
}) {
  const [lowestPrice, setLowestPrice] = useState("");
  const [asins, setAsins] = useState<Asin[]>([emptyAsin()]);
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
          return { parentAsin: c[0] ?? "", childAsin: c[1] ?? "", color: c[2] ?? "", size: c[3] ?? "", stock: c[4] ?? "" };
        }).filter((r) => r.parentAsin || r.childAsin);
        if (rows.length) { setAsins(rows); setNote(`✅ 已导入 ${rows.length} 行 ASIN 库存`); }
        else setNote("未识别到有效数据");
      } catch { setNote("解析失败，请用下载的模板"); }
      finally { if (e.target) e.target.value = ""; }
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <ActionCard title="提交合作信息" icon={<Upload className="h-4 w-4" />}
      hint="填写最低折后价 + ASIN 库存表（可下载模板批量上传），并设置是否使用 code">
      {/* 最低折后价 */}
      <div className="mb-3">
        <label className="label text-xs">最低折后价 *</label>
        <input className="input" value={lowestPrice} onChange={(e) => setLowestPrice(e.target.value)}
          placeholder="如：$19.99 或 ¥99" />
      </div>

      {/* ASIN 库存表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">ASIN 库存表</span>
          <div className="flex gap-2">
            <a href="/api/projects/asin-template" download className="btn-ghost btn-sm">
              <FileDown className="h-3.5 w-3.5" /> 下载模板
            </a>
            <label className="btn-ghost btn-sm cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> 上传 CSV
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
            </label>
            <button className="btn-ghost btn-sm" onClick={() => setAsins((a) => [...a, emptyAsin()])}>
              <Plus className="h-3.5 w-3.5" /> 添加
            </button>
          </div>
        </div>
        {note && <p className={`text-xs ${note.startsWith("✅") ? "text-emerald-600" : "text-rose-500"}`}>{note}</p>}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-2 py-1.5 text-left">父ASIN</th><th className="px-2 py-1.5 text-left">可售子ASIN</th>
              <th className="px-2 py-1.5 text-left">颜色</th><th className="px-2 py-1.5 text-left">尺码</th>
              <th className="px-2 py-1.5 text-left">库存数量</th><th className="w-8"></th>
            </tr></thead>
            <tbody>
              {asins.map((a, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.parentAsin} onChange={(e) => update(i, "parentAsin", e.target.value)} placeholder="B0XXXX" /></td>
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.childAsin} onChange={(e) => update(i, "childAsin", e.target.value)} placeholder="B0YYYY" /></td>
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.color} onChange={(e) => update(i, "color", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className="input py-1 text-xs" value={a.size} onChange={(e) => update(i, "size", e.target.value)} /></td>
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
          onClick={() => onSubmit({ lowestPrice, asins, hasCode, code, startDate, endDate })}>
          <Check className="h-4 w-4" /> 提交信息
        </button>
      </div>
    </ActionCard>
  );
}

// 生成邮件发联盟商（暂不真发，记录已发送邮件）
function EmailStepCard({ pending, onSend }: {
  pending: boolean;
  onSend: (d: { affiliateName: string; senderEmail?: string; receiverEmail?: string }) => void;
}) {
  const [affiliateName, setAffiliateName] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [picked, setPicked] = useState<{ name: string; email: string } | null>(null);
  const [senderEmail, setSenderEmail] = useState("");
  const [receiverEmail, setReceiverEmail] = useState("");

  async function search(v: string) {
    setAffiliateName(v);
    setPicked(null);
    if (!v.trim()) { setResults([]); return; }
    const res = await fetch(`/api/affiliates?q=${encodeURIComponent(v)}&pageSize=8`);
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setResults((data.data ?? []).map((a: any) => ({ id: a.id, name: a.platformAffiliateName, email: a.contactInfo ?? "" })));
  }

  return (
    <ActionCard title="生成邮件发联盟商" icon={<Send className="h-4 w-4" />}
      hint="选择联盟商并填写收发邮箱，一键「发送」（暂不真实发信，仅在时间流记录已发送邮件）">
      <div className="space-y-3">
        <div className="relative">
          <label className="label text-xs">选择联盟商（资源库）*</label>
          <input className="input" value={affiliateName} onChange={(e) => search(e.target.value)}
            placeholder="搜索联盟商名称…" />
          {!picked && results.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {results.map((r) => (
                <button key={r.id} type="button"
                  onClick={() => { setPicked({ name: r.name, email: r.email }); setAffiliateName(r.name); setReceiverEmail(r.email); setResults([]); }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className="truncate text-slate-700">{r.name}</span>
                  {r.email && <span className="text-[10px] text-slate-400">{r.email}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">发送邮箱</label>
            <input className="input" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="发件邮箱（可选）" />
          </div>
          <div>
            <label className="label text-xs">接收邮箱</label>
            <input className="input" value={receiverEmail} onChange={(e) => setReceiverEmail(e.target.value)} placeholder="联盟商联系邮箱" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" className="text-xs text-slate-400 hover:text-slate-600"
            onClick={() => onSend({ affiliateName: affiliateName || "（未指定）", senderEmail, receiverEmail })}>
            跳过/直接标记已发送
          </button>
          <button className="btn-primary" disabled={pending || !affiliateName.trim()}
            onClick={() => onSend({ affiliateName, senderEmail, receiverEmail })}>
            <Send className="h-4 w-4" /> 一键发送
          </button>
        </div>
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
  let d: { lowestPrice?: string; asins?: Asin[]; hasCode?: boolean; code?: string; startDate?: string; endDate?: string } = {};
  try { d = JSON.parse(submissionData); } catch {}
  const asins = d.asins ?? [];
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">已提交合作信息</h3>
      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        {price && <span>确认价格：<b className="text-slate-700">{price}</b></span>}
        {d.lowestPrice && <span>最低折后价：<b className="text-slate-700">{d.lowestPrice}</b></span>}
      </div>
      {asins.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-3 py-1.5 text-left">父ASIN</th><th className="px-3 py-1.5 text-left">可售子ASIN</th>
              <th className="px-3 py-1.5 text-left">颜色</th><th className="px-3 py-1.5 text-left">尺码</th><th className="px-3 py-1.5 text-left">库存</th>
            </tr></thead>
            <tbody>
              {asins.map((a, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs">{a.parentAsin || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{a.childAsin || "—"}</td>
                  <td className="px-3 py-1.5">{a.color || "—"}</td>
                  <td className="px-3 py-1.5">{a.size || "—"}</td>
                  <td className="px-3 py-1.5">{a.stock || "—"}</td>
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
