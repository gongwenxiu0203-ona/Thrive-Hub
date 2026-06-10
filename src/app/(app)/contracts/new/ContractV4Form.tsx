"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, Sparkles, Link2, Plus, Trash2, Copy, Check,
  ChevronDown, ChevronUp, FileDown, Upload, PenLine,
} from "lucide-react";
import { createContractV4, updateContractV4, type ContractV4Payload } from "@/actions/contracts";
import { cn } from "@/lib/utils";

type Customer = { id: string; brandName: string };
type UserOption = { id: string; name: string };

// 合作渠道选项
const COOP_CHANNELS = [
  { key: "ACC",             label: "Amazon Creator Connections（ACC）",           group: "Amazon 官方" },
  { key: "Attribution",    label: "Amazon Attribution（归因链接）",               group: "Amazon 官方" },
  { key: "Associates",     label: "Amazon Affiliate Associates（官方联盟）",       group: "Amazon 官方" },
  { key: "AmazonLive",     label: "Amazon Live",                                   group: "Amazon 官方" },
  { key: "Levanta",        label: "Levanta",                                       group: "第三方联盟平台" },
  { key: "Impact",         label: "Impact",                                        group: "第三方联盟平台" },
  { key: "Wayward",        label: "Wayward",                                       group: "第三方联盟平台" },
  { key: "ArcherAffiliates", label: "Archer Affiliates",                           group: "第三方联盟平台" },
  { key: "PrivateSocial",  label: "私域/社媒/流量渠道（Facebook/Telegram/Discord等）", group: "社媒渠道" },
] as const;

const TARGET_SITES = ["美国站", "英国站", "德国站", "法国", "西班牙", "加拿大", "澳洲", "日本"];

const COMMISSION_TYPES = [
  { value: "FIXED",     label: "固定点数佣金" },
  { value: "THRESHOLD", label: "GMV门槛佣金" },
  { value: "TIERED",   label: "阶梯式佣金" },
  { value: "EXCESS",   label: "超额增长佣金" },
];

type ProductRow = { name: string; asin: string; price: string; trackLink: string };

function emptyProduct(): ProductRow {
  return { name: "", asin: "", price: "", trackLink: "" };
}

interface Props {
  customers: Customer[];
  users: UserOption[];
  presetCustomerId?: string;
  presetCustomerName?: string;
  currentUserId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingContract?: any;
}

