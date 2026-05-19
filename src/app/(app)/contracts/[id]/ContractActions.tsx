"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, FileSignature, Trash2 } from "lucide-react";
import {
  submitForReview,
  finalizeReview,
  markCompleted,
  deleteContract,
} from "@/actions/contracts";

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

      {status === "IN_PROGRESS" && (
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() => run(() => submitForReview(contractId))}
        >
          <Send className="h-4 w-4" /> 提交审核
        </button>
      )}
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
    </div>
  );
}
