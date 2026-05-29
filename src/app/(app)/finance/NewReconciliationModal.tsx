"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TYPE_LABELS } from "@/lib/constants";
import { setupFinanceCustomerOwner } from "@/actions/customers";

type Contract = {
  id: string;
  contractNo: string;
  type: string;
};

type Customer = {
  id: string;
  brandName: string;
  businessOwnerId: string | null;
  contactPhone: string | null;
  contracts: Contract[];
};

type User = { id: string; name: string; email: string | null };

type Props = {
  customers: Customer[];
  users: User[];
  currentUserId: string;
  onCreated: () => void;
};

export function NewReconciliationModal({
  customers,
  users,
  currentUserId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedOwner = users.find((u) => u.id === ownerId);

  function handleCustomerChange(id: string) {
    setSelectedCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust?.contracts.length === 1) {
      setSelectedContractId(cust.contracts[0].id);
    } else {
      setSelectedContractId("");
    }
    // 预填客户已有的负责人和电话
    if (cust?.businessOwnerId) setOwnerId(cust.businessOwnerId);
    else setOwnerId(currentUserId);
    setContactPhone(cust?.contactPhone ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId || !selectedContractId) return;

    setLoading(true);
    try {
      const result = await setupFinanceCustomerOwner(
        selectedCustomerId,
        ownerId,
        contactPhone,
      );
      if (!result.ok) {
        alert(result.error ?? "保存失败");
        return;
      }
      setOpen(false);
      resetForm();
      router.push(
        `/finance/customers/${selectedCustomerId}?contractId=${selectedContractId}`,
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSelectedCustomerId("");
    setSelectedContractId("");
    setOwnerId(currentUserId);
    setContactPhone("");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + 新建对账
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            新建客户对账
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            仅需选择客户、合同和负责人，详情页将展示合同已确认字段
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* 客户选择 */}
          <div>
            <label className="label">客户 *</label>
            <select
              className="input"
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              required
            >
              <option value="">请选择客户</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              仅显示已签署完成合同的客户
            </p>
          </div>

          {/* 合同选择 */}
          {selectedCustomer && (
            <div>
              <label className="label">关联合同 *</label>
              <select
                className="input"
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                required
              >
                <option value="">请选择合同</option>
                {selectedCustomer.contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNo}（
                    {CONTRACT_TYPE_LABELS[c.type] ?? c.type}）
                  </option>
                ))}
              </select>
              {selectedCustomer.contracts.length === 0 && (
                <p className="mt-1 text-xs text-rose-500">
                  该客户暂无已签署完成的合同
                </p>
              )}
            </div>
          )}

          {/* 负责人 */}
          <div>
            <label className="label">负责人 *</label>
            <select
              className="input"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              required
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              默认为当前用户，可选择其他用户作为负责人
            </p>
          </div>

          {/* 负责人邮箱（自动关联，只读） */}
          <div>
            <label className="label">负责人邮箱</label>
            <input
              className="input bg-slate-50 text-slate-600"
              value={selectedOwner?.email ?? ""}
              readOnly
              placeholder="—"
            />
          </div>

          {/* 联系电话（选填） */}
          <div>
            <label className="label">联系电话（选填）</label>
            <input
              className="input"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="如 13800138000"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={
                loading || !selectedCustomerId || !selectedContractId
              }
              className="btn-primary"
            >
              {loading ? "创建中…" : "进入对账详情"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
