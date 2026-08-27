"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { uploadChannelContract } from "@/actions/contracts";

type CustomerOption = {
  id: string;
  brandName: string;
  channelAccount?: { id: string; name: string; email: string } | null;
};

export function ChannelUploadForm({ customers, users, currentUserId, presetCustomerId }: {
  customers: CustomerOption[];
  users: { id: string; name: string }[];
  currentUserId: string;
  presetCustomerId?: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedCustomer = customers.find((item) => item.id === customerId);

  function submit() {
    setError(null);
    if (!customerId) return setError("请选择关联客户");
    if (!ownerId) return setError("请选择合同负责人");
    if (!file) return setError("请选择渠道商返佣合同文件");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("customerId", customerId);
      fd.append("ownerId", ownerId);
      fd.append("file", file);
      const result = await uploadChannelContract(fd);
      if (!result.ok || !result.contractId) return setError(result.error ?? "上传失败");
      router.push(`/contracts/${result.contractId}`);
    });
  }

  return <div className="card space-y-5 p-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-xs font-medium text-slate-500">关联客户 *
        <select className="input" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">请选择客户</option>
          {customers.map((item) => <option key={item.id} value={item.id}>{item.brandName}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium text-slate-500">渠道商
        <input className="input bg-slate-50" value={selectedCustomer?.channelAccount?.name ?? ""} placeholder={customerId ? "该客户尚未关联渠道商账户" : "选择客户后自动带出"} readOnly />
        {selectedCustomer?.channelAccount?.email ? <span className="block truncate text-[11px] font-normal text-slate-400">账户：{selectedCustomer.channelAccount.email}</span> : null}
      </label>
      <label className="space-y-1 text-xs font-medium text-slate-500">合同类型
        <select className="input" value="CHANNEL" disabled><option value="CHANNEL">渠道商返佣合同</option></select>
      </label>
      <label className="space-y-1 text-xs font-medium text-slate-500">合同负责人 *
        <select className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          {users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </div>
    <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:border-brand-300">
      <Upload className="mb-3 h-7 w-7 text-slate-400" />
      <span className="text-sm font-medium text-slate-700">{file?.name ?? "点击上传渠道商返佣合同文件"}</span>
      <span className="mt-1 text-xs text-slate-400">仅存档，不进行字段识别</span>
      <input type="file" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    </label>
    {error ? <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
    <div className="flex justify-end"><button type="button" className="btn-primary inline-flex items-center gap-2" disabled={pending} onClick={submit}><FileUp className="h-4 w-4" />{pending ? "上传中..." : "上传并归档"}</button></div>
  </div>;
}
