"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type CustomerOption = { id: string; brandName: string };
type Submission = {
  id: string;
  type: "GENERAL_NEW" | "CUSTOMER_UPDATE";
  status: string;
  brandName?: string | null;
  submittedAt: string;
  customer?: { id?: string; brandName: string } | null;
  payload: Record<string, unknown>;
  baselinePayload?: Record<string, unknown> | null;
};

const labels: Record<string, string> = {
  brandName: "品牌/店铺名称",
  contactName: "联系人",
  contactEmail: "联系邮箱",
  contactPhone: "联系电话",
  competitor: "竞品",
  amazonAcos: "Amazon ACOS",
  amazonAcosNote: "Amazon ACOS 备注",
  targetGmv: "目标 GMV",
  channelBudget: "渠道预算",
  socialMediaInfo: "社交媒体",
  affiliateHistory: "联盟营销历史",
  affiliatePlatforms: "联盟平台",
  promotionGoals: "推广目标",
  affiliateTeam: "联盟团队",
  mainSites: "主营站点",
  siteLinks: "站点链接",
  targetPlatforms: "目标推广平台",
  platformGmv: "平台 GMV",
  referrerName: "推荐人",
};

function show(value: unknown) {
  if (Array.isArray(value)) return value.join("、") || "—";
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.join("、") || "—";
      if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
    } catch {
      // Plain text values are displayed below.
    }
  }
  return String(value ?? "—") || "—";
}

export function IntakeReviewPanel() {
  const [items, setItems] = useState<Submission[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [fields, setFields] = useState<Set<string>>(new Set());
  const [mergeCustomerId, setMergeCustomerId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/admin/intake-submissions?status=PENDING");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "读取失败");
      setItems(data.submissions ?? []);
      setCustomers(data.customers ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function open(item: Submission) {
    const response = await fetch(`/api/admin/intake-submissions/${item.id}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "读取失败");
      return;
    }
    const submission = data.submission as Submission;
    setSelected(submission);
    setFields(new Set(Object.keys(submission.payload ?? {})));
    setMergeCustomerId("");
    setReviewNote("");
  }

  async function action(kind: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    setError("");
    const body = kind === "approve"
      ? {
          appliedFields: [...fields],
          mergeCustomerId: mergeCustomerId || undefined,
          reviewNote: reviewNote || undefined,
        }
      : { reviewNote: reviewNote || undefined };
    const response = await fetch(`/api/admin/intake-submissions/${selected.id}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "操作失败");
      return;
    }
    setSelected(null);
    await load();
  }

  const diff = useMemo(() => {
    if (!selected) return [];
    if (selected.type === "GENERAL_NEW") return Object.entries(selected.payload);
    return Object.entries(selected.payload).filter(
      ([key, value]) => show(value) !== show(selected.baselinePayload?.[key]),
    );
  }, [selected]);

  const duplicateCandidates = selected?.type === "GENERAL_NEW"
    ? customers.filter((customer) =>
        customer.brandName.toLowerCase().includes((selected.brandName ?? "").toLowerCase()) ||
        (selected.brandName ?? "").toLowerCase().includes(customer.brandName.toLowerCase()),
      )
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">信息收集审核</h2>
        <p className="text-sm text-slate-500">外部提交审核通过后才会写入正式客户资料。</p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">暂无待审核提交</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>类型</th><th>品牌</th><th>关联客户</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.type === "CUSTOMER_UPDATE" ? "已有客户资料变更" : "新客户申请"}</td>
                  <td className="font-medium">{item.brandName ?? show(item.payload.brandName)}</td>
                  <td>{item.customer?.brandName ?? "—"}</td>
                  <td>{new Date(item.submittedAt).toLocaleString("zh-CN")}</td>
                  <td><span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-4 w-4" />待审核</span></td>
                  <td><button className="btn-secondary btn-sm" onClick={() => void open(item)}>查看并审核</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title={selected.brandName ?? show(selected.payload.brandName)}
          description={"\u52fe\u9009\u8981\u5e94\u7528\u5230\u6b63\u5f0f\u8d44\u6599\u7684\u5b57\u6bb5\u3002"}
          size="xl"
          closeOnBackdrop={!busy}
          closeOnEscape={!busy}
        >
            {selected.type === "GENERAL_NEW" && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <label className="label" htmlFor="merge-customer">审核结果</label>
                <select id="merge-customer" className="input" value={mergeCustomerId} onChange={(event) => setMergeCustomerId(event.target.value)}>
                  <option value="">创建新的正式客户</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>合并到：{customer.brandName}</option>)}
                </select>
                {duplicateCandidates.length > 0 && (
                  <p className="mt-2 text-xs text-amber-800">发现疑似同名客户：{duplicateCandidates.map((customer) => customer.brandName).join("、")}。请确认是新建还是合并。</p>
                )}
              </div>
            )}

            <div className="mt-5 table-wrap">
              <table className="data">
                <thead><tr><th>采用</th><th>字段</th><th>当前资料</th><th>外部提交</th></tr></thead>
                <tbody>
                  {diff.map(([key, value]) => (
                    <tr key={key}>
                      <td><input aria-label={`采用${labels[key] ?? key}`} type="checkbox" checked={fields.has(key)} onChange={(event) => setFields((previous) => { const next = new Set(previous); event.target.checked ? next.add(key) : next.delete(key); return next; })} /></td>
                      <td>{labels[key] ?? key}</td>
                      <td className="text-slate-500">{show(selected.baselinePayload?.[key])}</td>
                      <td>{show(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="label mt-5" htmlFor="review-note">审核备注</label>
            <textarea id="review-note" className="input min-h-20" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} placeholder="可选：记录合并、拒绝或字段取舍原因" />
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary text-rose-700" disabled={busy} onClick={() => void action("reject")}>拒绝</button>
              <button className="btn-primary" disabled={busy || fields.size === 0} onClick={() => void action("approve")}>{mergeCustomerId ? "应用并合并" : "应用所选字段"}</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
