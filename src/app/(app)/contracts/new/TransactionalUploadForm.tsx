"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { uploadTransactionalContract } from "@/actions/contracts";
import { CONTRACT_TYPE_LABELS } from "@/lib/constants";

export function TransactionalUploadForm({
  users,
  currentUserId,
}: {
  users: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(currentUserId);
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
    startTransition(async () => {
      const fd = new FormData();
      fd.append("type", "TRANSACTIONAL");
      fd.append("ownerId", ownerId);
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
          <label className="mb-1 block text-xs font-medium text-slate-500">合同类型</label>
          <select className="input" value="TRANSACTIONAL" disabled>
            <option value="TRANSACTIONAL">{CONTRACT_TYPE_LABELS.TRANSACTIONAL}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">合同负责人</label>
          <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">请选择</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
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
