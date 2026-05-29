"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FileText, Sparkles, Columns2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createContract, updateContract, nextContractNo } from "@/actions/contracts";
import {
  CONTRACT_TYPE_LABELS,
  FEE_CURRENCY_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  COMMISSION_TYPE_LABELS,
  COMMISSION_TYPE_OPTIONS,
  CONTRACT_PROMO_PLATFORMS,
  CONTRACT_TARGET_SITES,
  GMV_SETTLEMENT_CYCLE_OPTIONS,
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
  promoPlatform: string | null;
  targetSite: string | null;
  feeAmount: string | null;
  feeCurrency: string | null;
  paymentMethod: string | null;
  commissionType: string | null;
  commissionRate: string | null;
  thresholdAmount: string | null;
  thresholdCurrency: string | null;
  tieredRules: string | null;
  excessBaseMonths: string | null;
  excessCommissionRate: string | null;
  gmvSettlementCycle: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
};

type Tier = { from: string; to: string; rate: string };

function defaultTiers(): Tier[] {
  return [
    { from: "0", to: "", rate: "" },
    { from: "", to: "", rate: "" },
    { from: "", to: "", rate: "" }, // "及以上" 行：only from + rate
  ];
}

function parseTieredRules(raw: string | null): { currency: string; tiers: Tier[] } {
  if (!raw) return { currency: "人民币", tiers: defaultTiers() };
  try {
    const obj = JSON.parse(raw);
    if (obj && Array.isArray(obj.tiers)) {
      return {
        currency: obj.currency || "人民币",
        tiers:
          obj.tiers.length >= 3
            ? obj.tiers.slice(0, 3)
            : [...obj.tiers, ...defaultTiers().slice(obj.tiers.length)],
      };
    }
  } catch {}
  return { currency: "人民币", tiers: defaultTiers() };
}

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
  const [prefix, setPrefix] = useState<"LYNQ" | "THRAIVE">("THRAIVE");
  const [generatedNo, setGeneratedNo] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!contract;

  // Find shallow user id for default reviewer
  const shallowUser = users.find(
    (u) => u.name.toLowerCase().includes("shallow")
  );

  async function generateNo(p: "LYNQ" | "THRAIVE") {
    setGenerating(true);
    try {
      const no = await nextContractNo(p);
      setGeneratedNo(no);
    } finally {
      setGenerating(false);
    }
  }

  // Auto-generate THRAIVE number on first open for new contracts
  useEffect(() => {
    if (open && !isEdit && !generatedNo) {
      generateNo(prefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const initialTier = parseTieredRules(contract?.tieredRules ?? null);

  const [fields, setFields] = useState<Record<string, string>>({
    contractText: contract?.contractText ?? "",
    partyA: contract?.partyA ?? "",
    promoPlatform: contract?.promoPlatform ?? "",
    targetSite: contract?.targetSite ?? "",
    feeAmount: contract?.feeAmount ?? "",
    feeCurrency: contract?.feeCurrency ?? "人民币",
    paymentMethod: contract?.paymentMethod ?? "",
    commissionType: contract?.commissionType ?? "FIXED",
    commissionRate: contract?.commissionRate ?? "",
    thresholdAmount: contract?.thresholdAmount ?? "",
    thresholdCurrency: contract?.thresholdCurrency ?? "人民币",
    excessBaseMonths: contract?.excessBaseMonths ?? "",
    excessCommissionRate: contract?.excessCommissionRate ?? "",
    gmvSettlementCycle: contract?.gmvSettlementCycle ?? "",
    startDate: toInputDate(contract?.startDate),
    endDate: toInputDate(contract?.endDate),
    extractedBy: "",
  });

  // 阶梯佣金状态
  const [tierCurrency, setTierCurrency] = useState(initialTier.currency);
  const [tiers, setTiers] = useState<Tier[]>(initialTier.tiers);

  const set = (k: string, v: string) =>
    setFields((f) => ({ ...f, [k]: v }));

  const updateTier = (idx: number, key: keyof Tier, value: string) => {
    setTiers((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

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
      const d = data.data ?? {};
      setFields((f) => ({
        ...f,
        contractText: data.text || f.contractText,
        partyA: d.partyA ?? f.partyA,
        startDate: d.startDate || f.startDate,
        endDate: d.endDate || f.endDate,
        promoPlatform: d.promoPlatform ?? f.promoPlatform,
        targetSite: d.targetSite ?? f.targetSite,
        feeAmount: d.feeAmount ?? f.feeAmount,
        feeCurrency: d.feeCurrency ?? f.feeCurrency,
        paymentMethod: d.paymentMethod ?? f.paymentMethod,
        commissionType: d.commissionType ?? f.commissionType,
        commissionRate: d.commissionRate ?? f.commissionRate,
        thresholdAmount: d.thresholdAmount ?? f.thresholdAmount,
        thresholdCurrency: d.thresholdCurrency ?? f.thresholdCurrency,
        excessBaseMonths: d.excessBaseMonths ?? f.excessBaseMonths,
        excessCommissionRate: d.excessCommissionRate ?? f.excessCommissionRate,
        gmvSettlementCycle: d.gmvSettlementCycle ?? f.gmvSettlementCycle,
        extractedBy: data.method,
      }));
      // 阶梯字段
      if (d.tieredRules) {
        const parsed = parseTieredRules(d.tieredRules);
        setTierCurrency(parsed.currency);
        setTiers(parsed.tiers);
      }
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
    // 把阶梯规则合成 JSON 写入隐藏字段
    const tieredJson = JSON.stringify({ currency: tierCurrency, tiers });
    fd.set("tieredRules", tieredJson);
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

  const ct = fields.commissionType;

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
          {/* ── 基本头部信息 ── */}
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
                      generateNo(p);
                    }}
                  >
                    <option value="THRAIVE">THRAIVE</option>
                    <option value="LYNQ">LYNQ</option>
                  </select>
                  <input
                    name="contractNo"
                    className="input flex-1"
                    required
                    value={generatedNo}
                    onChange={(e) => setGeneratedNo(e.target.value)}
                    placeholder="自动生成"
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
                defaultValue={contract?.type ?? "BRAND"}
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
                defaultValue={contract?.ownerId ?? currentUserId ?? ""}
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
                defaultValue={
                  contract?.reviewerId ?? shallowUser?.id ?? ""
                }
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

          {/* ── 合同正文 + 智能提取 ── */}
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

          {/* ── 提取字段 ── */}
          <div className={compare ? "grid gap-3 lg:grid-cols-2" : "space-y-4"}>
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
            <div className="space-y-4">
              {/* 第一部分：基本信息 */}
              <Section title="第一部分 基本信息">
                <div>
                  <label className="label text-xs">甲方（客户）</label>
                  <input
                    name="partyA"
                    className="input"
                    value={fields.partyA}
                    onChange={(e) => set("partyA", e.target.value)}
                  />
                </div>
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
              </Section>

              {/* 第二部分：项目确认书 */}
              <p className="text-xs font-semibold text-slate-500">
                第二部分 项目确认书
              </p>

              {/* 推广信息 */}
              <Section title="推广信息" tone="slate">
                <div>
                  <label className="label text-xs">推广平台</label>
                  <select
                    name="promoPlatform"
                    className="input"
                    value={fields.promoPlatform}
                    onChange={(e) => set("promoPlatform", e.target.value)}
                  >
                    <option value="">请选择</option>
                    {CONTRACT_PROMO_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">目标站点（可多选）</label>
                  <input type="hidden" name="targetSite" value={fields.targetSite} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CONTRACT_TARGET_SITES.map((s) => {
                      const list = fields.targetSite
                        ? fields.targetSite.split(",").map((x) => x.trim()).filter(Boolean)
                        : [];
                      const checked = list.includes(s);
                      return (
                        <label
                          key={s}
                          className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 cursor-pointer hover:border-brand-400 has-[input:checked]:border-brand-500 has-[input:checked]:bg-brand-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                            onChange={(e) => {
                              let next = list;
                              if (e.target.checked) {
                                if (!list.includes(s)) next = [...list, s];
                              } else {
                                next = list.filter((x) => x !== s);
                              }
                              set("targetSite", next.join(","));
                            }}
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Section>

              {/* 月度服务费 */}
              <Section title="月度服务费" tone="slate">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="label text-xs">月度服务费</label>
                    <div className="flex gap-2">
                      <input
                        name="feeAmount"
                        className="input flex-1"
                        placeholder="如 10,000"
                        value={fields.feeAmount}
                        onChange={(e) => set("feeAmount", e.target.value)}
                      />
                      <select
                        name="feeCurrency"
                        className="input w-28"
                        value={fields.feeCurrency}
                        onChange={(e) => set("feeCurrency", e.target.value)}
                      >
                        {FEE_CURRENCY_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">月度服务费付款周期</label>
                    <select
                      name="paymentMethod"
                      className="input"
                      value={fields.paymentMethod}
                      onChange={(e) => set("paymentMethod", e.target.value)}
                    >
                      {PAYMENT_METHOD_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o || "（未指定）"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </Section>

              {/* 联盟归因GMV佣金 */}
              <Section title="联盟归因GMV佣金" tone="amber">
                <div>
                  <label className="label text-xs">GMV佣金结算方式</label>
                  <select
                    name="commissionType"
                    className="input"
                    value={fields.commissionType}
                    onChange={(e) => set("commissionType", e.target.value)}
                  >
                    {COMMISSION_TYPE_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {COMMISSION_TYPE_LABELS[k] ?? k}
                      </option>
                    ))}
                  </select>
                </div>

                {/* FIXED: 仅显示抽佣比例 */}
                {ct === "FIXED" && (
                  <div>
                    <label className="label text-xs">抽佣比例</label>
                    <input
                      name="commissionRate"
                      className="input"
                      placeholder="如 8%"
                      value={fields.commissionRate}
                      onChange={(e) => set("commissionRate", e.target.value)}
                    />
                  </div>
                )}

                {/* THRESHOLD: 门槛金额 + 货币 + 抽佣比例 */}
                {ct === "THRESHOLD" && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="label text-xs">GMV门槛金额</label>
                      <div className="flex gap-2">
                        <input
                          name="thresholdAmount"
                          className="input flex-1"
                          placeholder="如 100,000"
                          value={fields.thresholdAmount}
                          onChange={(e) =>
                            set("thresholdAmount", e.target.value)
                          }
                        />
                        <select
                          name="thresholdCurrency"
                          className="input w-28"
                          value={fields.thresholdCurrency}
                          onChange={(e) =>
                            set("thresholdCurrency", e.target.value)
                          }
                        >
                          {FEE_CURRENCY_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label text-xs">抽佣比例</label>
                      <input
                        name="commissionRate"
                        className="input"
                        placeholder="如 8%"
                        value={fields.commissionRate}
                        onChange={(e) => set("commissionRate", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* TIERED: 联盟归因GMV区间 + 对应佣金比例 */}
                {ct === "TIERED" && (
                  <div className="space-y-3">
                    <div>
                      <label className="label text-xs">阶梯币种</label>
                      <select
                        className="input w-32"
                        value={tierCurrency}
                        onChange={(e) => setTierCurrency(e.target.value)}
                      >
                        {FEE_CURRENCY_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      {/* 0 - X */}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-600 w-16 shrink-0">0 -</span>
                        <input
                          className="input flex-1"
                          placeholder="如 100,000"
                          value={tiers[0]?.to ?? ""}
                          onChange={(e) =>
                            updateTier(0, "to", e.target.value)
                          }
                        />
                        <span className="text-slate-500 shrink-0">元，佣金</span>
                        <input
                          className="input w-24"
                          placeholder="如 5%"
                          value={tiers[0]?.rate ?? ""}
                          onChange={(e) =>
                            updateTier(0, "rate", e.target.value)
                          }
                        />
                      </div>
                      {/* X - Y */}
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          className="input w-28"
                          placeholder="如 100,000"
                          value={tiers[1]?.from ?? ""}
                          onChange={(e) =>
                            updateTier(1, "from", e.target.value)
                          }
                        />
                        <span className="text-slate-500 shrink-0">-</span>
                        <input
                          className="input flex-1"
                          placeholder="如 500,000"
                          value={tiers[1]?.to ?? ""}
                          onChange={(e) =>
                            updateTier(1, "to", e.target.value)
                          }
                        />
                        <span className="text-slate-500 shrink-0">元，佣金</span>
                        <input
                          className="input w-24"
                          placeholder="如 8%"
                          value={tiers[1]?.rate ?? ""}
                          onChange={(e) =>
                            updateTier(1, "rate", e.target.value)
                          }
                        />
                      </div>
                      {/* Z 及以上 */}
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          className="input flex-1"
                          placeholder="如 500,000"
                          value={tiers[2]?.from ?? ""}
                          onChange={(e) =>
                            updateTier(2, "from", e.target.value)
                          }
                        />
                        <span className="text-slate-500 shrink-0">
                          元及以上，佣金
                        </span>
                        <input
                          className="input w-24"
                          placeholder="如 12%"
                          value={tiers[2]?.rate ?? ""}
                          onChange={(e) =>
                            updateTier(2, "rate", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* EXCESS: 基准月数 + 增长服务佣金 */}
                {ct === "EXCESS" && (
                  <div className="space-y-3">
                    <p className="rounded bg-amber-100/60 p-2 text-xs text-slate-700">
                      以合作开始前最近{" "}
                      <input
                        name="excessBaseMonths"
                        className="mx-1 w-14 rounded border border-slate-300 px-1.5 py-0.5 text-center"
                        placeholder="3"
                        value={fields.excessBaseMonths}
                        onChange={(e) =>
                          set("excessBaseMonths", e.target.value)
                        }
                      />{" "}
                      个月平均联盟 GMV 作为基准值。对于合作开始后，月度联盟归因
                      GMV 超出基准值部分，甲方向乙方支付{" "}
                      <input
                        name="excessCommissionRate"
                        className="mx-1 w-16 rounded border border-slate-300 px-1.5 py-0.5 text-center"
                        placeholder="10%"
                        value={fields.excessCommissionRate}
                        onChange={(e) =>
                          set("excessCommissionRate", e.target.value)
                        }
                      />{" "}
                      作为增长服务佣金。
                    </p>
                    <div>
                      <label className="label text-xs">抽佣比例（同步显示）</label>
                      <input
                        name="commissionRate"
                        className="input"
                        placeholder="自动等于增长服务佣金比例"
                        value={fields.commissionRate || fields.excessCommissionRate}
                        onChange={(e) => set("commissionRate", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* 联盟归因 GMV 结算周期 */}
                <div>
                  <label className="label text-xs">联盟归因GMV结算周期</label>
                  <div className="flex gap-2">
                    {GMV_SETTLEMENT_CYCLE_OPTIONS.map((c) => (
                      <label
                        key={c}
                        className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 cursor-pointer hover:border-brand-400 has-[input:checked]:border-brand-500 has-[input:checked]:bg-brand-50"
                      >
                        <input
                          type="radio"
                          name="gmvSettlementCycle"
                          value={c}
                          checked={fields.gmvSettlementCycle === c}
                          onChange={() => set("gmvSettlementCycle", c)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        {c}结算
                      </label>
                    ))}
                  </div>
                </div>
              </Section>
            </div>
          </div>

          <input type="hidden" name="extractedBy" value={fields.extractedBy} />
          <input type="hidden" name="tieredRules" defaultValue="" />

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

function Section({
  title,
  tone = "slate",
  children,
}: {
  title: string;
  tone?: "slate" | "amber";
  children: React.ReactNode;
}) {
  const bgClass =
    tone === "amber"
      ? "bg-amber-50/60 border-amber-100"
      : "bg-slate-50/60 border-slate-100";
  return (
    <div className={`rounded-lg border ${bgClass} p-3 space-y-3`}>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      {children}
    </div>
  );
}
