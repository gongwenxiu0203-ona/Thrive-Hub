"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import {
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  SETTLEMENT_TYPE_LABELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { NewReconciliationModal } from "./NewReconciliationModal";

type Reconciliation = {
  id: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  feeAmount: number;
  commissionAmount: number;
  betType: string;
  betResult: string | null;
  customer: { id: string; brandName: string };
  contract: { id: string; contractNo: string; type: string };
  createdBy: { id: string; name: string };
  settlements: {
    id: string;
    type: string;
    amount: number;
    status: string;
    estimatedDate: Date | string | null;
    actualDate: Date | string | null;
  }[];
};

type ChannelReconciliation = {
  id: string;
  status: string;
  totalShareAmount: number;
  fixedFeeShareTotal: number;
  commissionShareTotal: number;
  estimatedDate: Date | string | null;
  actualDate: Date | string | null;
  customer: { id: string; brandName: string };
  channelUser: { id: string; name: string };
  settlement: { id: string; type: string; amount: number; status: string };
  createdBy: { id: string; name: string };
};

type Customer = {
  id: string;
  brandName: string;
  contracts: {
    id: string;
    contractNo: string;
    type: string;
    partyA: string | null;
    feeAmount: string | null;
    commissionRate: string | null;
    feeCycle: string | null;
    accountingPeriod: string | null;
    affiliateRule: string | null;
    paymentCycle: string | null;
  }[];
};

type Props = {
  reconciliations: Reconciliation[];
  channelReconciliations: ChannelReconciliation[];
  customers: Customer[];
  channelUsers: { id: string; name: string }[];
};

type Tab = "customers" | "channels" | "affiliates";

export function FinanceClient({
  reconciliations,
  channelReconciliations,
  customers,
  channelUsers,
}: Props) {
  const [tab, setTab] = useState<Tab>("customers");
  const router = useRouter();

  const tabs: { key: Tab; label: string }[] = [
    { key: "customers", label: "客户对账及结算" },
    { key: "channels", label: "渠道商对账及结算" },
    { key: "affiliates", label: "联盟商对账及结算" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">财务对账</h1>
          <p className="mt-1 text-sm text-slate-500">管理客户、渠道商、联盟商的对账与结算</p>
        </div>
        {tab === "customers" && (
          <NewReconciliationModal customers={customers} onCreated={() => router.refresh()} />
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 客户对账 */}
      {tab === "customers" && (
        <CustomerReconciliationTab reconciliations={reconciliations} />
      )}

      {/* 渠道商分账 */}
      {tab === "channels" && (
        <ChannelReconciliationTab channelReconciliations={channelReconciliations} channelUsers={channelUsers} />
      )}

      {/* 联盟商（占位） */}
      {tab === "affiliates" && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 text-4xl">🔜</div>
          <p className="text-slate-500">联盟商对账及结算功能即将上线</p>
        </div>
      )}
    </div>
  );
}

function CustomerReconciliationTab({ reconciliations }: { reconciliations: Reconciliation[] }) {
  if (reconciliations.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">📋</div>
        <p className="font-medium text-slate-700">暂无对账记录</p>
        <p className="mt-1 text-sm text-slate-400">点击右上角「新建对账」开始创建</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">客户</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">合同</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">对账周期</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">固费</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">抽佣金额</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">结算状态</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">创建人</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reconciliations.map((rec) => {
            const fixedSettlement = rec.settlements.find((s) => s.type === "FIXED_FEE");
            const commissionSettlement = rec.settlements.find((s) => s.type === "COMMISSION");
            return (
              <tr key={rec.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {rec.customer.brandName}
                </td>
                <td className="px-4 py-3 text-slate-500">{rec.contract.contractNo}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(rec.periodStart)} ~ {formatDate(rec.periodEnd)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={RECONCILIATION_STATUS_COLORS[rec.status]}>
                    {RECONCILIATION_STATUS_LABELS[rec.status] ?? rec.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  ¥{rec.feeAmount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  ¥{rec.commissionAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {fixedSettlement && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-slate-400">固费</span>
                        <Badge className={SETTLEMENT_STATUS_COLORS[fixedSettlement.status] + " text-xs"}>
                          {SETTLEMENT_STATUS_LABELS[fixedSettlement.status]}
                        </Badge>
                      </span>
                    )}
                    {commissionSettlement && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-slate-400">抽佣</span>
                        <Badge className={SETTLEMENT_STATUS_COLORS[commissionSettlement.status] + " text-xs"}>
                          {SETTLEMENT_STATUS_LABELS[commissionSettlement.status]}
                        </Badge>
                      </span>
                    )}
                    {rec.settlements.length === 0 && rec.status !== "CONFIRMED" && (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{rec.createdBy.name}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/finance/reconciliations/${rec.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    详情
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChannelReconciliationTab({
  channelReconciliations,
  channelUsers,
}: {
  channelReconciliations: ChannelReconciliation[];
  channelUsers: { id: string; name: string }[];
}) {
  void channelUsers; // reserved for future create modal

  if (channelReconciliations.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">🏪</div>
        <p className="font-medium text-slate-700">暂无渠道商分账记录</p>
        <p className="mt-1 text-sm text-slate-400">
          渠道商分账需在客户对账结算完成后，在对账详情页创建
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">客户</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">渠道商</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">关联结算</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">基础月费分账</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">GMV抽佣分账</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">分账总额</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">预计结算</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">实际结算</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {channelReconciliations.map((cr) => (
            <tr key={cr.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{cr.customer.brandName}</td>
              <td className="px-4 py-3 text-slate-600">{cr.channelUser.name}</td>
              <td className="px-4 py-3 text-slate-500">
                {SETTLEMENT_TYPE_LABELS[cr.settlement.type]} ¥{cr.settlement.amount.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right">
                {cr.fixedFeeShareTotal > 0 ? `¥${cr.fixedFeeShareTotal.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {cr.commissionShareTotal > 0 ? `¥${cr.commissionShareTotal.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-3 text-right font-medium">
                ¥{cr.totalShareAmount.toFixed(2)}
              </td>
              <td className="px-4 py-3">
                <Badge className={SETTLEMENT_STATUS_COLORS[cr.status]}>
                  {SETTLEMENT_STATUS_LABELS[cr.status] ?? cr.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {cr.estimatedDate ? formatDate(cr.estimatedDate) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {cr.actualDate ? formatDate(cr.actualDate) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
