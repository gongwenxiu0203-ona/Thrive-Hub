"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ShareIntakeButton } from "@/components/ShareIntakeButton";
import { bulkUpdateCustomers } from "@/actions/customers";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  RATING_LABELS,
  RATING_COLORS,
  PROMO_PLATFORMS,
  labelOf,
} from "@/lib/constants";

type UserOption = { id: string; name: string };

export type CustomerTableRow = {
  id: string;
  brandName: string;
  category: string | null;
  mainSites: string[];
  targetPlatforms: string[];
  status: string;
  rating: string;
  businessOwnerId: string | null;
  businessOwnerName: string | null;
  backendOwnerId: string | null;
  backendOwnerName: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  latestContractId: string | null;
  latestContractNo: string | null;
  latestContractStatus: string | null;
  latestContractLabel: string;
};

type SortKey = "updatedDesc" | "rating" | "createdDesc" | "createdAsc" | "contract";
type BulkField = "status" | "rating" | "targetPlatforms" | "businessOwnerId" | "backendOwnerId";

const RATING_RANK: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, PENDING: 4 };

export function CustomerTableClient({
  rows,
  users,
  isStaff,
  isChannel,
  staffUserId,
  channelUserId,
}: {
  rows: CustomerTableRow[];
  users: UserOption[];
  isStaff: boolean;
  isChannel: boolean;
  staffUserId?: string;
  channelUserId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("updatedDesc");
  const [bulkField, setBulkField] = useState<BulkField>("status");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkPlatforms, setBulkPlatforms] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      if (sort === "rating") {
        return (RATING_RANK[a.rating] ?? 99) - (RATING_RANK[b.rating] ?? 99);
      }
      if (sort === "createdAsc") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "createdDesc") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "contract") return a.latestContractLabel.localeCompare(b.latestContractLabel);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return next;
  }, [rows, sort]);

  const allChecked = sortedRows.length > 0 && sortedRows.every((r) => selected.has(r.id));
  const selectedIds = [...selected];

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(sortedRows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submitBulk() {
    setMessage(null);
    if (selectedIds.length === 0) {
      setMessage("请先选择客户");
      return;
    }
    const patch: Parameters<typeof bulkUpdateCustomers>[1] = {};
    if (bulkField === "targetPlatforms") {
      patch.targetPlatforms = [...bulkPlatforms];
    } else {
      if (!bulkValue && (bulkField === "status" || bulkField === "rating")) {
        setMessage("请选择要修改的值");
        return;
      }
      patch[bulkField] = bulkValue || null;
    }

    startTransition(async () => {
      const result = await bulkUpdateCustomers(selectedIds, patch);
      if (!result.ok) {
        setMessage(result.error ?? "批量修改失败");
        return;
      }
      setSelected(new Set());
      setMessage(`已批量修改 ${selectedIds.length} 个客户`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="label text-xs">排序</label>
          <select className="input h-9 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updatedDesc">最近更新</option>
            <option value="rating">按评级</option>
            <option value="createdDesc">开展时间：新到旧</option>
            <option value="createdAsc">开展时间：旧到新</option>
            <option value="contract">按合同进度</option>
          </select>
        </div>

        {isStaff && (
          <>
            <div>
              <label className="label text-xs">批量字段</label>
              <select
                className="input h-9 text-sm"
                value={bulkField}
                onChange={(e) => {
                  setBulkField(e.target.value as BulkField);
                  setBulkValue("");
                }}
              >
                <option value="status">当前进度</option>
                <option value="rating">客户评级</option>
                <option value="targetPlatforms">目标推广平台</option>
                <option value="businessOwnerId">商务负责人</option>
                <option value="backendOwnerId">后端负责人</option>
              </select>
            </div>

            {bulkField === "targetPlatforms" ? (
              <div className="min-w-[20rem]">
                <label className="label text-xs">平台</label>
                <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 px-2 py-1.5">
                  {PROMO_PLATFORMS.map((p) => (
                    <label key={p} className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={bulkPlatforms.has(p)}
                        onChange={(e) => {
                          setBulkPlatforms((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p);
                            else next.delete(p);
                            return next;
                          });
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="label text-xs">批量修改为</label>
                <select className="input h-9 text-sm" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                  {(bulkField === "businessOwnerId" || bulkField === "backendOwnerId") && <option value="">未分配</option>}
                  {bulkField === "status" &&
                    Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  {bulkField === "rating" &&
                    Object.entries(RATING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  {(bulkField === "businessOwnerId" || bulkField === "backendOwnerId") &&
                    users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}

            <button className="btn-primary h-9" disabled={pending || selectedIds.length === 0} onClick={submitBulk}>
              批量修改（{selectedIds.length}）
            </button>
          </>
        )}
        {message && <p className="text-xs text-slate-500">{message}</p>}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {isStaff && (
                <th className="w-10">
                  <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
                </th>
              )}
              <th>品牌/店铺名称</th>
              <th>品类</th>
              <th>主营站点</th>
              <th>当前平台</th>
              <th>合同进度</th>
              <th>当前进度</th>
              <th>评级</th>
              <th>商务负责人</th>
              <th>后端负责人</th>
              <th>来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((c) => (
              <tr key={c.id}>
                {isStaff && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => toggleOne(c.id, e.target.checked)}
                    />
                  </td>
                )}
                <td>
                  <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.brandName}
                  </Link>
                </td>
                <td>{c.category ?? "-"}</td>
                <td>
                  <span className="text-xs text-slate-500">{c.mainSites.join(" / ") || "-"}</span>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {c.targetPlatforms.map((p) => (
                      <Badge key={p} className="bg-slate-100 text-slate-600">{p}</Badge>
                    ))}
                    {c.targetPlatforms.length === 0 && "-"}
                  </div>
                </td>
                <td>
                  {c.latestContractId ? (
                    <Link href={`/contracts/${c.latestContractId}`} className="text-brand-700 hover:underline">
                      {c.latestContractLabel}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <Badge className={CUSTOMER_STATUS_COLORS[c.status]}>
                    {labelOf(CUSTOMER_STATUS_LABELS, c.status)}
                  </Badge>
                </td>
                <td>
                  <Badge className={RATING_COLORS[c.rating]}>
                    {labelOf(RATING_LABELS, c.rating)}
                  </Badge>
                </td>
                <td>{c.businessOwnerName ?? "-"}</td>
                <td>{c.backendOwnerName ?? "-"}</td>
                <td>
                  <span className="text-xs text-slate-500">{c.source === "INTAKE" ? "客户门户" : "内部录入"}</span>
                </td>
                <td>
                  <ShareIntakeButton
                    customerId={c.id}
                    brandName={c.brandName}
                    channelUserId={isChannel ? channelUserId : undefined}
                    staffUserId={isStaff ? staffUserId : undefined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
