"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FileText, Sparkles, Columns2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createContract, updateContract, nextContractNo } from "@/actions/contracts";
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_REVIEW_FIELDS,
  FEE_CYCLE_OPTIONS,
} from "@/lib/constants";
import { toInputDate } from "@/lib/utils";

type Option = { id: string; name: string };
type CustomerOption = { id: string; brandName: string };

export type ContractEditData = {
  id: string;
  contractNo: string;
  customerId: string;
  type: string;
  ownerId: string | null;
  reviewerId: string | null;
  contractText: string | null;
  partyA: string | null;
  accountingPeriod: string | null;
  feeCycle: string | null;
  feeAmount: string | null;
  commissionRate: string | null;
  affiliateRule: string | null;
  paymentCycle: string | null;
  invoiceReq: string | null;
  lateLiability: string | null;
  remark: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
};

// Long-text fields shown as textareas.
const LONG_FIELDS = new Set([
  "accountingPeriod",
  "affiliateRule",
  "paymentCycle",
  "invoiceReq",
  "lateLiability",
  "remark",
]);

export function ContractFormModal({
  users,
  customers,
  presetCustomerId,
  presetCustomerName,
  contract,
  currentUserId,
  trigger = "button",
}: {
  users: Option[];
  customers?: CustomerOption[];
  presetCustomerId?: string;
  presetCustomerName?: string;
  contract?: ContractEditData;
  currentUserId?: string;
  trigger?: "button" | "link" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [prefix, setPrefix] = useState<"LYNQ" | "THRAIVE">("LYNQ");
  const [generatedNo, setGeneratedNo] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!contract;

  async function generateNo(p: "LYNQ" | "THRAIVE") {
    setGenerating(true);
    try {
      const no = await nextContractNo(p);
      setGeneratedNo(no);
    } finally {
      setGenerating(false);
    }
  }

  // Controlled values for the fields that 智能提取 fills.
  const [fields, setFields] = useState<Record<string, string>>({
    contractText: contract?.contractText ?? "",
    partyA: contract?.partyA ?? "",
    accountingPeriod: contract?.accountingPeriod ?? "",
    feeCycle: contract?.feeCycle ?? "无",
    feeAmount: contract?.feeAmount ?? "",
    commissionRate: contract?.commissionRate ?? "",
    affiliateRule: contract?.affiliateRule ?? "",
    paymentCycle: contract?.paymentCycle ?? "",
    invoiceReq: contract?.invoiceReq ?? "无",
    lateLiability: contract?.lateLiability ?? "",
    remark: contract?.remark ?? "",
    startDate: toInputDate(contract?.startDate),
    endDate: toInputDate(contract?.endDate),
    extractedBy: "",
  });
  const set = (k: string, v: string) =>
    setFields((f) => ({ ...f, [k]: v }));

  async function runExtract(payload: FormData | { text: string }) {
    setExtracting(true);
    setExtractNote(null);
    try {
      const res = await fetch("/api/contracts/extract", {
        method: "POST",
        ...(payload instanceof FormData
          ? { body: payload }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractNote(data.error ?? "提取失败");
        return;
      }
      setFields((f) => ({
        ...f,
        contractText: data.text || f.contractText,
        ...data.data,
        extractedBy: data.method,
      }));
      setExtractNote(
        `已通过${data.method === "AI" ? " Claude AI " : "规则"}提取，请核对各字段`,
      );
    } catch {
      setExtractNote("提取失败，请稍后重试");
    } finally {
      setExtracting(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    runExtract(fd);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateContract(contract!.id, fd)
        : await createContract(fd);
      if (!result.ok) {
        setError(result.error ?? "保存失败");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const triggerEl =
    trigger === "button" ? (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> 新建合同
      </button>
    ) : trigger === "edit" ? (
      <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> 编辑
      </button>
    ) : (
      <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" /> 提交合同
      </button>
    );

  return (
    <>
      {triggerEl}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "编辑合同" : "新建合同"}
        wide
      >
        <form action={onSubmit} className="space-y-4">
          {/* 基本信息 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">合同编号 *</label>
              {isEdit ? (
                <input
                  name="contractNo"
                  className="input"
                  required
                  defaultValue={contract?.contractNo ?? ""}
                />
              ) : (
                <div className="flex gap-2">
                  <select
                    className="input w-32 shrink-0"
                    value={prefix}
                    onChange={(e) => {
                      const p = e.target.value as "LYNQ" | "THRAIVE";
                      setPrefix(p);
                      setGeneratedNo("");
                    }}
                  >
                    <option value="LYNQ">LYNQ</option>
                    <option value="THRAIVE">THRAIVE</option>
                  </select>
                  <input
                    name="contractNo"
                    className="input flex-1"
                    required
                    value={generatedNo}
                    onChange={(e) => setGeneratedNo(e.target.value)}
                    placeholder="点击「生成」"
                  />
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    disabled={generating}
                    onClick={() => generateNo(prefix)}
                  >
                    {generating ? "…" : "生成"}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="label">关联客户 *</label>
              {presetCustomerId || isEdit ? (
                <>
                  <input
                    type="hidden"
                    name="customerId"
                    value={presetCustomerId ?? contract?.customerId ?? ""}
                  />
                  <input
                    className="input bg-slate-50"
                    value={
                      presetCustomerName ??
                      customers?.find(
                        (c) =>
                          c.id ===
                          (presetCustomerId ?? contract?.customerId),
                      )?.brandName ??
                      "已关联客户"
                    }
                    readOnly
                  />
                </>
              ) : (
                <select
                  name="customerId"
                  className="input"
                  required
                  defaultValue=""
                >
                  <option value="">请从客户管理中选择</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brandName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="label">合同类型</label>
              <select
                name="type"
                className="input"
                defaultValue={contract?.type ?? "CHANNEL"}
              >
                {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">合同负责人（提交审核人）</label>
              <select
                name="ownerId"
                className="input"
                defaultValue={
                  contract?.ownerId ?? currentUserId ?? ""
                }
              >
                <option value="">未指定</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">审核人</label>
              <select
                name="reviewerId"
                className="input"
                defaultValue={contract?.reviewerId ?? ""}
              >
                <option value="">默认审核人（Shallow）</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">合同文件</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md,.doc,.docx"
                className="hidden"
                onChange={onFile}
              />
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => fileRef.current?.click()}
                disabled={extracting}
              >
                <Sparkles className="h-4 w-4" />
                {extracting ? "提取中…" : "上传合同并智能提取"}
              </button>
            </div>
          </div>

          {/* 合同正文 + 智能提取 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0">合同正文（用于审核原文对照）</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setCompare((v) => !v)}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  {compare ? "退出对照" : "原文对照"}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={extracting || !fields.contractText.trim()}
                  onClick={() => runExtract({ text: fields.contractText })}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  从正文重新提取
                </button>
              </div>
            </div>
            <textarea
              name="contractText"
              className="input font-mono text-xs"
              rows={compare ? 6 : 4}
              value={fields.contractText}
              onChange={(e) => set("contractText", e.target.value)}
              placeholder="上传合同文件后将自动填充，也可直接粘贴合同正文"
            />
            {extractNote && (
              <p className="mt-1 text-xs text-emerald-600">{extractNote}</p>
            )}
          </div>

          {/* 提取字段 — 可对照编辑 */}
          <div
            className={
              compare
                ? "grid gap-3 lg:grid-cols-2"
                : "space-y-3"
            }
          >
            {compare && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-xs font-semibold text-slate-500">
                  合同原文
                </p>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                  {fields.contractText || "（暂无正文）"}
                </pre>
              </div>
            )}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500">
                合同关键字段（AI/规则提取，可手动修正）
              </p>
              {CONTRACT_REVIEW_FIELDS.filter(
                (f) => f.key !== "contractPeriod",
              ).map((field) => (
                <div key={field.key}>
                  <label className="label text-xs">{field.label}</label>
                  {field.key === "feeCycle" ? (
                    <select
                      name="feeCycle"
                      className="input"
                      value={fields.feeCycle}
                      onChange={(e) => set("feeCycle", e.target.value)}
                    >
                      {FEE_CYCLE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      <option value="年度">年度</option>
                    </select>
                  ) : LONG_FIELDS.has(field.key) ? (
                    <textarea
                      name={field.key}
                      className="input text-sm"
                      rows={2}
                      value={fields[field.key] ?? ""}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      name={field.key}
                      className="input"
                      value={fields[field.key] ?? ""}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label text-xs">合作开始日期</label>
                  <input
                    name="startDate"
                    type="date"
                    className="input"
                    value={fields.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">合作结束日期</label>
                  <input
                    name="endDate"
                    type="date"
                    className="input"
                    value={fields.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <input
            type="hidden"
            name="extractedBy"
            value={fields.extractedBy}
          />

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "保存中…" : "保存合同"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
