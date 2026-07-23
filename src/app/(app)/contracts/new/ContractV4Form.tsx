"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, Sparkles, Link2, Plus, Trash2, Copy, Check,
  ChevronDown, ChevronUp, FileDown, Upload,
} from "lucide-react";
import { createContractV4, updateContractV4, type ContractV4Payload } from "@/actions/contracts";
import { cn } from "@/lib/utils";
import {
  PARTY_B_COMPANIES,
  PARTY_B_BANKS,
  parsePartyBBanks,
  type PartyBCompanyKey,
  type PartyBBankKey,
} from "@/lib/partyB";
import {
  COMMISSION_METHOD_LABELS,
  CURRENCY_OPTIONS,
  normalizeTemplateKey,
  parseCommissionConfig,
  stringifyCommissionConfig,
  type TieredCommissionRule,
} from "@/lib/contractCommissionConfig";
import {
  CONTRACT_FEE_CURRENCIES,
  CONTRACT_FEE_CYCLES,
  CONTRACT_GMV_CYCLES,
  CONTRACT_STANDARD_PLATFORMS,
  CONTRACT_TARGET_SITES,
} from "@/lib/contractFormOptions";

type Customer = { id: string; brandName: string };
type UserOption = { id: string; name: string };
type TemplateOption = { id: string; name: string; templateKey: string };

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

const COMMISSION_TYPES = Object.entries(COMMISSION_METHOD_LABELS).map(([value, label]) => ({ value, label }));

type ProductRow = { name: string; asin: string; price: string; trackLink: string };

function emptyProduct(): ProductRow {
  return { name: "", asin: "", price: "", trackLink: "" };
}

// 百分比输入：用户只输数字，输入框固定显示 % 后缀
function PercentInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const shown = String(value ?? "").replace(/%/g, "");
  return (
    <div className="relative">
      <input
        className="input pr-7"
        inputMode="decimal"
        value={shown}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
    </div>
  );
}

interface Props {
  customers: Customer[];
  users: UserOption[];
  templates: TemplateOption[];
  presetCustomerId?: string;
  presetCustomerName?: string;
  currentUserId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingContract?: any;
  uploadSubmit?: (payload: ContractV4Payload) => Promise<{
    ok: boolean;
    error?: string;
    contractId?: string;
  }>;
}

