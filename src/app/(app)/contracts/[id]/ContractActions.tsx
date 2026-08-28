"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, FileSignature, Trash2 } from "lucide-react";
import {
  finalizeReview,
  markCompleted,
  deleteContract,
  terminateContract,
} from "@/actions/contracts";
import { Modal } from "@/components/ui/Modal";

export function ContractActions({
  contractId,
  status,
  isAdmin,
}: {
  contractId: string;
  status: string;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminationDate, setTerminationDate] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const router = useRouter();

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
      {isAdmin && status !== "TERMINATED" && (
        <button
          className="btn-secondary border-amber-300 text-amber-700 hover:bg-amber-50"
          disabled={pending}
          onClick={() => setShowTerminate(true)}
        >
          <Ban className="h-4 w-4" /> 终止合同
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
          title="终止合同"
          description="终止后将截短当前对账期、作废终止日之后的对账计划；已有财务历史不会删除。"
          size="sm"
          closeOnBackdrop={!pending}
          closeOnEscape={!pending}
        >
          <div className="space-y-4">
            <div>
              <label className="label">合同终止日期 <span className="text-rose-600">*</span></label>
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
                placeholder="说明合同终止原因"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" disabled={pending} onClick={() => setShowTerminate(false)}>
                取消
              </button>
              <button
                className="btn-primary bg-amber-600 hover:bg-amber-700"
                disabled={pending || !terminationDate || !terminationReason.trim()}
                onClick={() =>
                  run(async () => {
                    await terminateContract(contractId, terminationDate, terminationReason);
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
