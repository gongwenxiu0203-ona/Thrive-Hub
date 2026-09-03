"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { uploadChannelContract } from "@/actions/contracts";
import { PARTY_B_COMPANIES } from "@/lib/partyB";

type CustomerOption = { id: string; brandName: string; channelAccount?: { id: string; name: string; email: string } | null };

export function ChannelUploadForm({ customers, users, currentUserId, presetCustomerId }: {
  customers: CustomerOption[]; users: { id: string; name: string }[]; currentUserId: string; presetCustomerId?: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [partyBCompany, setPartyBCompany] = useState("");
  const [partyBContact, setPartyBContact] = useState("");
  const [partyBPhone, setPartyBPhone] = useState("");
  const [partyBEmail, setPartyBEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fixedFeeRate, setFixedFeeRate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const thraive = PARTY_B_COMPANIES.THRAIVE;

  function selectCustomer(nextId: string) {
    setCustomerId(nextId);
    const account = customers.find((item) => item.id === nextId)?.channelAccount;
    if (account) {
      setPartyBCompany((value) => value || account.name);
      setPartyBContact((value) => value || account.name);
      setPartyBEmail((value) => value || account.email);
    }
  }

  function submit(formElement: HTMLFormElement) {
    setError(null);
    const fd = new FormData(formElement);
    const selectedCustomerId = String(fd.get("customerId") ?? "").trim();
    const selectedOwnerId = String(fd.get("ownerId") ?? "").trim();
    const selectedStartDate = String(fd.get("startDate") ?? "").trim();
    const selectedEndDate = String(fd.get("endDate") ?? "").trim();
    const selectedFile = fd.get("file");
    if (!selectedCustomerId) return setError("请选择关联客户");
    if (!selectedOwnerId) return setError("请选择合同负责人");
    if (!["partyBCompany", "partyBContact", "partyBPhone", "partyBEmail"].every((key) => String(fd.get(key) ?? "").trim())) return setError("请完整填写乙方公司、联系人、电话和邮箱");
    if (!selectedStartDate || !selectedEndDate) return setError("请填写合同开始时间和截止时间");
    if (selectedStartDate > selectedEndDate) return setError("合同截止时间不能早于开始时间");
    const fixedRate = Number(fd.get("fixedFeeRate"));
    if (!Number.isFinite(fixedRate) || fixedRate < 0 || fixedRate > 100) return setError("固定月度服务费渠道合作费的乙方比例需在 0% 至 100% 之间");
    if (!(selectedFile instanceof File) || selectedFile.size === 0) return setError("请选择已签署的渠道商返佣合同原件");
    startTransition(async () => {
      const result = await uploadChannelContract(fd);
      if (!result.ok || !result.contractId) return setError(result.error ?? "上传失败");
      router.push(`/contracts/${result.contractId}`);
    });
  }

  return <form className="card space-y-6 p-6" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
    <section className="space-y-3">
      <div><h2 className="text-sm font-semibold text-slate-800">合同主体</h2><p className="mt-1 text-xs text-slate-500">甲方使用系统维护的 Thraive 公司资料；乙方资料按签署原件填写。</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-slate-500">甲方公司名称<input className="input bg-slate-50" value={thraive.name} readOnly /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">甲方联系人<input className="input bg-slate-50" value={`${thraive.contact} · ${thraive.phone} · ${thraive.email}`} readOnly /></label>
      </div>
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">归档关联与乙方信息</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-slate-500">关联客户 *<select name="customerId" className="input" value={customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">请选择客户</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.brandName}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">乙方公司名称 *<input name="partyBCompany" className="input" value={partyBCompany} onChange={(event) => setPartyBCompany(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">乙方联系人 *<input name="partyBContact" className="input" value={partyBContact} onChange={(event) => setPartyBContact(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">电话 *<input name="partyBPhone" className="input" type="tel" value={partyBPhone} onChange={(event) => setPartyBPhone(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">邮箱 *<input name="partyBEmail" className="input" type="email" value={partyBEmail} onChange={(event) => setPartyBEmail(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">合同开始时间 *<input name="startDate" className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">合同截止时间 *<input name="endDate" className="input" type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-500">合同负责人 *<select name="ownerId" className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
    </section>

    <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div><h2 className="text-sm font-semibold text-slate-800">返佣分账规则</h2><p className="mt-1 text-xs text-slate-500">比例将直接用于渠道商对账，请按合同原件核对。</p></div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end"><div><p className="text-sm font-medium text-slate-700">固定月度服务费渠道合作费</p><p className="mt-1 text-xs text-slate-500">按品牌方已确认的月度服务费计算</p></div><label className="space-y-1 text-xs font-medium text-slate-500">乙方比例 *<div className="flex items-center gap-2"><input name="fixedFeeRate" className="input bg-white" type="number" min="0" max="100" step="0.01" value={fixedFeeRate} onChange={(event) => setFixedFeeRate(event.target.value)} /><span>%</span></div></label></div>
      <div className="border-t border-slate-200 pt-4"><p className="text-sm font-medium text-slate-700">联盟运营佣金渠道合作费</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-xs font-medium text-slate-500">佣金到账阈值（USD）<input className="input bg-white" value="4400" readOnly /></label><label className="space-y-1 text-xs font-medium text-slate-500">低于阈值的乙方比例<input className="input bg-white" value="15%" readOnly /></label><label className="space-y-1 text-xs font-medium text-slate-500">达到或超过阈值的乙方比例<input className="input bg-white" value="25%" readOnly /></label></div><p className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-slate-600">当前规则：低于 USD 4,400 按 15%；达到或超过 USD 4,400 按 25%。</p></div>
    </section>

    <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:border-brand-300"><Upload className="mb-3 h-7 w-7 text-slate-400" /><span className="text-sm font-medium text-slate-700">{file?.name ?? "点击上传已签署的渠道商返佣合同原件"}</span><span className="mt-1 text-xs text-slate-500">保存后直接标记为签署完成，并保留原件下载</span><input name="file" type="file" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
    {error ? <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    <div className="flex justify-end"><button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={pending}><FileUp className="h-4 w-4" />{pending ? "保存中..." : "保存并标记签署完成"}</button></div>
  </form>;
}
