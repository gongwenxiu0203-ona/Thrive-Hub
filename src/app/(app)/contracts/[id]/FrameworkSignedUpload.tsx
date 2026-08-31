"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function FrameworkSignedUpload({ contractId, expectedUpdatedAt, canSign, signed, confirmations = [] }: { contractId: string; expectedUpdatedAt: string; canSign: boolean; signed: boolean; confirmations?: Array<{ id: string; number: string; status: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (signed) return <a className="btn-secondary inline-flex" href={`/api/contracts/${contractId}/framework-signed`}>下载盖章完整版（主合同 + 确认书）</a>;
  if (!canSign) return <p className="text-sm text-slate-600">主合同尚未签署完成，请联系有编辑权限的人员上传双方盖章版。</p>;
  return <form className="space-y-4" onSubmit={async e => {
    e.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(e.currentTarget); form.set("expectedUpdatedAt", expectedUpdatedAt);
    try {
      const response = await fetch(`/api/contracts/${contractId}/framework-signed`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "上传失败");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "上传失败，请重试"); }
    finally { setBusy(false); }
  }}>
    <p className="text-sm text-slate-600">不需要重复填写字段。如需调整，请先编辑页面中已保存的主合同或确认书；确认无误后上传一份双方盖章完整版，系统会同时归档主合同与下方所选确认书。</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm"><span>盖章完整版（主合同 + 确认书）*</span><input name="file" type="file" accept=".pdf,.doc,.docx" required disabled={busy} className="input" /></label>
      <label className="space-y-2 text-sm"><span>归档说明 *</span><input name="reason" required maxLength={2000} disabled={busy} className="input" placeholder="填写签署及归档说明" /></label>
    </div>
    {confirmations.length > 0 && <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-800">该盖章文件包含的项目确认书</legend><p className="text-xs text-slate-500">仅选择确实包含在本次完整版中的确认书；归档后仍需逐份确认生效并生成独立对账。</p><div className="flex flex-wrap gap-2">{confirmations.map(row => <label key={row.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" name="confirmationIds" value={row.id} defaultChecked={confirmations.length === 1} disabled={busy || row.status !== "DRAFT"} />{row.number}{row.status !== "DRAFT" ? "（已生效）" : ""}</label>)}</div></fieldset>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="signedConfirmed" value="true" required disabled={busy} className="mt-1" />确认该文件为双方已签字/盖章的完整合同原件，并且包含上方勾选的项目确认书</label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy} className="btn-primary">{busy ? "正在归档…" : "上传盖章版并完成主合同签署"}</button>
  </form>;
}
