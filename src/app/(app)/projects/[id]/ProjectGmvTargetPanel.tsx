"use client";

import { useState } from "react";
import { Target, Edit3 } from "lucide-react";
import { GmvTargetEditModal, type UserOption } from "./GmvTargetEditModal";
import { CURRENCY_SYMBOLS, type Currency } from "@/lib/projectChannels";
import type { ChannelInput } from "@/actions/projectGmvTarget";

export interface CurrentTargetView {
  targetId: string | null;
  month: string;
  amOwnerId: string | null;
  amOwnerName: string;
  currency: Currency;
  monthlyTarget: number;
  thresholdAt80: number;
  biGmv: number;
  reconciliationGmv: number;
  completionRatePct: number | null;
  achieved: boolean | null;
  remark: string | null;
  channels: {
    id: string;
    channelName: string;
    ownerId: string | null;
    ownerName: string;
    role: string;
    currency: string;
    sharePercent: number;
    channelGmv: number;
  }[];
}

export function ProjectGmvTargetPanel({
  projectId,
  projectType,
  current,
  monthOptions,
  selectedMonth,
  defaultAmOwnerId,
  users,
  canEdit,
}: {
  projectId: string;
  projectType: string; // "INTEGRATED" | "ONE_OFF"
  current: CurrentTargetView | null;
  monthOptions: string[]; // 历史月份（含当前选中）
  selectedMonth: string;
  defaultAmOwnerId: string | null;
  users: UserOption[];
  canEdit: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  // ONE_OFF 项目不纳入 KPI（按用户确认的规则）
  if (projectType !== "INTEGRATED") {
    return (
      <section className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-slate-600">
          <Target className="h-4 w-4" />
          <h2 className="text-sm font-semibold">项目 GMV 目标</h2>
        </div>
        <p className="text-xs text-slate-400">单次合作（ONE_OFF）项目不纳入员工 KPI 汇总。</p>
      </section>
    );
  }

  const sym = current ? CURRENCY_SYMBOLS[current.currency] : "$";
  const initialChannels: ChannelInput[] = current?.channels.length
    ? current.channels.map((c) => ({
        id: c.id,
        channelName: c.channelName,
        ownerId: c.ownerId,
        role: c.role,
        currency: c.currency,
        sharePercent: c.sharePercent,
      }))
    : [
        { channelName: "Media Buyer目标", role: "PGM", sharePercent: 0, currency: "USD" },
        { channelName: "PR目标", role: "PGM", sharePercent: 0, currency: "USD" },
        { channelName: "Deal目标", role: "PGM", sharePercent: 0, currency: "USD" },
        { channelName: "Creator", role: "PGM", sharePercent: 0, currency: "USD" },
        { channelName: "ACC", role: "PGM", sharePercent: 0, currency: "USD" },
      ];

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <Target className="h-4 w-4" />
          <h2 className="text-sm font-semibold">项目 GMV 目标</h2>
          {monthOptions.length > 1 && (
            <MonthSwitcher projectId={projectId} options={monthOptions} value={selectedMonth} />
          )}
          <span className="text-xs text-slate-400">{selectedMonth}</span>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            <Edit3 className="h-3.5 w-3.5" />
            {current ? "编辑目标" : "设置 GMV 目标"}
          </button>
        )}
      </div>

      {!current ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm text-slate-500">本月（{selectedMonth}）还没有设置 GMV 目标</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="btn-primary mt-3 inline-flex items-center gap-1.5 text-xs"
            >
              <Edit3 className="h-3.5 w-3.5" />
              设置 GMV 目标
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="AM 负责人" value={current.amOwnerName} />
            <Stat label="月度 GMV 目标" value={`${sym}${current.monthlyTarget.toLocaleString()}`} />
            <Stat label="80% 达标线" value={`${sym}${current.thresholdAt80.toLocaleString()}`} />
            <Stat label="BI 实际 GMV" value={`${sym}${current.biGmv.toLocaleString()}`} />
            <Stat label="客户对账 GMV" value={`${sym}${current.reconciliationGmv.toLocaleString()}`} />
            <Stat
              label="完成率"
              value={
                current.completionRatePct == null
                  ? "—"
                  : `${current.completionRatePct.toFixed(1)}%`
              }
              color={
                current.completionRatePct != null && current.completionRatePct >= 80
                  ? "text-emerald-600"
                  : current.completionRatePct != null
                    ? "text-rose-600"
                    : undefined
              }
            />
            <Stat
              label="是否达标"
              value={
                current.achieved == null
                  ? "未设置目标"
                  : current.achieved ? "达标" : "未达标"
              }
              color={
                current.achieved == null
                  ? "text-slate-400"
                  : current.achieved ? "text-emerald-600" : "text-rose-600"
              }
            />
          </div>

          {current.channels.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-slate-600">渠道目标拆分</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">渠道</th>
                      <th className="px-3 py-2 text-left">负责人</th>
                      <th className="px-3 py-2 text-left">角色</th>
                      <th className="px-3 py-2 text-right">占比 %</th>
                      <th className="px-3 py-2 text-right">目标 GMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.channels.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{c.channelName}</td>
                        <td className="px-3 py-2">{c.ownerName}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{c.role}</td>
                        <td className="px-3 py-2 text-right">{c.sharePercent.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {sym}{c.channelGmv.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {current.remark && (
            <p className="mt-3 text-xs text-slate-500">备注：{current.remark}</p>
          )}
        </>
      )}

      {showModal && (
        <GmvTargetEditModal
          projectId={projectId}
          initialMonth={selectedMonth}
          initialAmOwnerId={current?.amOwnerId ?? defaultAmOwnerId}
          initialCurrency={current?.currency ?? "USD"}
          initialMonthlyTarget={current?.monthlyTarget ?? 0}
          initialRemark={current?.remark ?? null}
          initialChannels={initialChannels}
          users={users}
          onClose={() => setShowModal(false)}
        />
      )}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${color ?? "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function MonthSwitcher({
  projectId, options, value,
}: { projectId: string; options: string[]; value: string }) {
  return (
    <select
      defaultValue={value}
      onChange={(e) => {
        window.location.href = `/projects/${projectId}?targetMonth=${e.target.value}`;
      }}
      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
    >
      {options.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  );
}
