"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import { LayoutList, KanbanSquare, Users as UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import AffiliateFormModalImpl from "./AffiliateFormModal";
import {
  AFFILIATE_SOURCE_OPTIONS,
  AFFILIATE_TYPE_OPTIONS,
  AFFILIATE_DEV_STATUS_OPTIONS,
  AFFILIATE_DEV_STATUS_COLORS,
  labelOf,
} from "@/lib/constants";
import { parseJsonArray, formatNumber, cn } from "@/lib/utils";

type Option = { id: string; name: string };
type AffiliateData = {
  id: string;
  platformName: string;
  internalName: string | null;
  source: string;
  type: string;
  category: string | null;
  followers: number | null;
  devStatus: string;
  tags: string;
};
type Affiliate = AffiliateData & { ownerName: string | null };

const optionLabels = (values: readonly string[]): Record<string, string> =>
  Object.fromEntries(values.map((value) => [value, value]));
const AFFILIATE_SOURCE_LABELS = optionLabels(AFFILIATE_SOURCE_OPTIONS);
const AFFILIATE_TYPE_LABELS = optionLabels(AFFILIATE_TYPE_OPTIONS);
const AFFILIATE_STATUS_LABELS = optionLabels(AFFILIATE_DEV_STATUS_OPTIONS);
const AFFILIATE_STATUS_COLORS = AFFILIATE_DEV_STATUS_COLORS;

// Legacy view adapter. This file is not mounted by the current affiliate
// dashboard; retain its historical call shape without changing the live form.
const AffiliateFormModal = AffiliateFormModalImpl as unknown as ComponentType<{
  users: Option[];
  affiliate: Affiliate;
  trigger: "edit";
}>;

const STATUS_ORDER = ["TO_DEVELOP", "COMMUNICATING", "COOPERATING", "PAUSED"];

function TagList({ tags }: { tags: string }) {
  const arr = parseJsonArray(tags);
  if (arr.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {arr.map((t) => (
        <Badge key={t} className="bg-slate-100 text-slate-600">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function ListView({
  affiliates,
  users,
}: {
  affiliates: Affiliate[];
  users: Option[];
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>平台联盟商名称</th>
            <th>内部名称</th>
            <th>来源</th>
            <th>类型</th>
            <th>类目</th>
            <th>粉丝数</th>
            <th>开发状态</th>
            <th>负责人</th>
            <th>标签</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {affiliates.map((a) => (
            <tr key={a.id}>
              <td className="font-medium text-slate-700">{a.platformName}</td>
              <td>{a.internalName ?? "—"}</td>
              <td>{labelOf(AFFILIATE_SOURCE_LABELS, a.source)}</td>
              <td>{labelOf(AFFILIATE_TYPE_LABELS, a.type)}</td>
              <td>{a.category ?? "—"}</td>
              <td>{formatNumber(a.followers)}</td>
              <td>
                <Badge className={AFFILIATE_STATUS_COLORS[a.devStatus]}>
                  {labelOf(AFFILIATE_STATUS_LABELS, a.devStatus)}
                </Badge>
              </td>
              <td>{a.ownerName ?? "—"}</td>
              <td>
                <TagList tags={a.tags} />
              </td>
              <td>
                <AffiliateFormModal
                  users={users}
                  affiliate={a}
                  trigger="edit"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanView({
  affiliates,
  users,
}: {
  affiliates: Affiliate[];
  users: Option[];
}) {
  const grouped: Record<string, Affiliate[]> = {};
  for (const s of STATUS_ORDER) grouped[s] = [];
  for (const a of affiliates) (grouped[a.devStatus] ??= []).push(a);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="flex w-72 shrink-0 flex-col">
          <div className="mb-3 flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
            <span className="text-sm font-semibold text-slate-700">
              {labelOf(AFFILIATE_STATUS_LABELS, status)}
            </span>
            <span className="badge bg-slate-100 text-slate-500">
              {grouped[status]?.length ?? 0}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 rounded-lg bg-slate-100/60 p-2">
            {(grouped[status] ?? []).map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">
                    {a.platformName}
                  </p>
                  <AffiliateFormModal
                    users={users}
                    affiliate={a}
                    trigger="edit"
                  />
                </div>
                {a.internalName && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {a.internalName}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge className="bg-slate-100 text-slate-600">
                    {labelOf(AFFILIATE_TYPE_LABELS, a.type)}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-600">
                    {labelOf(AFFILIATE_SOURCE_LABELS, a.source)}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{formatNumber(a.followers)} 粉丝</span>
                  <span className="flex items-center gap-1">
                    <UsersIcon className="h-3 w-3" />
                    {a.ownerName ?? "未分配"}
                  </span>
                </div>
              </div>
            ))}
            {(grouped[status]?.length ?? 0) === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                暂无
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AffiliateViews({
  affiliates,
  users,
}: {
  affiliates: Affiliate[];
  users: Option[];
}) {
  const [view, setView] = useState<"list" | "kanban">("list");

  if (affiliates.length === 0) {
    return (
      <EmptyState
        title="暂无联盟商资源"
        description="点击右上角新建联盟商，或批量导入 Excel"
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm",
              view === "list"
                ? "bg-brand-50 text-brand-700"
                : "text-slate-500",
            )}
            onClick={() => setView("list")}
          >
            <LayoutList className="h-4 w-4" /> 列表
          </button>
          <button
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm",
              view === "kanban"
                ? "bg-brand-50 text-brand-700"
                : "text-slate-500",
            )}
            onClick={() => setView("kanban")}
          >
            <KanbanSquare className="h-4 w-4" /> 看板
          </button>
        </div>
      </div>
      {view === "list" ? (
        <ListView affiliates={affiliates} users={users} />
      ) : (
        <KanbanView affiliates={affiliates} users={users} />
      )}
    </div>
  );
}
