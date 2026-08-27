"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, PencilLine } from "lucide-react";
import { addContractAddendum, updateContractNumber } from "@/actions/contracts";

export function ContractNumberEditor({ contractId, contractNo }: { contractId: string; contractNo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(contractNo);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => setOpen((v) => !v)}>
        <PencilLine className="h-4 w-4" />修改合同编号
      </button>
      {open && <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">新合同编号<input className="input mt-1" value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label className="text-xs font-medium text-slate-600">修改原因 *<input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="必填并写入审计记录" /></label>
        {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>取消</button>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => startTransition(async () => {
            const result = await updateContractNumber(contractId, number, reason);
            if (!result.ok) return setError(result.error ?? "修改失败");
            setOpen(false); setReason(""); router.refresh();
          })}>{pending ? "保存中..." : "保存编号"}</button>
        </div>
      </div>}
    </div>
  );
}

export function AddendumForm({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div>
    <button type="button" className="btn-primary inline-flex items-center gap-1.5 text-sm" onClick={() => setOpen((v) => !v)}>
      <FilePlus2 className="h-4 w-4" />追加附加条款
    </button>
    {open && <form className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2" action={(fd) => startTransition(async () => {
      fd.set("contractId", contractId);
      const result = await addContractAddendum(fd);
      if (!result.ok) return setError(result.error ?? "保存失败");
      setOpen(false); setError(""); router.refresh();
    })}>
      <label className="text-xs font-medium text-slate-600">条款标题 *<input name="title" className="input mt-1" required /></label>
      <label className="text-xs font-medium text-slate-600">生效日期<input name="effectiveAt" type="date" className="input mt-1" /></label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">条款内容<textarea name="terms" className="input mt-1 min-h-24" /></label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">补充合同文件<input name="file" type="file" className="input mt-1" /></label>
      {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>取消</button><button className="btn-primary" disabled={pending}>{pending ? "保存中..." : "保存附加条款"}</button></div>
    </form>}
  </div>;
}
