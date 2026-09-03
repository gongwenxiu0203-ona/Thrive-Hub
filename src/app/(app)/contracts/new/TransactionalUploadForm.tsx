"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { uploadTransactionalContract } from "@/actions/contracts";

export function TransactionalUploadForm({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!ownerId) {
      setError("请选择合同负责人");
      return;
    }
    if (!file) {
      setError("请选择事务性合同文件");
      return;
    }
    if (!startDate || !endDate) return setError("请填写合同开始时间和截止时间");
    if (startDate > endDate) return setError("合同截止时间不能早于开始时间");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("type", "TRANSACTIONAL");
      fd.append("ownerId", ownerId);
      fd.append("startDate", startDate);
      fd.append("endDate", endDate);
      fd.append("file", file);
      const result = await uploadTransactionalContract(fd);
      if (!result.ok || !result.contractId) {
        setError(result.error ?? "上传失败");
        return;
      }
      router.push(`/contracts/${result.contractId}`);
    });
  }

  return (
    <div className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">合同开始时间 *</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">合同截止时间 *</label>
          <input className="input" type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <label className="flex min-h-[168px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center hover:border-brand-300 hover:bg-brand-50/30">
        <Upload className="mb-3 h-7 w-7 text-slate-300" />
        <span className="text-sm font-medium text-slate-700">
          {file ? file.name : "点击上传事务性合同文件"}
        </span>
        <span className="mt-1 text-xs text-slate-400">支持 PDF / Word / Excel / 图片 / 压缩包等附件格式</span>
        <input
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5 text-sm"
          disabled={pending}
          onClick={submit}
        >
          <FileUp className="h-4 w-4" />
          {pending ? "上传中..." : "上传事务性合同"}
        </button>
      </div>
    </div>
  );
}