export function ContractV4Form({ customers, users, presetCustomerId, presetCustomerName, currentUserId, existingContract }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!existingContract;

  // ── 填写模式标签页 ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"manual" | "ai" | "link">("manual");
  const [aiText, setAiText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [fillToken, setFillToken] = useState(existingContract?.externalFillToken ?? "");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [createdContractId, setCreatedContractId] = useState<string | undefined>(existingContract?.id);

  // ── 表单字段 ──────────────────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState(presetCustomerId ?? existingContract?.customerId ?? "");
  const [ownerId, setOwnerId] = useState(existingContract?.ownerId ?? currentUserId ?? "");
  // 默认审核人：找名字包含 "Shallow" 的用户
  const defaultReviewer = users.find(u => u.name.toLowerCase().includes("shallow"))?.id ?? "";
  const [reviewerId, setReviewerId] = useState(existingContract?.reviewerId ?? defaultReviewer);
  const [partyAName,       setPartyAName]       = useState(existingContract?.partyA ?? "");
  const [partyACreditCode, setPartyACreditCode] = useState(existingContract?.partyACreditCode ?? "");
  const [partyALegalRep,   setPartyALegalRep]   = useState(existingContract?.partyALegalRep ?? "");
  const [partyAAddress,    setPartyAAddress]    = useState(existingContract?.partyAAddress ?? "");
  const [partyAContact,    setPartyAContact]    = useState(existingContract?.partyAContact ?? "");
  const [partyAPhone,      setPartyAPhone]      = useState(existingContract?.partyAPhone ?? "");
  const [partyAEmail,      setPartyAEmail]      = useState(existingContract?.partyAEmail ?? "");

  // 合作信息 — 销售平台（多选，第一条 + 推广平台 共用）
  const STD_PLATFORMS = ["亚马逊（Amazon）", "独立站", "沃尔玛（Walmart）"];
  const initialPlatforms = (existingContract?.promoPlatform ?? "亚马逊（Amazon）")
    .split(",").map((s: string) => s.trim()).filter(Boolean);
  const [platforms, setPlatforms] = useState<string[]>(
    initialPlatforms.filter((p: string) => STD_PLATFORMS.includes(p))
  );
  const [otherPlatform, setOtherPlatform] = useState<string>(
    initialPlatforms.find((p: string) => !STD_PLATFORMS.includes(p)) ?? ""
  );
  const togglePlatform = (p: string) =>
    setPlatforms(arr => arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p]);
  // 合并为逗号分隔字符串供 payload / DOCX 使用
  const promoPlatform = [...platforms, otherPlatform.trim()].filter(Boolean).join(",");
  const [targetSites,    setTargetSites]    = useState<string[]>(
    existingContract?.targetSite ? existingContract.targetSite.split(",").map((s: string) => s.trim()).filter(Boolean) : []
  );
  const [startDate,      setStartDate]      = useState(existingContract?.startDate ? new Date(existingContract.startDate).toISOString().slice(0, 10) : "");
  const [endDate,        setEndDate]        = useState(existingContract?.endDate ? new Date(existingContract.endDate).toISOString().slice(0, 10) : "");
  const [taxType,        setTaxType]        = useState(existingContract?.taxType ?? "不含税");
  const [taxBearer,      setTaxBearer]      = useState(existingContract?.taxBearer ?? "甲方");

  // 费用
  const [feeCurrency,    setFeeCurrency]    = useState(existingContract?.feeCurrency ?? "美金");
  const [contractType,   setContractType]   = useState(existingContract?.type ?? "BRAND");
  const [feeAmount,      setFeeAmount]      = useState(existingContract?.feeAmount ?? "");
  const [feeCycle,       setFeeCycle]       = useState(existingContract?.feeCycle ?? "季度预付");

  // 首期服务费：自动计算，不需要手动输入
  const computedFirstPeriodFee = (() => {
    const amt = parseFloat((feeAmount ?? "").replace(/,/g, ""));
    if (isNaN(amt) || amt <= 0) return null;
    return feeCycle === "月付" ? amt : amt * 3;
  })();

  // GMV 佣金
  const [commissionType, setCommissionType] = useState(existingContract?.commissionType ?? "FIXED");
  const [commissionRate, setCommissionRate] = useState(existingContract?.commissionRate ?? "");
  const [thresholdAmount, setThresholdAmount] = useState(existingContract?.thresholdAmount ?? "");
  const [thresholdCurrency, setThresholdCurrency] = useState(existingContract?.thresholdCurrency ?? "人民币");
  const [excessBaseMonths, setExcessBaseMonths] = useState(existingContract?.excessBaseMonths ?? "");
  const [excessRate,     setExcessRate]     = useState(existingContract?.excessCommissionRate ?? "");
  const [gmvCycle,       setGmvCycle]       = useState(existingContract?.gmvSettlementCycle ?? "月度");

  // 推广信息
  const [products, setProducts] = useState<ProductRow[]>(() => {
    try { return JSON.parse(existingContract?.productList ?? "[]"); } catch { return [emptyProduct()]; }
  });
  const [channels, setChannels] = useState<string[]>(() => {
    try { return JSON.parse(existingContract?.coopChannels ?? "[]"); } catch { return []; }
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── 产品列表操作 ───────────────────────────────────────────────────────────
  const addProduct = () => setProducts(p => [...p, emptyProduct()]);
  const removeProduct = (i: number) => setProducts(p => p.filter((_, idx) => idx !== i));
  const updateProduct = (i: number, k: keyof ProductRow, v: string) =>
    setProducts(p => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });

  // ── 合作渠道操作 ───────────────────────────────────────────────────────────
  const toggleChannel = (key: string) =>
    setChannels(c => c.includes(key) ? c.filter(x => x !== key) : [...c, key]);

  // ── 目标站点操作 ───────────────────────────────────────────────────────────
  const toggleSite = (site: string) =>
    setTargetSites(s => s.includes(site) ? s.filter(x => x !== site) : [...s, site]);

  // ── AI 文本提取 ────────────────────────────────────────────────────────────
  const runAiExtract = useCallback(async () => {
    if (!aiText.trim()) { setExtractNote("请先粘贴合同文本"); return; }
    setExtracting(true);
    setExtractNote(null);
    try {
      const res = await fetch("/api/contracts/v4-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const data = await res.json();
      if (!res.ok) { setExtractNote(data.error ?? "提取失败"); return; }
      const d = data.data ?? {};
      if (d.partyAName) setPartyAName(d.partyAName);
      if (d.partyACreditCode) setPartyACreditCode(d.partyACreditCode);
      if (d.partyALegalRep) setPartyALegalRep(d.partyALegalRep);
      if (d.partyAAddress) setPartyAAddress(d.partyAAddress);
      if (d.partyAContact) setPartyAContact(d.partyAContact);
      if (d.partyAPhone) setPartyAPhone(d.partyAPhone);
      if (d.partyAEmail) setPartyAEmail(d.partyAEmail);
      if (d.promoPlatform) {
        const parts = String(d.promoPlatform).split(",").map(s => s.trim()).filter(Boolean);
        setPlatforms(parts.filter(p => STD_PLATFORMS.includes(p)));
        const other = parts.find(p => !STD_PLATFORMS.includes(p));
        if (other) setOtherPlatform(other);
      }
      if (d.targetSite) setTargetSites(d.targetSite.split(",").map((s: string) => s.trim()).filter(Boolean));
      if (d.startDate) setStartDate(d.startDate);
      if (d.endDate) setEndDate(d.endDate);
      if (d.taxType) setTaxType(d.taxType);
      if (d.taxBearer) setTaxBearer(d.taxBearer);
      if (d.feeAmount) setFeeAmount(d.feeAmount);
      if (d.feeCurrency) setFeeCurrency(d.feeCurrency);
      if (d.feeCycle) setFeeCycle(d.feeCycle);
      if (d.commissionType) setCommissionType(d.commissionType);
      if (d.commissionRate) setCommissionRate(d.commissionRate);
      if (d.gmvSettlementCycle) setGmvCycle(d.gmvSettlementCycle);
      if (Array.isArray(d.coopChannels)) setChannels(d.coopChannels);
      setExtractNote("✅ AI 识别完成，请核对各字段后保存");
      setMode("manual");
    } catch {
      setExtractNote("提取失败，请重试");
    } finally {
      setExtracting(false);
    }
  }, [aiText]);

  // ── 校验「合作信息」内部字段（链接模式 + 各模式共用）──────────────────────────
  function validateCoopFields(): string | null {
    if (!customerId) return "请选择关联客户";
    if (platforms.length === 0 && !otherPlatform.trim()) return "请至少选择一个销售平台";
    if (targetSites.length === 0) return "请至少选择一个目标站点";
    if (!startDate) return "请填写合作开始日期";
    if (!endDate) return "请填写合作结束日期";
    if (!feeAmount.trim()) return "请填写月度服务费金额";
    if (commissionType === "FIXED" && !commissionRate.trim()) return "请填写 GMV 抽佣比例";
    if (commissionType === "THRESHOLD" && (!thresholdAmount.trim() || !commissionRate.trim())) return "请填写 GMV 门槛金额及抽佣比例";
    if (commissionType === "EXCESS" && (!excessBaseMonths.trim() || !excessRate.trim())) return "请填写超额佣金的基准月数及比例";
    if (channels.length === 0) return "请至少确认一个合作渠道";
    // 推广商品清单可为空（非必填）；填写或上传后会自动同步到合同文件
    return null;
  }

  // ── 校验甲方信息（手动/AI 模式才需要；链接模式由客户填写）────────────────────
  function validatePartyAFields(): string | null {
    if (!partyAName.trim()) return "请填写甲方签约主体公司名称";
    if (!partyACreditCode.trim()) return "请填写统一社会信用代码";
    if (!partyALegalRep.trim()) return "请填写法定代表人";
    if (!partyAAddress.trim()) return "请填写甲方地址";
    if (!partyAContact.trim()) return "请填写甲方指定联系人";
    if (!partyAPhone.trim()) return "请填写联系电话";
    if (!partyAEmail.trim()) return "请填写电子邮箱";
    return null;
  }

  // ── 生成外部填写链接：创建合同草稿 + 生成 token ─────────────────────────────
  const generateToken = async () => {
    setError(null);
    // 链接模式：仅需选择关联客户即可生成链接。
    // 甲方信息由客户通过链接填写（客户端必填）；合作信息可在客户填写后回系统补充。
    if (!customerId) { setError("请先选择关联客户"); return; }

    setGeneratingToken(true);
    try {
      let contractId = existingContract?.id;
      // 新建合同：先创建草稿（fillMethod=EXTERNAL_LINK，甲方信息留空待客户填写）
      if (!contractId) {
        const payload = { ...buildPayload(), fillMethod: "EXTERNAL_LINK" };
        const result = await createContractV4(payload);
        if (!result.ok || !result.contractId) {
          setError(result.error ?? "创建合同草稿失败");
          return;
        }
        contractId = result.contractId;
        setCreatedContractId(contractId);
      }
      const res = await fetch("/api/contracts/fill-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });
      const data = await res.json();
      if (data.token) setFillToken(data.token);
      else setError(data.error ?? "生成链接失败");
    } catch {
      setError("生成链接失败，请重试");
    } finally {
      setGeneratingToken(false);
    }
  };

  const fillLink = fillToken
    ? `${window.location.origin}/contract-fill/${fillToken}`
    : "";

  const copyLink = async () => {
    if (!fillLink) return;
    await navigator.clipboard.writeText(fillLink);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  // ── 构建 payload ───────────────────────────────────────────────────────────
  function buildPayload(): ContractV4Payload {
    return {
      customerId,
      ownerId: ownerId || undefined,
      reviewerId: reviewerId || undefined,
      type: contractType,
      partyAName,
      partyACreditCode,
      partyALegalRep,
      partyAAddress,
      partyAContact,
      partyAPhone,
      partyAEmail,
      promoPlatform,
      targetSite: targetSites.join(","),
      startDate,
      endDate,
      taxType,
      taxBearer,
      feeCurrency,
      feeAmount,
      firstPeriodFee: computedFirstPeriodFee ?? undefined,
      feeCycle,
      commissionType,
      commissionRate,
      thresholdAmount,
      thresholdCurrency,
      excessBaseMonths,
      excessCommissionRate: excessRate,
      gmvSettlementCycle: gmvCycle,
      productList: JSON.stringify(products.filter(p => p.name || p.asin || p.price || p.trackLink)),
      coopChannels: JSON.stringify(channels),
      fillMethod: mode === "ai" ? "AI_EXTRACT" : "MANUAL",
    };
  }

  // ── 提交 ───────────────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 所有字段必填：先校验合作信息，再校验甲方信息
    const coopErr = validateCoopFields();
    if (coopErr) { setError(coopErr); return; }
    const partyAErr = validatePartyAFields();
    if (partyAErr) { setError(partyAErr); return; }
    setError(null);

    startTransition(async () => {
      const payload = buildPayload();
      // 链接模式生成草稿后保存 → 走更新；否则新建/编辑
      const targetId = existingContract?.id ?? createdContractId;
      const result = targetId
        ? await updateContractV4(targetId, payload)
        : await createContractV4(payload);

      if (!result.ok) { setError(result.error ?? "保存失败"); return; }
      setSuccess(true);
      router.push(`/contracts/${result.contractId}`);
    });
  }

  return (
    <div className="space-y-6">
      {/* ── 模式切换标签 ── */}
      <div className="card p-1 flex gap-1">
        {([
          { key: "manual", icon: Pencil,   label: "手动填写" },
          { key: "ai",     icon: Sparkles, label: "AI 识别" },
          { key: "link",   icon: Link2,    label: "生成填写链接" },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
              mode === key
                ? "bg-brand-600 text-white"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── AI 识别模式 ── */}
      {mode === "ai" && (
        <div className="card p-5 space-y-3">
          <p className="text-sm text-slate-600">
            将已有的合同文本粘贴到下方，AI 将自动识别并填充甲方信息和合作条款
          </p>
          <textarea
            className="input font-mono text-xs"
            rows={8}
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            placeholder="粘贴合同全文或关键信息段落…"
          />
          {extractNote && (
            <p className={cn("text-xs", extractNote.startsWith("✅") ? "text-emerald-600" : "text-rose-500")}>
              {extractNote}
            </p>
          )}
          <button
            type="button"
            onClick={runAiExtract}
            disabled={extracting}
            className="btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            {extracting ? "识别中…" : "AI 自动识别并填充"}
          </button>
        </div>
      )}

      {/* ── 生成填写链接模式 ── */}
      {mode === "link" && (
        <div className="card p-5 space-y-4">
          <p className="text-sm text-slate-600">
            选择上方「关联客户」后即可点击「生成填写链接」，创建合同草稿并生成专属链接。
            发送给客户填写甲方信息（客户端全部必填）；合作信息可在客户填写完成后回本系统补充并保存合同。
          </p>
          {fillToken ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="flex-1 truncate text-xs text-slate-600 font-mono">{fillLink}</span>
                <button type="button" onClick={copyLink} className="btn-ghost btn-sm shrink-0">
                  {tokenCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {tokenCopied ? "已复制" : "复制"}
                </button>
              </div>
              <p className="text-xs text-emerald-600">
                ✅ 合同草稿已创建，链接有效期 7 天。客户填写后甲方信息自动同步，可在合同详情页查看与下载。
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-600">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={generateToken}
                disabled={generatingToken}
                className="btn-primary"
              >
                <Link2 className="h-4 w-4" />
                {generatingToken ? "生成中…" : "生成填写链接"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── 主表单 ── */}
      <form onSubmit={onSubmit} className="space-y-5">
        {/* 关联客户 */}
        {!presetCustomerId && (
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">关联客户 <span className="text-rose-500">*</span></label>
              <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                <option value="">请选择关联客户</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.brandName}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">合同类型</label>
                <select className="input" value={contractType} onChange={e => setContractType(e.target.value)}>
                  <option value="BRAND">品牌方合同</option>
                  <option value="CHANNEL">渠道商合同</option>
                  <option value="REBATE">返佣合同</option>
                </select>
              </div>
              <div>
                <label className="label">合同负责人（提交审核人）</label>
                <select className="input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                  <option value="">未指定（默认当前用户）</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">审核人</label>
                <select className="input" value={reviewerId} onChange={e => setReviewerId(e.target.value)}>
                  <option value="">未指定（默认 Shallow）</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
        {presetCustomerId && (
          <div className="card p-5 space-y-4">
            <div>
              <p className="label">关联客户</p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                {presetCustomerName}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">合同类型</label>
                <select className="input" value={contractType} onChange={e => setContractType(e.target.value)}>
                  <option value="BRAND">品牌方合同</option>
                  <option value="CHANNEL">渠道商合同</option>
                  <option value="REBATE">返佣合同</option>
                </select>
              </div>
              <div>
                <label className="label">合同负责人（提交审核人）</label>
                <select className="input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                  <option value="">未指定</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">审核人</label>
                <select className="input" value={reviewerId} onChange={e => setReviewerId(e.target.value)}>
                  <option value="">未指定</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── ① 甲方信息（链接模式下由客户填写，隐藏）── */}
        {mode === "link" ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-700">① 甲方信息</p>
            <p className="mt-1 text-xs text-slate-500">
              链接模式下，甲方信息由客户通过填写链接提交，无需在此填写。
            </p>
          </div>
        ) : (
        <FormSection title="① 甲方信息" color="blue">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">甲方签约主体公司名称 <span className="text-rose-500">*</span></label>
              <input className="input" required value={partyAName}
                onChange={e => setPartyAName(e.target.value)}
                placeholder="公司全称，与营业执照一致" />
            </div>
            <div>
              <label className="label">统一社会信用代码</label>
              <input className="input" value={partyACreditCode}
                onChange={e => setPartyACreditCode(e.target.value)}
                placeholder="18位统一社会信用代码" />
            </div>
            <div>
              <label className="label">法定代表人</label>
              <input className="input" value={partyALegalRep}
                onChange={e => setPartyALegalRep(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">甲方地址</label>
              <input className="input" value={partyAAddress}
                onChange={e => setPartyAAddress(e.target.value)}
                placeholder="公司注册地址" />
            </div>
            <div>
              <label className="label">甲方指定联系人</label>
              <input className="input" value={partyAContact}
                onChange={e => setPartyAContact(e.target.value)} />
            </div>
            <div>
              <label className="label">联系电话</label>
              <input className="input" type="tel" value={partyAPhone}
                onChange={e => setPartyAPhone(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">电子邮箱</label>
              <input className="input" type="email" value={partyAEmail}
                onChange={e => setPartyAEmail(e.target.value)} />
            </div>
          </div>
        </FormSection>
        )}

        {/* ── ② 合作信息 ── */}
        <FormSection title="② 合作信息" color="amber">
          <div className="space-y-4">
            {/* 销售平台（多选，对应合同第一条勾选 + 推广平台）*/}
            <div>
              <label className="label">销售平台 / 推广平台（可多选）</label>
              <div className="flex flex-wrap items-center gap-2">
                {STD_PLATFORMS.map(p => (
                  <label key={p}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      platforms.includes(p)
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    <input type="checkbox" className="hidden"
                      checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                    {p}
                  </label>
                ))}
                <input
                  className="input h-[34px] w-44 text-sm"
                  value={otherPlatform}
                  onChange={e => setOtherPlatform(e.target.value)}
                  placeholder="其他平台（手动填写）"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                所选平台将自动勾选合同第一条「销售平台」及项目确认书推广平台
              </p>
            </div>

            {/* 目标站点 */}
            <div>
              <label className="label">目标站点（可多选）</label>
              <div className="flex flex-wrap gap-2">
                {TARGET_SITES.map(site => (
                  <label key={site}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      targetSites.includes(site)
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    <input type="checkbox" className="hidden"
                      checked={targetSites.includes(site)}
                      onChange={() => toggleSite(site)} />
                    {site}
                  </label>
                ))}
              </div>
            </div>

            {/* 合作期限 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">合作开始日期</label>
                <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="label">合作结束日期</label>
                <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* 税费 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">税费</label>
                <select className="input" value={taxType} onChange={e => setTaxType(e.target.value)}>
                  <option>不含税</option>
                  <option>含税</option>
                </select>
              </div>
              <div>
                <label className="label">税费承担方</label>
                <input className="input" value={taxBearer} onChange={e => setTaxBearer(e.target.value)} />
              </div>
            </div>

            {/* 固费 */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600">固定服务费（月度）</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label text-xs">货币</label>
                  <select className="input" value={feeCurrency} onChange={e => setFeeCurrency(e.target.value)}>
                    <option>人民币</option>
                    <option>美金</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">月度服务费金额</label>
                  <input className="input" value={feeAmount}
                    onChange={e => setFeeAmount(e.target.value)} placeholder="如：5000" />
                </div>
                <div>
                  <label className="label text-xs">首期服务费（自动计算）</label>
                  <div className="input bg-slate-50 text-slate-700 cursor-not-allowed">
                    {computedFirstPeriodFee != null
                      ? `${feeCurrency === "美金" ? "$" : "¥"}${computedFirstPeriodFee.toLocaleString()}`
                      : <span className="text-slate-400 text-xs">月度服务费填写后自动计算</span>}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    月付 = 月度服务费×1；季度预付 = 月度服务费×3
                  </p>
                </div>
              </div>
              <div>
                <label className="label text-xs">固费支付周期</label>
                <div className="flex gap-2">
                  {["月付", "季度预付"].map(c => (
                    <label key={c} className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
                      feeCycle === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
                    )}>
                      <input type="radio" className="hidden" checked={feeCycle === c} onChange={() => setFeeCycle(c)} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* GMV 佣金 */}
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600">联盟归因 GMV 佣金</p>
              <div>
                <label className="label text-xs">佣金结算方式</label>
                <select className="input" value={commissionType} onChange={e => setCommissionType(e.target.value)}>
                  {COMMISSION_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>

              {commissionType === "FIXED" && (
                <div>
                  <label className="label text-xs">GMV 抽佣比例</label>
                  <input className="input" value={commissionRate}
                    onChange={e => setCommissionRate(e.target.value)} placeholder="如：8%" />
                </div>
              )}

              {commissionType === "THRESHOLD" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label text-xs">门槛币种</label>
                    <select className="input" value={thresholdCurrency} onChange={e => setThresholdCurrency(e.target.value)}>
                      <option>人民币</option><option>美金</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">GMV 门槛金额</label>
                    <input className="input" value={thresholdAmount}
                      onChange={e => setThresholdAmount(e.target.value)} placeholder="如：100000" />
                  </div>
                  <div>
                    <label className="label text-xs">达标后抽佣比例</label>
                    <input className="input" value={commissionRate}
                      onChange={e => setCommissionRate(e.target.value)} placeholder="如：8%" />
                  </div>
                </div>
              )}

              {commissionType === "EXCESS" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label text-xs">基准月数（取合作前N个月平均GMV）</label>
                    <input className="input" type="number" value={excessBaseMonths}
                      onChange={e => setExcessBaseMonths(e.target.value)} placeholder="如：3" />
                  </div>
                  <div>
                    <label className="label text-xs">超额增长部分佣金比例</label>
                    <input className="input" value={excessRate}
                      onChange={e => setExcessRate(e.target.value)} placeholder="如：10%" />
                  </div>
                </div>
              )}

              <div>
                <label className="label text-xs">GMV 结算周期</label>
                <div className="flex gap-2">
                  {["月度", "季度"].map(c => (
                    <label key={c} className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
                      gmvCycle === c ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"
                    )}>
                      <input type="radio" className="hidden" checked={gmvCycle === c} onChange={() => setGmvCycle(c)} />
                      {c}结算
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FormSection>

        {/* ── ③ 推广信息 ── */}
        <FormSection title="③ 推广信息" color="green">
          {/* 推广商品清单 */}
          <ProductListSection
            products={products}
            onAdd={addProduct}
            onRemove={removeProduct}
            onUpdate={updateProduct}
            onImport={setProducts}
          />

          {/* 合作渠道 */}
          <div className="space-y-2 mt-4">
            <p className="text-xs font-semibold text-slate-600">确认合作渠道</p>
            {(["Amazon 官方", "第三方联盟平台", "社媒渠道"] as const).map(group => (
              <div key={group}>
                <p className="mb-1 text-[11px] text-slate-400">{group}</p>
                <div className="space-y-1">
                  {COOP_CHANNELS.filter(c => c.group === group).map(c => (
                    <label key={c.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        channels.includes(c.key)
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
                      )}>
                      <input type="checkbox" className="h-3.5 w-3.5 rounded accent-brand-600"
                        checked={channels.includes(c.key)}
                        onChange={() => toggleChannel(c.key)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FormSection>

        {/* 错误/成功提示 */}
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-600">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-600">
            保存成功，正在跳转…
          </div>
        )}

        {/* ── 乙方签字图片（主合同 + 项目确认书通用）── */}
        <SignatureUpload />

        {/* 提交按钮 */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            取消
          </button>
          <div className="flex items-center gap-3">
            {isEdit && existingContract?.fillMethod && (
              <a
                href={`/api/contracts/generate-doc/${existingContract.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn-outline flex items-center gap-1.5 text-sm"
              >
                <FileDown className="h-4 w-4" /> 下载合同 DOCX
              </a>
            )}
            {/* 链接模式：合同在「生成填写链接」时已创建，此处不再显示提交按钮 */}
            {mode !== "link" && (
              <button type="submit" disabled={pending} className="btn-primary">
                {pending ? "保存中…" : (isEdit || createdContractId) ? "保存修改" : "创建合同"}
              </button>
            )}
            {mode === "link" && fillToken && (
              <button
                type="button"
                onClick={() => router.push(`/contracts/${createdContractId}`)}
                className="btn-primary"
              >
                完成，查看合同
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function FormSection({
  title, color, children,
}: {
  title: string; color: "blue" | "amber" | "green"; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const colorMap = {
    blue:  "bg-blue-50 border-blue-100",
    amber: "bg-amber-50 border-amber-100",
    green: "bg-emerald-50 border-emerald-100",
  };
  return (
    <div className={`rounded-2xl border ${colorMap[color]} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

// ── 乙方签字图片上传（全局，主合同+项目确认书两处签字通用） ──────────────────

function SignatureUpload() {
  const [exists, setExists] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    fetch("/api/contracts/signature")
      .then(r => r.json())
      .then(d => setExists(!!d.exists))
      .catch(() => {});
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNote(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/contracts/signature", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setNote(data.error ?? "上传失败"); return; }
      setExists(true);
      setPreviewKey(k => k + 1);
      setNote("✅ 签名已上传，将自动应用到所有合同的乙方签字处");
    } catch {
      setNote("上传失败，请重试");
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <PenLine className="h-4 w-4 text-brand-600" />
        <p className="text-sm font-semibold text-slate-700">乙方签字图片</p>
        <span className="text-xs text-slate-400">（主合同 + 项目确认书两处签字通用，盖章处留空）</span>
      </div>
      <div className="flex items-center gap-4">
        {exists ? (
          <img
            key={previewKey}
            src={`/signature-party-b.png?v=${previewKey}`}
            alt="乙方签名"
            className="h-16 rounded border border-slate-200 bg-slate-50 object-contain px-2"
          />
        ) : (
          <div className="flex h-16 w-40 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">
            未上传签名
          </div>
        )}
        <label className="btn-secondary cursor-pointer text-sm">
          <Upload className="h-4 w-4" />
          {uploading ? "上传中…" : exists ? "更换签名" : "上传签名图片"}
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {note && (
        <p className={`mt-2 text-xs ${note.startsWith("✅") ? "text-emerald-600" : "text-rose-500"}`}>{note}</p>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        建议上传背景透明的 PNG 签名图片，下载合同时自动嵌入乙方两处签字位置。
      </p>
    </div>
  );
}

// ── 推广商品清单组件（支持下载模板 + CSV/Excel 上传） ──────────────────────────

function ProductListSection({
  products, onAdd, onRemove, onUpdate, onImport,
}: {
  products: ProductRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, k: keyof ProductRow, v: string) => void;
  onImport: (rows: ProductRow[]) => void;
}) {
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportNote(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        // Parse CSV (handle BOM, CRLF, LF)
        const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = clean.split("\n").filter(l => l.trim());
        if (lines.length < 2) { setImportNote("文件为空或仅有表头"); return; }
        // Skip header row
        const rows: ProductRow[] = lines.slice(1).map(line => {
          // Simple CSV parse (handle quoted fields)
          const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
          return {
            name: cols[0] ?? "",
            asin: cols[1] ?? "",
            price: cols[2] ?? "",
            trackLink: cols[3] ?? "",
          };
        }).filter(r => r.name || r.asin);

        if (!rows.length) { setImportNote("未识别到有效商品行（需填写商品名称或ASIN）"); return; }
        onImport(rows);
        setImportNote(`✅ 已导入 ${rows.length} 个商品`);
      } catch {
        setImportNote("解析失败，请使用下载的模板文件");
      } finally {
        setImporting(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">推广商品清单</p>
        <div className="flex items-center gap-2">
          {/* 下载模板 */}
          <a
            href="/api/contracts/product-template"
            download="product-list-template.csv"
            className="btn-ghost btn-sm"
          >
            <FileDown className="h-3.5 w-3.5" /> 下载表头模板
          </a>
          {/* 上传 CSV */}
          <label className="btn-ghost btn-sm cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            {importing ? "导入中…" : "上传 CSV"}
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFile}
              disabled={importing}
            />
          </label>
          {/* 手动添加一行 */}
          <button type="button" onClick={onAdd} className="btn-ghost btn-sm">
            <Plus className="h-3.5 w-3.5" /> 添加商品
          </button>
        </div>
      </div>

      {importNote && (
        <p className={`text-xs ${importNote.startsWith("✅") ? "text-emerald-600" : "text-rose-500"}`}>
          {importNote}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">商品名称</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">ASIN</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">零售价（参考）</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">专属优惠码/追踪链接</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="px-2 py-1.5">
                  <input className="input py-1 text-xs" value={p.name}
                    onChange={e => onUpdate(i, "name", e.target.value)} placeholder="商品名称" />
                </td>
                <td className="px-2 py-1.5">
                  <input className="input py-1 text-xs" value={p.asin}
                    onChange={e => onUpdate(i, "asin", e.target.value)} placeholder="B0XXXXX" />
                </td>
                <td className="px-2 py-1.5">
                  <input className="input py-1 text-xs" value={p.price}
                    onChange={e => onUpdate(i, "price", e.target.value)} placeholder="$XX.XX" />
                </td>
                <td className="px-2 py-1.5">
                  <input className="input py-1 text-xs" value={p.trackLink}
                    onChange={e => onUpdate(i, "trackLink", e.target.value)} placeholder="优惠码或链接" />
                </td>
                <td className="px-2 py-1.5">
                  {products.length > 1 && (
                    <button type="button" onClick={() => onRemove(i)}
                      className="text-slate-300 hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
