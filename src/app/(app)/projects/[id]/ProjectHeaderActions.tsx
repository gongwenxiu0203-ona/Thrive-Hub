"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { updateProjectStatus, softDeleteProject, updateProjectBasicInfo } from "@/actions/projects";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "进行中" },
  { value: "PAUSED", label: "已暂停" },
  { value: "DONE", label: "已完成" },
  { value: "CANCELLED", label: "已终止" },
];

type CustomerOption = { id: string; brandName: string };
type ContractOption = { id: string; contractNo: string; customerId: string };
type UserOption = { id: string; name: string };

export function ProjectHeaderActions({
  projectId,
  status,
  type,
  name,
  customerId,
  contractId,
  ownerId,
  customers,
  contracts,
  users,
}: {
  projectId: string;
  status: string;
  type: string;
  name: string;
  customerId: string | null;
  contractId: string | null;
  ownerId: string | null;
  customers: CustomerOption[];
  contracts: ContractOption[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function onStatusChange(next: string) {
    startTransition(async () => {
      await updateProjectStatus(projectId, next);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("确认删除该项目？删除后进入回收站，7 天内可恢复。")) return;
    startTransition(async () => {
      await softDeleteProject(projectId);
      router.push("/projects");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded-lg border-0 bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm [&>option]:text-slate-800"
        value={status}
        disabled={pending}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        onClick={() => setEditing(true)}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/30"
      >
        <Edit3 className="h-4 w-4" /> 编辑
      </button>
      <button
        onClick={onDelete}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-rose-500/80"
      >
        <Trash2 className="h-4 w-4" /> 删除
      </button>
      {editing && (
        <ProjectBasicEditModal
          projectId={projectId}
          type={type}
          name={name}
          customerId={customerId}
          contractId={contractId}
          ownerId={ownerId}
          customers={customers}
          contracts={contracts}
          users={users}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function ProjectBasicEditModal({
  projectId,
  type,
  name,
  customerId,
  contractId,
  ownerId,
  customers,
  contracts,
  users,
  onClose,
}: {
  projectId: string;
  type: string;
  name: string;
  customerId: string | null;
  contractId: string | null;
  ownerId: string | null;
  customers: CustomerOption[];
  contracts: ContractOption[];
  users: UserOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftCustomerId, setDraftCustomerId] = useState(customerId ?? "");
  const [draftContractId, setDraftContractId] = useState(contractId ?? "");
  const [draftOwnerId, setDraftOwnerId] = useState(ownerId ?? "");
  const isIntegrated = type === "INTEGRATED";
  const customerContracts = contracts.filter((c) => c.customerId === draftCustomerId);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateProjectBasicInfo({
        projectId,
        name: draftName,
        customerId: draftCustomerId || null,
        contractId: isIntegrated ? draftContractId || null : undefined,
        ownerId: isIntegrated ? draftOwnerId || null : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "保存失败");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="编辑项目基本信息">
      <div className="space-y-4">
          <div>
            <label className="label">项目名称 *</label>
            <input className="input" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          </div>
          <div>
            <label className="label">关联客户</label>
            <select
              className="input"
              value={draftCustomerId}
              onChange={(e) => {
                setDraftCustomerId(e.target.value);
                setDraftContractId("");
              }}
            >
              <option value="">不关联客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.brandName}</option>
              ))}
            </select>
          </div>
          {isIntegrated && (
            <>
              <div>
                <label className="label">关联合同</label>
                {!draftCustomerId ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400">请先选择客户</p>
                ) : customerContracts.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    该客户暂无可关联的已完成合同
                  </p>
                ) : (
                  <select className="input" value={draftContractId} onChange={(e) => setDraftContractId(e.target.value)}>
                    <option value="">不关联合同</option>
                    {customerContracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>{contract.contractNo}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="label">Strategy AM</label>
                <select className="input" value={draftOwnerId} onChange={(e) => setDraftOwnerId(e.target.value)}>
                  <option value="">未指定</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button type="button" onClick={submit} disabled={pending} className="btn-primary text-sm">
              {pending ? "保存中..." : "保存修改"}
            </button>
          </div>
      </div>
    </Modal>
  );
}