export function ContractV4Form({ customers, users, templates, presetCustomerId, presetCustomerName, currentUserId, existingContract, uploadSubmit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!existingContract && !uploadSubmit;

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
  const [partyAAddress,    setPartyAAddress]    = useState(existingContract?.partyAAddress ?? "");
  const [partyAContact,    setPartyAContact]    = useState(existingContract?.partyAContact ?? "");
  const [partyAPhone,      setPartyAPhone]      = useState(existingContract?.partyAPhone ?? "");
  const [partyAEmail,      setPartyAEmail]      = useState(existingContract?.partyAEmail ?? "");

  // ── 模板选择 ──
  const [templateId, setTemplateId] = useState<string>(existingContract?.templateId ?? "");

  // ── 乙方信息：选公司后自动联动地址/联系人/法人 ──
  const [partyBCompany, setPartyBCompany] = useState<PartyBCompanyKey | "">(
    (existingContract?.partyBCompany as PartyBCompanyKey) || ""
  );
  const initialBanks: PartyBBankKey[] = (() => {
    try {
      const parsed = parsePartyBBanks(JSON.parse(existingContract?.partyBBankAccounts ?? "[]"));
      if (parsed.length > 0) return parsed;
    } catch {
      // Fall through to the selected company's default account.
    }
    const companyKey = existingContract?.partyBCompany as PartyBCompanyKey | undefined;
    return companyKey && PARTY_B_COMPANIES[companyKey]
      ? [PARTY_B_COMPANIES[companyKey].defaultBank]
      : [];
  })();
  const [partyBBankAccounts, setPartyBBankAccounts] = useState<PartyBBankKey[]>(initialBanks);
  // 特殊佣金条款（仅 SPECIAL 模板使用）
  const [specialCommissionTerms, setSpecialCommissionTerms] = useState<string>(
    existingContract?.specialCommissionTerms ?? ""
  );

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const isSpecialTemplate = selectedTemplate?.templateKey === "SPECIAL";
  const existingCommissionConfig = parseCommissionConfig(existingContract?.commissionConfig);
  const activeCommissionType = normalizeTemplateKey(selectedTemplate?.templateKey ?? existingCommissionConfig.templateKey ?? existingContract?.commissionType ?? "FIXED");

  function toggleBank(k: PartyBBankKey) {
    setPartyBBankAccounts((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  }

  function selectPartyBCompany(key: PartyBCompanyKey) {
    setPartyBCompany(key);
    // 选公司时，若未勾任何账户则默认勾上该公司的账户
    const info = PARTY_B_COMPANIES[key];
    setPartyBBankAccounts((prev) => (prev.length === 0 ? [info.defaultBank] : prev));
  }

  // 合作信息 — 销售平台（多选，第一条 + 推广平台 共用）
  const STD_PLATFORMS: readonly string[] = CONTRACT_STANDARD_PLATFORMS;
  const initialPlatforms = (existingContract?.promoPlatform ?? (uploadSubmit ? "" : "亚马逊（Amazon）"))
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
  const [taxType,        setTaxType]        = useState(existingContract?.taxType ?? (uploadSubmit ? "" : "不含税"));
  const [taxBearer,      setTaxBearer]      = useState(existingContract?.taxBearer ?? (uploadSubmit ? "" : "甲方"));

  // 费用
  const [feeCurrency,    setFeeCurrency]    = useState(existingContract?.feeCurrency ?? (uploadSubmit ? "" : "美金"));
  const [contractType,   setContractType]   = useState(existingContract?.type ?? "BRAND");
  const [feeAmount,      setFeeAmount]      = useState(existingContract?.feeAmount ?? "");
  const [feeCycle,       setFeeCycle]       = useState(existingContract?.feeCycle ?? (uploadSubmit ? "" : "月付"));

  // 首期服务费：自动计算，不需要手动输入
  const computedFirstPeriodFee = (() => {
    const amt = parseFloat((feeAmount ?? "").replace(/,/g, ""));
    if (isNaN(amt) || amt <= 0) return null;
    return feeCycle === "月付" ? amt : amt * 3;
  })();

  // GMV 佣金
  const [commissionType, setCommissionType] = useState(existingContract?.commissionType ?? "FIXED");
  const [commissionRate, setCommissionRate] = useState(existingCommissionConfig.fixed?.rate ?? existingContract?.commissionRate ?? "");
  const [thresholdAmount, setThresholdAmount] = useState(existingContract?.thresholdAmount ?? "");
  const [thresholdCurrency, setThresholdCurrency] = useState(existingContract?.thresholdCurrency ?? "人民币");
  const [thresholdReachedRate, setThresholdReachedRate] = useState(existingCommissionConfig.threshold?.reachedRate ?? existingContract?.commissionRate ?? "");
  const [thresholdUnreachedRate, setThresholdUnreachedRate] = useState(existingCommissionConfig.threshold?.unreachedRate ?? "");
  const [tieredCurrency, setTieredCurrency] = useState(existingCommissionConfig.tiered?.currency ?? "USD");
  const [tieredRows, setTieredRows] = useState<TieredCommissionRule[]>(
    existingCommissionConfig.tiered?.tiers?.length
      ? existingCommissionConfig.tiered.tiers
      : [{ from: "0", to: "", rate: "" }]
  );
  const [excessBaseMonths, setExcessBaseMonths] = useState(existingContract?.excessBaseMonths ?? "");
  const [excessRate,     setExcessRate]     = useState(existingCommissionConfig.incremental?.excessRate ?? existingContract?.excessCommissionRate ?? "");
  const [gmvCycle,       setGmvCycle]       = useState(existingContract?.gmvSettlementCycle ?? (uploadSubmit ? "" : "月度"));
  const [specialTotalCommissionRate, setSpecialTotalCommissionRate] = useState(
    existingCommissionConfig.special?.totalCommissionRate
      ?? existingCommissionConfig.special?.attributionRate
      ?? ""
  );
  const [specialSalesCommissionRate, setSpecialSalesCommissionRate] = useState(
    existingCommissionConfig.special?.salesCommissionRate
      ?? existingCommissionConfig.special?.creatorRate
      ?? ""
  );
  const [specialGmvCurrency, setSpecialGmvCurrency] = useState(existingCommissionConfig.special?.lowGmvThresholdCurrency ?? "USD");

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
    if (!templateId) return "请选择适用的合同模板";
    if (!partyBCompany) return "请选择乙方签约公司";
    if (partyBBankAccounts.length === 0) return "请至少选择一个乙方收款账户";
    if (platforms.length === 0 && !otherPlatform.trim()) return "请至少选择一个销售平台";
    if (targetSites.length === 0) return "请至少选择一个目标站点";
    if (!startDate) return "请填写合作开始日期";
    if (!endDate) return "请填写合作结束日期";
    if (!taxType) return "请选择税费类型";
    if (!taxBearer.trim()) return "请填写税费承担方";
    if (!feeCurrency) return "请选择月度服务费货币";
    if (!feeAmount.trim()) return "请填写月度服务费金额";
    if (!feeCycle) return "请选择固费支付周期";
    if (!gmvCycle) return "请选择 GMV 结算周期";
    if (activeCommissionType === "FIXED" && !commissionRate.trim()) return "请填写 GMV 抽佣比例";
    if (activeCommissionType === "THRESHOLD" && (!thresholdAmount.trim() || !(thresholdReachedRate || commissionRate).trim() || !thresholdUnreachedRate.trim())) return "请填写 GMV 门槛金额、达标后比例和未达标比例";
    if (activeCommissionType === "TIERED" && tieredRows.some((r) => !r.from.trim() || !r.rate.trim())) return "请填写完整的阶梯区间和佣金比例";
    if (activeCommissionType === "INCREMENTAL" && (!excessBaseMonths.trim() || !excessRate.trim())) return "请填写增量佣金的基准月数及比例";
    if (activeCommissionType === "SPECIAL" && !specialTotalCommissionRate.trim()) return "请填写总包佣金";
    if (activeCommissionType === "SPECIAL" && !specialCommissionTerms.trim()) return "请填写特殊佣金规则";
    if (channels.length === 0) return "请至少确认一个合作渠道";
    // 推广商品清单可为空（非必填）；填写或上传后会自动同步到合同文件
    return null;
  }

  // ── 校验甲方信息（手动/AI 模式才需要；链接模式由客户填写）────────────────────
  function validatePartyAFields(): string | null {
    if (!partyAName.trim()) return "请填写甲方签约主体公司名称";
    if (!partyACreditCode.trim()) return "请填写统一社会信用代码";
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

  function updateTierRow(index: number, key: keyof TieredCommissionRule, value: string) {
    setTieredRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addTierRow() {
    setTieredRows((rows) => {
      const last = rows[rows.length - 1];
      const nextStart = Number(last?.to);
      return [...rows, { from: Number.isFinite(nextStart) ? String(nextStart + 1) : "", to: "", rate: "" }];
    });
  }

  function removeTierRow(index: number) {
    setTieredRows((rows) => rows.length <= 1 ? rows : rows.filter((_, i) => i !== index));
  }

  // ── 构建 payload ───────────────────────────────────────────────────────────
  function buildPayload(): ContractV4Payload {
    const commissionConfig = {
      templateKey: activeCommissionType,
      fixed: { rate: commissionRate },
      threshold: {
        currency: thresholdCurrency,
        amount: thresholdAmount,
        reachedRate: thresholdReachedRate || commissionRate,
        unreachedRate: thresholdUnreachedRate,
      },
      tiered: {
        currency: tieredCurrency,
        tiers: tieredRows,
      },
      incremental: {
        baseMonths: excessBaseMonths,
        excessRate,
      },
      special: {
        totalCommissionRate: specialTotalCommissionRate,
        salesCommissionRate: specialSalesCommissionRate,
        stockPublisherConfirmDays: "10",
        lowGmvThresholdCurrency: specialGmvCurrency,
        highGmvThresholdCurrency: specialGmvCurrency,
        rawText: specialCommissionTerms,
      },
    };
    return {
      customerId,
      ownerId: ownerId || undefined,
      reviewerId: reviewerId || undefined,
      type: contractType,
      partyAName,
      partyACreditCode,
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
      commissionType: activeCommissionType,
      commissionRate: activeCommissionType === "THRESHOLD" ? (thresholdReachedRate || commissionRate) : commissionRate,
      thresholdAmount,
      thresholdCurrency,
      tieredRules: stringifyCommissionConfig({ tiered: commissionConfig.tiered }),
      excessBaseMonths,
      excessCommissionRate: excessRate,
      gmvSettlementCycle: gmvCycle,
      commissionConfig: stringifyCommissionConfig(commissionConfig),
      productList: JSON.stringify(products.filter(p => p.name || p.asin || p.price || p.trackLink)),
      coopChannels: JSON.stringify(channels),
      fillMethod: fillToken
        ? "EXTERNAL_LINK"
        : mode === "ai"
          ? "AI_EXTRACT"
          : "MANUAL",
      // 模板 + 乙方信息（P1/P2 新增）
      templateId: templateId || undefined,
      partyBCompany: partyBCompany || undefined,
      partyBBankAccounts: JSON.stringify(partyBBankAccounts),
      specialCommissionTerms: isSpecialTemplate ? (specialCommissionTerms || undefined) : undefined,
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
      const result = uploadSubmit
        ? await uploadSubmit(payload)
        : targetId
          ? await updateContractV4(targetId, payload)
          : await createContractV4(payload);

      if (!result.ok) { setError(result.error ?? "保存失败"); return; }
      setSuccess(true);
      router.push(`/contracts/${result.contractId}`);
    });
  }

  return (
    <div className="space-y-6">
      {/* ── 主表单（手动填写 + 甲方信息区可触发 AI 识别 / 生成填写链接） ── */}
      <form onSubmit={onSubmit} className="space-y-5">
        {/* 关联客户 */}
        {(!presetCustomerId || isEdit) && (
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
            <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} />
          </div>
        )}
        {presetCustomerId && !isEdit && (
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
            <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} />
          </div>
        )}

        {/* ── ② 乙方信息（公司选择 + 收款账户多选 + 自动联动）── */}
        <PartyBSection
          partyBCompany={partyBCompany}
          onSelectCompany={selectPartyBCompany}
          partyBBankAccounts={partyBBankAccounts}
          onToggleBank={toggleBank}
        />

        {/* ── ③ 甲方信息（可手动填写 / AI 识别 / 生成填写链接发给客户填）── */}
        <FormSection title="③ 甲方信息" color="blue">
          {/* AI 识别 + 生成填写链接 内联工具栏 */}
          {!uploadSubmit && <div className="mb-4 space-y-3 rounded-lg border border-blue-100 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMode(mode === "ai" ? "manual" : "ai")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "ai"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600 hover:border-brand-300"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {mode === "ai" ? "关闭 AI 识别面板" : "AI 识别填充"}
              </button>
              <button
                type="button"
                onClick={generateToken}
                disabled={generatingToken}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {generatingToken ? "生成中…" : "生成填写链接发给客户"}
              </button>
              <p className="ml-auto text-[11px] text-slate-400">两种方式可任选其一辅助填写</p>
            </div>

            {mode === "ai" && (
              <div className="space-y-2 rounded-md bg-slate-50 p-3">
                <textarea
                  className="input font-mono text-xs"
                  rows={6}
                  value={aiText}
                  onChange={e => setAiText(e.target.value)}
                  placeholder="粘贴合同全文或关键信息段落，AI 将自动填充下方字段…"
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
                  className="btn-primary text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {extracting ? "识别中…" : "运行 AI 识别"}
                </button>
              </div>
            )}

            {fillToken && (
              <div className="space-y-1.5 rounded-md bg-emerald-50 p-3">
                <div className="flex items-center gap-2 rounded border border-emerald-200 bg-white px-2 py-1.5">
                  <span className="flex-1 truncate text-xs text-slate-600 font-mono">{fillLink}</span>
                  <button type="button" onClick={copyLink} className="btn-ghost btn-sm shrink-0">
                    {tokenCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {tokenCopied ? "已复制" : "复制"}
                  </button>
                </div>
                <p className="text-[11px] text-emerald-700">链接有效期 60 天，可转发给甲方相关人员重复填写；合同进入审核或签署流程后自动失效。</p>
              </div>
            )}
          </div>}

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

        {/* ── ② 合作信息 ── */}
        <FormSection title="④ 合作信息" color="amber">
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
                {CONTRACT_TARGET_SITES.map(site => (
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
                  {uploadSubmit && <option value="">请选择</option>}
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
                    {uploadSubmit && <option value="">请选择</option>}
                    {CONTRACT_FEE_CURRENCIES.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
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
                  {CONTRACT_FEE_CYCLES.map(c => (
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
                <select className="input" value={activeCommissionType} disabled>
                  {COMMISSION_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>

              {activeCommissionType === "FIXED" && (
                <div>
                  <label className="label text-xs">GMV 抽佣比例</label>
                  <PercentInput value={commissionRate} onChange={setCommissionRate} placeholder="如：8" />
                </div>
              )}

              {activeCommissionType === "THRESHOLD" && (
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
                    <PercentInput value={commissionRate} onChange={setCommissionRate} placeholder="如：8" />
                  </div>
                </div>
              )}

              {activeCommissionType === "THRESHOLD" && (
                <div>
                  <label className="label text-xs">未达标抽佣比例</label>
                  <PercentInput value={thresholdUnreachedRate} onChange={setThresholdUnreachedRate} placeholder="如：3" />
                </div>
              )}

              {activeCommissionType === "TIERED" && (
                <div className="space-y-3">
                  <div className="max-w-xs">
                    <label className="label text-xs">阶梯币种</label>
                    <select className="input" value={tieredCurrency} onChange={e => setTieredCurrency(e.target.value)}>
                      {CURRENCY_OPTIONS.map((currency) => (
                        <option key={currency.value} value={currency.value}>{currency.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {tieredRows.map((row, index) => (
                      <div key={index} className="grid gap-2 rounded-lg border border-amber-100 bg-white/70 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <div>
                          <label className="label text-xs">起始 GMV</label>
                          <input className="input" value={row.from} onChange={e => updateTierRow(index, "from", e.target.value)} placeholder="0" />
                        </div>
                        <div>
                          <label className="label text-xs">结束 GMV</label>
                          <input className="input" value={row.to ?? ""} onChange={e => updateTierRow(index, "to", e.target.value)} placeholder="留空=以上" />
                        </div>
                        <div>
                          <label className="label text-xs">佣金比例</label>
                          <PercentInput value={row.rate} onChange={(v) => updateTierRow(index, "rate", v)} placeholder="如：8" />
                        </div>
                        <div className="flex items-end">
                          <button type="button" className="btn-secondary w-full text-xs" onClick={() => removeTierRow(index)} disabled={tieredRows.length <= 1}>
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn-secondary text-xs" onClick={addTierRow}>
                    + 新增阶梯
                  </button>
                </div>
              )}

              {activeCommissionType === "SPECIAL" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label text-xs">币种</label>
                    <select className="input" value={specialGmvCurrency} onChange={e => setSpecialGmvCurrency(e.target.value)}>
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">总包佣金</label>
                    <PercentInput value={specialTotalCommissionRate} onChange={setSpecialTotalCommissionRate} placeholder="如：10" />
                  </div>
                  <div>
                    <label className="label text-xs">销售佣金比例（可为空）</label>
                    <PercentInput value={specialSalesCommissionRate} onChange={setSpecialSalesCommissionRate} placeholder="对账后可手动补足" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label text-xs">特殊佣金规则</label>
                    <textarea
                      className="input min-h-28"
                      rows={4}
                      value={specialCommissionTerms}
                      onChange={(e) => setSpecialCommissionTerms(e.target.value)}
                      placeholder="请输入特殊佣金的计算、确认及结算规则"
                    />
                  </div>
                </div>
              )}

              {activeCommissionType === "INCREMENTAL" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label text-xs">基准月数（取合作前N个月平均GMV）</label>
                    <input className="input" type="number" value={excessBaseMonths}
                      onChange={e => setExcessBaseMonths(e.target.value)} placeholder="如：3" />
                  </div>
                  <div>
                    <label className="label text-xs">超额增长部分佣金比例</label>
                    <PercentInput value={excessRate} onChange={setExcessRate} placeholder="如：10" />
                  </div>
                </div>
              )}

              <div>
                <label className="label text-xs">GMV 结算周期</label>
                <div className="flex gap-2">
                  {CONTRACT_GMV_CYCLES.map(c => (
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
        <FormSection title="⑤ 推广信息" color="green">
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
            {/* 保存草稿（仅创建模式可用，不做强校验） */}
            {!isEdit && !createdContractId && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  if (!customerId) { setError("草稿至少需要选择关联客户"); return; }
                  startTransition(async () => {
                    const payload = { ...buildPayload(), saveAsDraft: true };
                    const result = await createContractV4(payload);
                    if (!result.ok || !result.contractId) {
                      setError(result.error ?? "保存草稿失败"); return;
                    }
                    router.push(`/contracts/${result.contractId}`);
                  });
                }}
                className="btn-secondary"
              >
                保存草稿
              </button>
            )}
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "保存中…" : uploadSubmit ? "确认字段并创建合同" : (isEdit || createdContractId) ? "保存修改" : "创建合同"}
            </button>
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

// ── 模板选择器（按佣金机制类型分组） ──────────────────────────────────────────

const TEMPLATE_KEY_LABELS_INLINE: Record<string, string> = {
  FIXED: "全量·固佣",
  SPECIAL: "特殊佣金",
  TIERED: "全量·阶梯式佣金",
  THRESHOLD: "全量·门槛佣金",
  INCREMENTAL: "增量·佣金",
};

function TemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: TemplateOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">选择适用的合同模板 <span className="text-rose-500">*</span></label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">请选择适用的合同模板</option>
        {Object.entries(TEMPLATE_KEY_LABELS_INLINE).map(([key, label]) => {
          const items = templates.filter((t) => t.templateKey === key);
          if (items.length === 0) return null;
          return (
            <optgroup key={key} label={label}>
              {items.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <p className="mt-1 text-[11px] text-slate-400">
        模板由管理员在「合同模板库」上传维护；选择后将作为生成 docx 的基础。
      </p>
    </div>
  );
}

// ── 乙方信息：公司二选一 + 收款账户多选 + 联动地址联系人 ──────────────────────

function PartyBSection({
  partyBCompany,
  onSelectCompany,
  partyBBankAccounts,
  onToggleBank,
}: {
  partyBCompany: PartyBCompanyKey | "";
  onSelectCompany: (k: PartyBCompanyKey) => void;
  partyBBankAccounts: PartyBBankKey[];
  onToggleBank: (k: PartyBBankKey) => void;
}) {
  const info = partyBCompany ? PARTY_B_COMPANIES[partyBCompany] : null;
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 overflow-hidden">
      <div className="border-b border-emerald-100 px-5 py-3">
        <p className="text-sm font-semibold text-slate-700">② 乙方信息</p>
        <p className="mt-0.5 text-[11px] text-slate-500">选择签约主体后，地址/联系人/电话/邮箱自动联动。可多选收款账户，多选则均写入合同。</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {/* 乙方签约公司：单选 */}
        <div>
          <p className="label">乙方签约公司 <span className="text-rose-500">*</span></p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(PARTY_B_COMPANIES) as PartyBCompanyKey[]).map((k) => {
              const c = PARTY_B_COMPANIES[k];
              const selected = partyBCompany === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onSelectCompany(k)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    selected
                      ? "border-emerald-500 bg-white text-slate-800 shadow-sm"
                      : "border-slate-200 bg-white/70 text-slate-600 hover:border-emerald-300"
                  )}
                >
                  <span className="text-sm font-semibold">{c.label}</span>
                  <span className="mt-0.5 break-all text-[10px] text-slate-400">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 联动信息卡 */}
        {info && (
          <div className="rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-600">
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div><span className="text-slate-400">统一社会信用代码：</span>{info.creditCode}</div>
              <div className="sm:col-span-2"><span className="text-slate-400">地址：</span>{info.address}</div>
              <div><span className="text-slate-400">联系人：</span>{info.contact}</div>
              <div><span className="text-slate-400">电话：</span>{info.phone}</div>
              <div className="sm:col-span-2"><span className="text-slate-400">邮箱：</span>{info.email}</div>
            </div>
          </div>
        )}

        {/* 收款账户多选 */}
        <div>
          <p className="label">收款账户（可多选）</p>
          <div className="space-y-2">
            {(Object.keys(PARTY_B_BANKS) as PartyBBankKey[]).map((k) => {
              const b = PARTY_B_BANKS[k];
              const checked = partyBBankAccounts.includes(k);
              return (
                <label
                  key={k}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-3 text-xs transition-colors",
                    checked ? "border-emerald-500" : "border-slate-200 hover:border-emerald-300"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={checked}
                    onChange={() => onToggleBank(k)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{b.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      户名 {b.accountName} · 行 {b.bankName} · 账号 {b.accountNo}{b.swift ? ` · SWIFT ${b.swift}` : ""}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
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
