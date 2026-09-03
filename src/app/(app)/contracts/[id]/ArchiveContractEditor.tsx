"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Pencil } from "lucide-react";
import { updateArchiveContract } from "@/actions/contracts";
import { Modal } from "@/components/ui/Modal";

type InitialValues = {
  startDate: string;
  endDate: string;
  partyBCompany?: string;
  partyBContact?: string;
  partyBPhone?: string;
  partyBEmail?: string;
  fixedFeeRate?: string;
};

export function ArchiveContractEditor({ contractId, type, initial }: {
  contractId: string;
  type: "CHANNEL" | "TRANSACTIONAL";
  initial: InitialValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uploadIntent, setUploadIntent] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function show(upload = false) {
    setError("");
    setUploadIntent(upload);
    setOpen(true);
  }

  function submit(formData: FormData) {
    setError("");
    formData.set("contractId", contractId);
    startTransition(async () => {
      const result = await updateArchiveContract(formData);
      if (!result.ok) return setError(result.error ?? "保存失败");
      setOpen(false);
      router.refresh();
    });
  }

  return <>
    <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => show(false)}>
      <Pencil className="h-4 w-4" /> 编辑合同
    </button>
    {type === "CHANNEL" ? <button type="button" className="btn-outline inline-flex items-center gap-1.5 text-sm" onClick={() => show(true)}>
      <FileUp className="h-4 w-4" /> 重新上传原件
    </button> : null}
    <Modal
      open={open}
      onClose={() => !pending && setOpen(false)}
      size="lg"
      title={type === "CHANNEL" ? "修改渠道商返佣合同" : "修改事务性合同"}
      description="签署完成后仍可修改；每次保存都必须填写修改原因，操作将留痕。"
    >
      <form action={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {type === "CHANNEL" ? <>
            <label className="space-y-1 text-sm font-medium text-slate-700">乙方公司名称 *<input name="partyBCompany" className="input" defaultValue={initial.partyBCompany} required /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700">乙方联系人 *<input name="partyBContact" className="input" defaultValue={initial.partyBContact} required /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700">电话 *<input name="partyBPhone" type="tel" className="input" defaultValue={initial.partyBPhone} required /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700">邮箱 *<input name="partyBEmail" type="email" className="input" defaultValue={initial.partyBEmail} required /></label>
          </> : null}
          <label className="space-y-1 text-sm font-medium text-slate-700">合同开始时间 *<input name="startDate" type="date" className="input" defaultValue={initial.startDate} required /></label>
          <label className="space-y-1 text-sm font-medium text-slate-700">合同截止时间 *<input name="endDate" type="date" className="input" defaultValue={initial.endDate} required /></label>
          {type === "CHANNEL" ? <label className="space-y-1 text-sm font-medium text-slate-700">固定月度服务费渠道合作费 · 乙方比例 *<div className="flex items-center gap-2"><input name="fixedFeeRate" type="number" min="0" max="100" step="0.01" className="input" defaultValue={initial.fixedFeeRate} required /><span>%</span></div></label> : null}
        </div>
        {type === "CHANNEL" ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-800">联盟运营佣金渠道合作费</p>
          <p className="mt-1 text-sm text-slate-600">低于 USD 4,400 按 15%；达到或超过 USD 4,400 按 25%。</p>
          <label className="mt-4 block space-y-2 text-sm font-medium text-slate-700">重新上传已签署原件（可选）
            <input name="file" type="file" className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm ${uploadIntent ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-200"}`} />
          </label>
        </div> : null}
        <label className="block space-y-1 text-sm font-medium text-slate-700">修改原因 *
          <textarea name="reason" className="input min-h-24 resize-y" maxLength={2000} placeholder="请说明本次修改或重新上传原件的原因" required />
        </label>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">保存失败：{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>取消</button>
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? "保存中..." : "保存修改"}</button>
        </div>
      </form>
    </Modal>
  </>;
}
