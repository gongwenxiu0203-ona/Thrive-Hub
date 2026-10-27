"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, FileSignature, Trash2 } from "lucide-react";
import {
  finalizeReview,
  markCompleted,
  deleteContract,
  terminateContract,
  initializeLegacyBillingUnits,
  terminateContractParts,
} from "@/actions/contracts";
import { Modal } from "@/components/ui/Modal";

type LegacyUnit = { id: string; title: string; kind: string; status: string; version: number; startDate: string; endDate: string; terminatedAt: string | null; reconciliationCount: number };
type Confirmation = { id: string; number: string; version: number };

export function ContractActions({
  contractId,
  status,
  isAdmin,
  canTerminatePartial,
  canInitializeLegacy,
  legacyUnits,
  evidenceOptions,
  confirmations,
}: {
  contractId: string;
  status: string;
  isAdmin: boolean;
  canTerminatePartial: boolean;
  canInitializeLegacy: boolean;
  legacyUnits: LegacyUnit[];
  evidenceOptions: { id: string; title: string }[];
  confirmations: Confirmation[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminationDate, setTerminationDate] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [terminationMode, setTerminationMode] = useState<"whole" | "partial">(isAdmin ? "whole" : "partial");
  const [selectedLegacyIds, setSelectedLegacyIds] = useState<string[]>([]);
  const [selectedConfirmationIds, setSelectedConfirmationIds] = useState<string[]>([]);
  const [evidenceAddendumId, setEvidenceAddendumId] = useState("");
  const router = useRouter();
  const activeLegacyUnits = legacyUnits.filter((unit) => unit.status === "ACTIVE");
  const selectedLegacyUnits = activeLegacyUnits.filter((unit) => selectedLegacyIds.includes(unit.id));
  const selectedConfirmations = confirmations.filter((item) => selectedConfirmationIds.includes(item.id));

  async function initializeLegacy() {
    if (!window.confirm("请核对签署原件：旧合同的原有收费条款是否只对应一项合作（可同时包含固费和佣金）？如果有多个同类独立项目，请先人工拆分范围。确认初始化？")) return;
    setError(null);
    startTransition(async () => {
      try { await initializeLegacyBillingUnits(contractId); router.refresh(); }
      catch (issue) { setError(issue instanceof Error ? issue.message : "初始化失败"); }
    });
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}

      {/* "提交审核" 已迁移到 ContractWorkflowPanel（支持沿用/上传新版双路径） */}
      {isAdmin && status === "REVIEWING" && (
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() => run(() => finalizeReview(contractId))}
        >
          <CheckCircle2 className="h-4 w-4" /> 完成审核
        </button>
      )}
      {status === "SIGNING" && (
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() => run(() => markCompleted(contractId))}
        >
          <FileSignature className="h-4 w-4" /> 标记签署完成
        </button>
      )}
      {(isAdmin || canTerminatePartial) && status !== "TERMINATED" && (
        <button
          className="btn-secondary border-amber-300 text-amber-700 hover:bg-amber-50"
          disabled={pending}
          onClick={() => setShowTerminate(true)}
        >
          <Ban className="h-4 w-4" /> 终止合同或合作项目
        </button>
      )}
      {isAdmin && (
        <button
          className="btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm("确认删除该合同？此操作不可撤销。")) {
              run(() => deleteContract(contractId));
            }
          }}
        >
          <Trash2 className="h-4 w-4" /> 删除
        </button>
      )}
      {showTerminate && (
        <Modal
          open
          onClose={() => !pending && setShowTerminate(false)}
          title="选择终止范围"
          description="整份合同终止会停止全部计费项目及确认书；部分终止可同时选择原合同计费项目和项目确认书。已有财务历史若受影响，系统会阻止操作。"
          size="lg"
          closeOnBackdrop={!pending}
          closeOnEscape={!pending}
        >
          <div className="space-y-4">
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="label mb-2">终止范围 <span className="text-rose-600">*</span></legend>
              {isAdmin && <label className={`rounded-lg border p-3 text-sm ${terminationMode === "whole" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`}>
                <input type="radio" name="terminationMode" className="mr-2 accent-purple-600" checked={terminationMode === "whole"} onChange={() => setTerminationMode("whole")} />整份合同
              </label>}
              {canTerminatePartial && <label className={`rounded-lg border p-3 text-sm ${terminationMode === "partial" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`}>
                <input type="radio" name="terminationMode" className="mr-2 accent-purple-600" checked={terminationMode === "partial"} onChange={() => setTerminationMode("partial")} />仅终止所选部分
              </label>}
            </fieldset>
            {terminationMode === "whole" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">整份合同及其全部计费项目、确认书会停止后续计费。此操作仅管理员可执行。</p>}
            {terminationMode === "partial" && <div className="space-y-3">
              {canInitializeLegacy && <><h3 className="text-sm font-medium text-slate-900">原合同计费项目</h3>
              {!legacyUnits.length ? <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p>尚未建立原合同计费项目。请先核对签署原件，再显式初始化；不会删除已有对账。</p>
                <button type="button" className="btn-secondary mt-2" disabled={pending} onClick={initializeLegacy}>核对并初始化计费项目</button>
              </div> : <div className="max-h-56 space-y-2 overflow-y-auto">
                {legacyUnits.map((unit) => <label key={unit.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input type="checkbox" className="mt-1 accent-purple-600" aria-label={`选择终止${unit.title}`} disabled={pending || unit.status !== "ACTIVE"}
                    checked={selectedLegacyIds.includes(unit.id)} onChange={(event) => setSelectedLegacyIds((ids) => event.target.checked ? [...ids, unit.id] : ids.filter((id) => id !== unit.id))} />
                  <span className="min-w-0 flex-1"><span className="font-medium">{unit.title}</span><span className="ml-2 text-slate-500">{unit.kind === "FEE_ONLY" ? "固费" : "佣金"} · {unit.status === "ACTIVE" ? "生效中" : "已终止"}</span>
                    <span className="mt-1 block text-slate-600">{unit.startDate} — {unit.endDate} · 关联对账 {unit.reconciliationCount} 条{unit.terminatedAt ? ` · 终止日 ${unit.terminatedAt}` : ""}</span></span>
                </label>)}
              </div>}
              {activeLegacyUnits.length > 1 && <p className="text-xs text-slate-600">若要终止旧合同中整个合作项目，请同时勾选固费与佣金；只选一项，另一项仍会继续计费。</p>}</>}
              {confirmations.length > 0 && <div className="space-y-2 border-t border-slate-200 pt-3">
                <h3 className="text-sm font-medium text-slate-900">项目确认书（可与原合同计费项目一同选择）</h3>
                {confirmations.map((item) => <label key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input type="checkbox" className="accent-purple-600" disabled={pending} checked={selectedConfirmationIds.includes(item.id)} onChange={(event) => setSelectedConfirmationIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
                  <span>{item.number}</span>
                </label>)}
              </div>}
              <label className="block space-y-1 text-sm"><span>已上传的终止协议或补充文件（可选）</span>
                <select className="input w-full" value={evidenceAddendumId} onChange={(event) => setEvidenceAddendumId(event.target.value)}>
                  <option value="">没有附件 / 不选择</option>{evidenceOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
            </div>}
            <div>
              <label className="label">终止日期 <span className="text-rose-600">*</span></label>
              <input
                type="date"
                className="input"
                value={terminationDate}
                onChange={(event) => setTerminationDate(event.target.value)}
              />
            </div>
            <div>
              <label className="label">终止原因 <span className="text-rose-600">*</span></label>
              <textarea
                className="input resize-none"
                rows={3}
                value={terminationReason}
                onChange={(event) => setTerminationReason(event.target.value)}
                placeholder="说明终止原因及依据"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" disabled={pending} onClick={() => setShowTerminate(false)}>
                取消
              </button>
              <button
                className="btn-primary bg-amber-600 hover:bg-amber-700"
                disabled={pending || !terminationDate || !terminationReason.trim()
                  || (terminationMode === "partial" && !selectedLegacyUnits.length && !selectedConfirmations.length)}
                onClick={() =>
                  run(async () => {
                    if (terminationMode === "whole") {
                      await terminateContract(contractId, terminationDate, terminationReason);
                    } else {
                      await terminateContractParts(contractId,
                        selectedLegacyUnits.map((unit) => unit.id), selectedConfirmations.map((item) => item.id),
                        terminationDate, terminationReason,
                        Object.fromEntries(selectedLegacyUnits.map((unit) => [unit.id, unit.version])),
                        Object.fromEntries(selectedConfirmations.map((item) => [item.id, item.version])),
                        evidenceAddendumId || undefined);
                    }
                    setShowTerminate(false);
                  })
                }
              >
                {pending ? "处理中…" : "确认终止"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
