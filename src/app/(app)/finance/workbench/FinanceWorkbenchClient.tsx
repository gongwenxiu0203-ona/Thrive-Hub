"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  acceptBillingRequest,
  deleteBillingRequest,
} from "@/actions/billingRequests";
import { Modal } from "@/components/ui/Modal";
import { batchDecideFinanceRequests, cancelFinanceRequests, changeFinanceRequestReviewer, decideFinanceRequest } from "@/actions/financeUnified";

type BillingRow = {
  id: string;
  requestNo: string;
  customerName: string;
  applicantName: string;
  documentType: string;
  mergeMode: string;
  lineCount: number;
  contractNos: string[];
  sourceType: string;
  applicantNote: string | null;
  status: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  reviewerName: string | null;
  reviewerId: string | null;
  items: Array<{ description: string; period: string; quantity: number; unitPrice: number; amount: number; taxRate?: number | null; taxAmount?: number | null }>;
  currency: string;
  requestedAmount: number;
  issuedAmount: number;
  submittedAt: string;
  invoice: {
    id: string;
    invoiceNo: string;
    status: string;
    totalAmount: number;
    actualInvoiceNo: string | null;
    originalFileUrl: string | null;
  } | null;
  documents: Array<{
    id: string;
    invoiceNo: string;
    status: string;
    actualInvoiceNo: string | null;
    originalFileUrl: string | null;
  }>;
};
type ReceivableRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  invoiceNo: string;
  actualInvoiceNo: string;
  invoiceId: string | null;
  originalFileUrl: string | null;
  currency: string;
  invoiceAmount?: number;
  receivedAmount?: number;
  balance: number;
  dueDate: string;
  status: string;
};
type ReceiptRow = {
  id: string;
  receiptNo: string;
  customerName: string;
  currency: string;
  amount: number;
  allocated: number;
  receivedAt: string;
};
type ChannelRow = {
  id: string;
  reconciliationId: string;
  customerName: string;
  channelName: string;
  periodLabel: string;
  status: string;
  currency: string;
  balance: number;
};
type PayableExceptionRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  reconciliationId: string | null;
  reconciliationLabel: string;
  reason: string;
  createdAt: string;
};
type OutgoingRow = {
  id: string;
  requestNo: string;
  category: "CHANNEL" | "AFFILIATE" | "SUPPLIER" | "OTHER";
  objectName: string;
  currency: string;
  amount: number;
  status: string;
  createdAt: string;
  kind: "PAYMENT" | "EXPENSE";
  applicantId: string;
  applicantName: string;
  detail: string;
  reviewerId: string | null;
  reviewerName: string | null;
  approvalStatus: string | null;
  paymentProofUrls: string[];
};
type BillingFilter =
  "ALL" | "SUBMITTED" | "PROCESSING" | "PARTIAL" | "COMPLETED" | "REJECTED";

const money = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const billingLabels: Record<string, string> = {
  SUBMITTED: "待审核",
  PROCESSING: "待开票",
  PARTIAL: "部分开票",
  COMPLETED: "已开票",
  REJECTED: "已驳回",
  CANCELLED: "已取消",
};

export function FinanceWorkbenchClient({
  currentUserId,
  canViewBilling,
  canViewPayment,
  canEditBilling,
  canEditReceipt,
  canEditPayment,
  isAdmin,
  billingRequests,
  receivables,
  unallocatedReceipts,
  channelPeriods,
  payableExceptions,
  outgoingRequests = [],
  reviewerOptions = [],
}: {
  currentUserId: string;
  canViewBilling: boolean;
  canViewPayment: boolean;
  canEditBilling: boolean;
  canEditReceipt: boolean;
  canEditPayment: boolean;
  isAdmin: boolean;
  billingRequests: BillingRow[];
  receivables: ReceivableRow[];
  unallocatedReceipts: ReceiptRow[];
  channelPeriods: ChannelRow[];
  payableExceptions: PayableExceptionRow[];
  outgoingRequests?: OutgoingRow[];
  reviewerOptions?: Array<{ id: string; label: string; email: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedRequestId = searchParams.get("focusRequest");
  const [mainTab, setMainTab] = useState<"BILLING" | "PAYMENT">(
    searchParams.get("mainTab") === "PAYMENT" || !canViewBilling ? "PAYMENT" : "BILLING",
  );
  const [billingFilter, setBillingFilter] =
    useState<BillingFilter>("SUBMITTED");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [embeddedUrl, setEmbeddedUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<BillingRow | null>(null);
  const [selectedBilling, setSelectedBilling] = useState<string[]>([]);
  const [expandedBilling, setExpandedBilling] = useState<string | null>(null);
  const [billingBatchDialog, setBillingBatchDialog] = useState<"REJECT" | "DELETE" | null>(null);
  const [billingBatchReason, setBillingBatchReason] = useState("");
  const [reviewingBilling, setReviewingBilling] = useState<BillingRow | null>(null);
  const [reviewingOutgoing, setReviewingOutgoing] = useState<OutgoingRow | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [selectedReceivables, setSelectedReceivables] = useState<string[]>([]);
  const currentReceivableMonth = new Date().toISOString().slice(0, 7);
  const [receivableMonth, setReceivableMonth] = useState(
    currentReceivableMonth,
  );
  const [selectedOutgoing, setSelectedOutgoing] = useState<string[]>([]);
  const [expandedOutgoing, setExpandedOutgoing] = useState<string | null>(focusedRequestId);
  const [batchDialog, setBatchDialog] = useState<"REJECT" | "DELETE" | null>(null);
  const [batchReason, setBatchReason] = useState("");
  const [paying, setPaying] = useState<OutgoingRow | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ paidAt: new Date().toISOString().slice(0, 10), transactionNo: "", proofUrls: "", comment: "" });
  const [outgoingFilter, setOutgoingFilter] = useState<
    "ALL" | OutgoingRow["category"] | "EXPENSE"
  >("ALL");
  const [outgoingStatus, setOutgoingStatus] = useState("ALL");
  const [exporting, setExporting] = useState(false);
  const filteredOutgoing = outgoingRequests.filter(
    (row) =>
      (outgoingFilter === "ALL" ||
        (outgoingFilter === "EXPENSE"
          ? row.kind === "EXPENSE"
          : row.kind !== "EXPENSE" && row.category === outgoingFilter)) &&
      (outgoingStatus === "ALL" || row.status === outgoingStatus),
  );
  const receivableMonths = [
    ...new Set([
      currentReceivableMonth,
      ...receivables.map((row) => row.dueDate.slice(0, 7)),
    ]),
  ]
    .sort()
    .reverse();
  const filteredReceivables = receivables.filter(
    (row) =>
      receivableMonth === "ALL" || row.dueDate.startsWith(receivableMonth),
  );
  const arSummary = filteredReceivables.reduce<
    Record<string, { total: number; received: number; balance: number }>
  >((acc, row) => {
    const current = acc[row.currency] ?? { total: 0, received: 0, balance: 0 };
    current.balance += row.balance;
    current.total += row.invoiceAmount ?? row.balance;
    current.received += row.receivedAmount ?? 0;
    acc[row.currency] = current;
    return acc;
  }, {});
  const outgoingSummary = filteredOutgoing.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.currency] = (acc[row.currency] ?? 0) + row.amount;
      return acc;
    },
    {},
  );
  async function exportRows(section: string, ids: string[]) {
    if (!ids.length) return setError("请先选择需要导出的记录");
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/finance/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, ids, includeAttachments: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return setError(payload.error ?? "导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `finance-export-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }
  function batchOutgoing(action: "APPROVE" | "REJECT" | "DELETE") {
    const selected = outgoingRequests.filter((row) => selectedOutgoing.includes(row.id));
    if (!selected.length) return setError("请先选择申请记录");
    startTransition(async () => {
      setError("");
      if (action === "DELETE") {
        const result = await cancelFinanceRequests({ records: selected.map((row) => ({ id: row.id, entityType: row.kind === "PAYMENT" ? "PAYMENT_REQUEST" : "EXPENSE_CLAIM" })), reason: batchReason });
        if (!result.ok) return setError(result.error ?? "批量删除失败");
      } else {
        const groups = [
          { entityType: "PAYMENT_REQUEST" as const, ids: selected.filter((row) => row.kind === "PAYMENT").map((row) => row.id) },
          { entityType: "EXPENSE_CLAIM" as const, ids: selected.filter((row) => row.kind === "EXPENSE").map((row) => row.id) },
        ].filter((group) => group.ids.length);
        for (const group of groups) {
          const result = await batchDecideFinanceRequests({ ...group, action, comment: batchReason });
          if (!result.ok) return setError(result.error ?? "批量审核失败");
        }
      }
      setBatchDialog(null); setBatchReason(""); setSelectedOutgoing([]); router.refresh();
    });
  }
  function batchBilling(action: "APPROVE" | "REJECT" | "DELETE") {
    const ids = filteredBilling.filter((row) => selectedBilling.includes(row.id)).map((row) => row.id);
    if (!ids.length) return setError("请先选择开票申请");
    startTransition(async () => {
      setError("");
      if (action === "DELETE") {
        for (const id of ids) { const result = await deleteBillingRequest(id, billingBatchReason); if (!result.ok) return setError(result.error ?? "批量删除失败"); }
      } else {
        const result = await batchDecideFinanceRequests({ entityType: "BILLING_REQUEST", ids, action, comment: billingBatchReason });
        if (!result.ok) return setError(result.error ?? "批量审核失败");
      }
      setBillingBatchDialog(null); setBillingBatchReason(""); setSelectedBilling([]); router.refresh();
    });
  }
  function changeOutgoingReviewer(row: OutgoingRow, reviewerId: string) {
    startTransition(async () => {
      const result = await changeFinanceRequestReviewer(row.kind === "PAYMENT" ? "PAYMENT_REQUEST" : "EXPENSE_CLAIM", row.id, reviewerId);
      if (!result.ok) setError(result.error ?? "更换审核人失败"); else router.refresh();
    });
  }
  async function uploadPaymentProofs(files: File[]) {
    if (!files.length) return;
    setUploadingProof(true); setError("");
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const form = new FormData(); form.set("file", file); form.set("scope", "PAYMENT");
        const response = await fetch("/api/finance/attachments/stage", { method: "POST", body: form });
        const body = await response.json().catch(() => ({})) as { fileUrl?: string; error?: string };
        if (!response.ok || !body.fileUrl) throw new Error(body.error ?? `${file.name} 上传失败`);
        uploaded.push(body.fileUrl);
      }
      const existing = paymentForm.proofUrls.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
      setPaymentForm({ ...paymentForm, proofUrls: [...new Set([...existing, ...uploaded])].join("\n") });
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "付款回单上传失败"); }
    finally { setUploadingProof(false); }
  }
  const filteredBilling = billingRequests.filter((row) => {
    if (billingFilter !== "ALL" && row.status !== billingFilter) return false;
    const day = row.submittedAt.slice(0, 10);
    return (!fromDate || day >= fromDate) && (!toDate || day <= toDate);
  });
  const billingCount = (status: BillingFilter) =>
    status === "ALL"
      ? billingRequests.length
      : billingRequests.filter((row) => row.status === status).length;
  const displayBillingStatus = (row: BillingRow) => {
    if (row.status === "SUBMITTED" && row.approvalStatus === "APPROVED") return "审核通过 · 待开票";
    if (row.status === "SUBMITTED" && row.approvalStatus === "REJECTED") return "审核未通过";
    return billingLabels[row.status] ?? row.status;
  };
  function accept(row: BillingRow) {
    startTransition(async () => {
      setError("");
      const result = await acceptBillingRequest(row.id);
      if (!result.ok) return setError(result.error ?? "受理失败");
      if (row.documentType === "INVOICE") {
        router.push(`/invoices/new?billingRequestId=${row.id}&focus=invoice`);
      } else {
        setEmbeddedUrl(`/finance/billing/${row.id}/domestic`);
      }
      router.refresh();
    });
  }
  function remove() {
    if (!deleting) return;
    startTransition(async () => {
      setError("");
      const result = await deleteBillingRequest(deleting.id, deleteReason);
      if (!result.ok) return setError(result.error ?? "删除失败");
      setDeleting(null);
      setDeleteReason("");
      router.refresh();
    });
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">
            Finance Workbench
          </p>
          <h1 className="text-2xl font-bold text-slate-900">财务工作台</h1>
          <p className="mt-1 text-sm text-slate-500">
            统一处理开票、客户收款核销、渠道凭证与付款。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewBilling && (
            <Link href="/invoices" className="btn-secondary">
              Invoice
            </Link>
          )}
          <Link href="/finance" className="btn-secondary">
            返回结算中心
          </Link>
        </div>
      </header>
      <div className="flex flex-wrap divide-x divide-[#e7e0ef] rounded-lg border border-[#e7e0ef] bg-white px-4 py-3">
        {canViewBilling && (
          <>
            <Metric
              label="待审核 / 待开票"
              value={`${billingCount("SUBMITTED")} 条`}
            />
            <Metric label="未完成应收" value={`${receivables.length} 条`} />
            <Metric
              label="待分配到账"
              value={`${unallocatedReceipts.length} 笔`}
            />
          </>
        )}
        {canViewPayment && (
          <Metric label="渠道待处理" value={`${channelPeriods.length} 条`} />
        )}
      </div>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {canViewBilling && (
          <Tab
            active={mainTab === "BILLING"}
            onClick={() => setMainTab("BILLING")}
          >
            开票与收款
          </Tab>
        )}
        {canViewPayment && (
          <Tab
            active={mainTab === "PAYMENT"}
            onClick={() => setMainTab("PAYMENT")}
          >
            付款与报销
          </Tab>
        )}
      </div>
      {mainTab === "BILLING" ? (
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 className="font-semibold text-slate-900">开票申请记录</h2>
                <p className="mt-1 text-xs text-slate-500">
                  受理后直接进入已预填的 Invoice 或国内发票页面。
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="btn-primary btn-sm" disabled={pending || !selectedBilling.length || selectedBilling.some((id) => billingRequests.find((row) => row.id === id)?.reviewerId !== currentUserId)} onClick={() => batchBilling("APPROVE")}>批量通过</button>
                <button type="button" className="btn-secondary btn-sm text-rose-700" disabled={pending || !selectedBilling.length || selectedBilling.some((id) => billingRequests.find((row) => row.id === id)?.reviewerId !== currentUserId)} onClick={() => { setBillingBatchReason(""); setBillingBatchDialog("REJECT"); }}>批量退回</button>
                {isAdmin && <button type="button" className="btn-secondary btn-sm text-rose-700" disabled={pending || !selectedBilling.length} onClick={() => { setBillingBatchReason(""); setBillingBatchDialog("DELETE"); }}>批量删除</button>}
                <input
                  aria-label="申请开始日期"
                  type="date"
                  className="input h-8 w-36 text-xs"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
                <input
                  aria-label="申请结束日期"
                  type="date"
                  className="input h-8 w-36 text-xs"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
                {(
                  [
                    "SUBMITTED",
                    "PROCESSING",
                    "PARTIAL",
                    "COMPLETED",
                    "REJECTED",
                    "ALL",
                  ] as BillingFilter[]
                ).map((status) => (
                  <button
                    key={status}
                    onClick={() => setBillingFilter(status)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${billingFilter === status ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
                  >
                    {status === "ALL" ? "全部" : billingLabels[status]}{" "}
                    {billingCount(status)}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="w-10 px-3"><input type="checkbox" aria-label="全选当前开票申请" checked={filteredBilling.length > 0 && filteredBilling.every((row) => selectedBilling.includes(row.id))} onChange={(event) => setSelectedBilling(event.target.checked ? filteredBilling.map((row) => row.id) : [])} /></th>
                    <th className="px-5 py-3">申请单</th>
                    <th>客户 / 申请人</th>
                    <th>票据方式</th>
                    <th>状态</th>
                    <th className="text-right">申请 / 已开</th>
                    <th className="px-5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBilling.map((row) => (
                    <Fragment key={row.id}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="px-3"><input type="checkbox" aria-label={`选择 ${row.requestNo}`} checked={selectedBilling.includes(row.id)} onChange={(event) => setSelectedBilling((current) => event.target.checked ? [...new Set([...current, row.id])] : current.filter((id) => id !== row.id))} /></td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {row.requestNo}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(row.submittedAt).toLocaleString("zh-CN")}
                        </p>
                      </td>
                      <td>
                        <p>{row.customerName}</p>
                        <p className="text-xs text-slate-500">
                          {row.applicantName}
                        </p>
                        {row.contractNos.length > 0 && (
                          <p className="mt-1 max-w-xs text-xs text-slate-500">
                            合同：{row.contractNos.join("、")}
                          </p>
                        )}
                      </td>
                      <td>
                        {row.documentType === "DOMESTIC"
                          ? "国内发票"
                          : "Invoice"}
                        <p className="text-xs text-slate-500">
                          {row.mergeMode === "MERGED"
                            ? `合并 ${row.lineCount} 条`
                            : "分别开票"}
                        </p>
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-1 text-xs ${row.status === "SUBMITTED" && row.approvalStatus === "APPROVED" ? "bg-emerald-100 font-medium text-emerald-700" : row.approvalStatus === "REJECTED" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                          {displayBillingStatus(row)}
                        </span>
                        {row.reviewerName && <p className="mt-1 text-xs text-slate-500">审核人：{row.reviewerName}</p>}
                      </td>
                      <td className="text-right">
                        <p className="font-medium">
                          {money(row.requestedAmount, row.currency)}
                        </p>
                        {row.issuedAmount > 0 && (
                          <p className="text-xs text-emerald-700">
                            已开 {money(row.issuedAmount, row.currency)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 text-right">
                        {row.status === "SUBMITTED" && row.approvalStatus === "PENDING" && row.reviewerId === currentUserId && <button type="button" className="mr-3 text-xs font-medium text-brand-700 hover:underline" disabled={pending} onClick={() => { setReviewingBilling(row); setReviewReason(""); }}>审核</button>}
                        {isAdmin && <button type="button" className="mr-3 text-xs font-medium text-rose-700 hover:underline" onClick={() => { setDeleting(row); setDeleteReason(""); }}>删除</button>}
                        <button type="button" className="mr-3 text-xs font-medium text-brand-700 hover:underline" onClick={() => setExpandedBilling(expandedBilling === row.id ? null : row.id)}>{expandedBilling === row.id ? "收起详情" : "详情"}</button>
                        {row.status === "SUBMITTED" && row.approvalStatus === "APPROVED" && canEditBilling ? (
                          <button
                            className="btn-primary"
                            disabled={pending}
                            onClick={() => accept(row)}
                          >
                            受理并开票
                          </button>
                        ) : (row.status === "PROCESSING" ||
                            row.status === "PARTIAL") &&
                          canEditBilling ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() =>
                              row.documentType === "INVOICE"
                                ? router.push(
                                    `/invoices/new?billingRequestId=${row.id}&focus=invoice`,
                                  )
                                : setEmbeddedUrl(
                                    `/finance/billing/${row.id}/domestic`,
                                  )
                            }
                          >
                            继续开票
                          </button>
                        ) : row.invoice ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEmbeddedUrl(`/invoices/${row.invoice!.id}`)
                            }
                            className="text-brand-700 hover:underline"
                          >
                            查看{" "}
                            {row.invoice.actualInvoiceNo ??
                              row.invoice.invoiceNo}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {row.documents.map((document, index) => (
                          <a
                            key={document.id}
                            href={
                              row.documentType === "DOMESTIC"
                                ? `/api/finance/domestic-invoices/${document.id}/original`
                                : `/api/invoices/${document.id}/pdf`
                            }
                            className="ml-3 inline-flex text-xs font-medium text-brand-700 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                            download
                          >
                            {row.documentType === "DOMESTIC"
                              ? `下载国内发票${row.documents.length > 1 ? ` ${index + 1}` : ""}`
                              : `下载 Invoice${row.documents.length > 1 ? ` ${index + 1}` : ""}`}
                          </a>
                        ))}
                      </td>
                    </tr>
                    {expandedBilling === row.id && <tr><td colSpan={7} className="bg-[#faf8ff] px-5 py-4"><div className="grid gap-3 text-sm md:grid-cols-4"><p><span className="text-xs text-slate-500">申请单</span><br />{row.requestNo}</p><p><span className="text-xs text-slate-500">客户 / 申请人</span><br />{row.customerName} · {row.applicantName}</p><p><span className="text-xs text-slate-500">审核人</span><br />{row.reviewerName ?? "—"}</p><p><span className="text-xs text-slate-500">申请金额</span><br />{money(row.requestedAmount, row.currency)}</p><p><span className="text-xs text-slate-500">票据方式</span><br />{row.documentType === "DOMESTIC" ? "国内发票" : "Invoice"}</p><p><span className="text-xs text-slate-500">明细数量</span><br />{row.lineCount} 条</p><p><span className="text-xs text-slate-500">关联合同</span><br />{row.contractNos.join("、") || "—"}</p><p><span className="text-xs text-slate-500">当前状态</span><br />{displayBillingStatus(row)}</p></div><BillingItemsTable row={row} /></td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {!filteredBilling.length && (
                <p className="p-10 text-center text-sm text-slate-500">
                  当前队列暂无申请。
                </p>
              )}
            </div>
          </section>
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="font-semibold text-slate-900">应收账款汇总</h2>
                <p className="mt-1 text-xs text-slate-500">
                  登记到账时可直接关联应收、Invoice 和客户对账。
                </p>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-3">
                <label className="block min-w-44">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    应收月份
                  </span>
                  <select
                    className="input"
                    value={receivableMonth}
                    onChange={(event) => {
                      setReceivableMonth(event.target.value);
                      setSelectedReceivables([]);
                    }}
                  >
                    <option value="ALL">全部月份</option>
                    {receivableMonths.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>
              {canEditReceipt && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setEmbeddedUrl("/finance/receipts/new")}
                >
                  登记客户到账
                </button>
              )}
              </div>
            </div>
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50/40 p-5 md:grid-cols-2">
              <label className="hidden">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  应收月份
                </span>
                <select
                  className="input"
                  value={receivableMonth}
                  onChange={(event) => {
                    setReceivableMonth(event.target.value);
                    setSelectedReceivables([]);
                  }}
                >
                  <option value="ALL">全部月份</option>
                  {receivableMonths.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              {(["USD", "CNY"] as const).map((currencyCode) => {
                const value = arSummary[currencyCode] ?? {
                  total: 0,
                  received: 0,
                  balance: 0,
                };
                return (
                  <div
                    key={currencyCode}
                    className="rounded-lg border border-[#e7e0ef] bg-white px-4 py-3"
                  >
                    <p className="text-xs font-medium text-slate-600">
                      {currencyCode === "USD"
                        ? "美元应收余额"
                        : "人民币应收余额"}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {money(value.balance, currencyCode)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      应收 {value.total.toFixed(2)} · 已收{" "}
                      {value.received.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="w-10 px-3 py-3">
                      <span className="sr-only">选择</span>
                    </th>
                    <th className="px-5 py-3">客户</th>
                    <th>发票号码</th>
                    <th>系统单号</th>
                    <th>到期日</th>
                    <th>状态</th>
                    <th className="text-right">应收余额</th>
                    <th className="px-5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceivables.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-2">
                        <input
                          type="checkbox"
                          aria-label={`选择 ${row.invoiceNo}`}
                          checked={selectedReceivables.includes(row.id)}
                          onChange={(event) =>
                            setSelectedReceivables((current) =>
                              event.target.checked
                                ? [...new Set([...current, row.id])]
                                : current.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{row.customerName}</p>
                      </td>
                      <td className="font-medium">{row.actualInvoiceNo}</td>
                      <td className="text-xs text-slate-500">
                        {row.invoiceNo}
                      </td>
                      <td>
                        {new Date(row.dueDate).toLocaleDateString("zh-CN")}
                      </td>
                      <td>{row.status}</td>
                      <td className="text-right font-medium">
                        {money(row.balance, row.currency)}
                      </td>
                      <td className="px-5 text-right">
                        {canEditReceipt ? (
                          <>
                            <button
                              type="button"
                              className="text-brand-700 hover:underline"
                              onClick={() =>
                                setEmbeddedUrl(
                                  `/finance/receipts/new?customerId=${row.customerId ?? ""}&arId=${row.id}`,
                                )
                              }
                            >
                              登记到账
                            </button>
                            {row.originalFileUrl && row.invoiceId && (
                              <a
                                className="ml-3 text-brand-700 hover:underline"
                                href={`/api/finance/domestic-invoices/${row.invoiceId}/original`}
                                download
                              >
                                下载原件
                              </a>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                <div className="hidden">
                  {Object.entries(arSummary).map(([currency, value]) => (
                    <span key={currency}>
                      <strong>{currency}</strong> 应收 {value.total.toFixed(2)}{" "}
                      · 已收 {value.received.toFixed(2)} · 余额{" "}
                      {value.balance.toFixed(2)}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setSelectedReceivables(
                        selectedReceivables.length ===
                          filteredReceivables.length
                          ? []
                          : filteredReceivables.map((row) => row.id),
                      )
                    }
                  >
                    {filteredReceivables.length > 0 &&
                    selectedReceivables.length === filteredReceivables.length
                      ? "取消全选"
                      : "全选"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={exporting || !selectedReceivables.length}
                    onClick={() =>
                      void exportRows(
                        "ACCOUNTS_RECEIVABLE",
                        selectedReceivables,
                      )
                    }
                  >
                    导出已选（含附件）
                  </button>
                </div>
              </div>
              {!filteredReceivables.length && (
                <p className="p-10 text-center text-sm text-slate-500">
                  暂无待收款应收。
                </p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">付款申请记录</h2>
            <p className="mt-1 text-xs text-slate-500">
              按渠道商、联盟商固费、公司采购、费用报销和其他付款统一筛选与汇总。
            </p>
          </div>
          <div className="space-y-3 border-b border-slate-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    "ALL",
                    "CHANNEL",
                    "AFFILIATE",
                    "SUPPLIER",
                    "EXPENSE",
                    "OTHER",
                  ] as const
                ).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setOutgoingFilter(category)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${outgoingFilter === category ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {category === "ALL"
                      ? "全部"
                      : category === "CHANNEL"
                        ? "渠道商"
                        : category === "AFFILIATE"
                          ? "联盟商固费"
                          : category === "SUPPLIER"
                            ? "公司采购"
                            : category === "EXPENSE"
                              ? "费用报销"
                              : "其他"}
                  </button>
                ))}
                <select aria-label="付款申请状态筛选" className="input h-9 w-32 py-1 text-xs" value={outgoingStatus} onChange={(event) => setOutgoingStatus(event.target.value)}>
                  <option value="ALL">全部状态</option><option value="SUBMITTED">待审核</option><option value="APPROVED">待付款</option><option value="REJECTED">已退回</option><option value="PAID">已付款</option><option value="CANCELLED">已删除</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary" disabled={pending || !selectedOutgoing.length || selectedOutgoing.some((id) => outgoingRequests.find((row) => row.id === id)?.reviewerId !== currentUserId)} onClick={() => batchOutgoing("APPROVE")}>批量通过</button>
                <button type="button" className="btn-secondary text-rose-700" disabled={pending || !selectedOutgoing.length || selectedOutgoing.some((id) => outgoingRequests.find((row) => row.id === id)?.reviewerId !== currentUserId)} onClick={() => { setBatchReason(""); setBatchDialog("REJECT"); }}>批量退回</button>
                {isAdmin && <button type="button" className="btn-secondary text-rose-700" disabled={pending || !selectedOutgoing.length} onClick={() => { setBatchReason(""); setBatchDialog("DELETE"); }}>批量删除</button>}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!filteredOutgoing.length}
                  onClick={() =>
                    setSelectedOutgoing(
                      selectedOutgoing.length === filteredOutgoing.length
                        ? []
                        : filteredOutgoing.map((row) => row.id),
                    )
                  }
                >
                  {filteredOutgoing.length > 0 &&
                  selectedOutgoing.length === filteredOutgoing.length
                    ? "取消全选"
                    : "全选"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={exporting || !selectedOutgoing.length}
                  onClick={() =>
                    void exportRows("PAYMENTS_AND_EXPENSES", selectedOutgoing)
                  }
                >
                  导出已选（含附件）
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              {Object.entries(outgoingSummary).map(([currency, amount]) => (
                <span key={currency}>
                  <strong>{currency}</strong> {amount.toFixed(2)}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="w-10 px-2"></th>
                    <th className="py-2">申请单</th>
                    <th>分类</th>
                    <th>对象</th>
                    <th>状态</th>
                    <th className="text-right">金额</th>
                    <th className="px-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOutgoing.map((row) => (
                    <Fragment key={row.id}>
                    <tr>
                      <td className="px-2">
                        <input
                          type="checkbox"
                          checked={selectedOutgoing.includes(row.id)}
                          onChange={(event) =>
                            setSelectedOutgoing((current) =>
                              event.target.checked
                                ? [...new Set([...current, row.id])]
                                : current.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      <td className="py-2 font-medium">{row.requestNo}</td>
                      <td>
                        {row.kind === "EXPENSE"
                          ? "费用报销"
                          : row.category === "CHANNEL"
                            ? "渠道商"
                            : row.category === "AFFILIATE"
                              ? "联盟商固费"
                              : row.category === "SUPPLIER"
                                ? "公司采购"
                                : "其他"}
                      </td>
                      <td>{row.objectName}</td>
                      <td>{row.status}</td>
                      <td className="text-right">
                        {money(row.amount, row.currency)}
                      </td>
                      <td className="px-3 text-right"><div className="flex flex-wrap justify-end gap-x-3 gap-y-1">{row.approvalStatus === "PENDING" && row.reviewerId === currentUserId && <button type="button" className="font-medium text-brand-700 hover:underline" disabled={pending} onClick={() => { setReviewingOutgoing(row); setReviewReason(""); }}>审核</button>}{isAdmin && ["SUBMITTED", "REJECTED"].includes(row.status) && <button type="button" className="font-medium text-rose-700 hover:underline" onClick={() => { setSelectedOutgoing([row.id]); setBatchReason(""); setBatchDialog("DELETE"); }}>删除</button>}<button type="button" className="text-brand-700 hover:underline" onClick={() => setExpandedOutgoing(expandedOutgoing === row.id ? null : row.id)}>{expandedOutgoing === row.id ? "收起详情" : "详情"}</button>{row.status === "APPROVED" && canEditPayment && <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => { setPaying(row); setPaymentForm({ paidAt: new Date().toISOString().slice(0, 10), transactionNo: "", proofUrls: "", comment: "" }); }}>核销</button>}{row.paymentProofUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" download className="font-medium text-brand-700 hover:underline">下载凭证{row.paymentProofUrls.length > 1 ? index + 1 : ""}</a>)}</div></td>
                    </tr>
                    {expandedOutgoing === row.id && <tr><td colSpan={7} className="bg-[#faf8ff] px-5 py-4"><div className="grid gap-3 text-sm md:grid-cols-4"><p><span className="text-xs text-slate-500">申请人</span><br />{row.applicantName}</p><p><span className="text-xs text-slate-500">审核人</span><br />{row.reviewerName ?? "—"}</p><p><span className="text-xs text-slate-500">申请事项</span><br />{row.detail}</p><p><span className="text-xs text-slate-500">审批状态</span><br />{row.approvalStatus ?? row.status}</p></div>{row.applicantId === currentUserId && row.approvalStatus === "PENDING" && <label className="mt-3 block max-w-md text-xs font-medium text-slate-600">更换审核人<select className="input mt-1" value={row.reviewerId ?? ""} disabled={pending} onChange={(event) => changeOutgoingReviewer(row, event.target.value)}>{reviewerOptions.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.email}</option>)}</select></label>}</td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {!filteredOutgoing.length && (
                <p className="py-6 text-center text-sm text-slate-500">
                  暂无付款或报销申请。
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {channelPeriods.map((row) => (
              <Link
                key={row.id}
                href={`/finance/channel-reconciliations/${row.reconciliationId}`}
                className="rounded-lg border border-slate-200 p-4 hover:border-brand-300 hover:bg-brand-50/30"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {row.customerName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.channelName} · {row.periodLabel}
                    </p>
                  </div>
                  <span className="h-fit rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
                    {row.status}
                  </span>
                </div>
                <div className="mt-4 flex justify-between text-sm">
                  <span className="text-slate-500">待付余额</span>
                  <strong>{money(row.balance, row.currency)}</strong>
                </div>
                {canEditPayment && (
                  <p className="mt-3 text-right text-xs font-medium text-brand-700">
                    进入审核 / 付款 →
                  </p>
                )}
              </Link>
            ))}
            {!channelPeriods.length && (
              <p className="col-span-2 py-10 text-center text-sm text-slate-500">
                暂无待处理付款记录。
              </p>
            )}
          </div>
        </section>
      )}
      {mainTab === "PAYMENT" && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="font-semibold text-slate-900">付款异常记录</h2>
              <p className="mt-1 text-xs text-slate-500">
                付款流程中需要人工处理的异常记录，当前展示最近 50 条。
              </p>
            </div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {payableExceptions.length} 条
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="px-5 py-3">客户</th>
                  <th>客户对账</th>
                  <th>异常原因</th>
                  <th>发生时间</th>
                  <th className="px-5 text-right">处理入口</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payableExceptions.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-red-50/30">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {row.customerName}
                    </td>
                    <td className="py-3 text-slate-600">
                      {row.reconciliationLabel}
                    </td>
                    <td className="max-w-xl py-3 pr-4 text-red-700">
                      {row.reason}
                    </td>
                    <td className="whitespace-nowrap py-3 text-slate-500">
                      {new Date(row.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.customerId ? (
                        <Link
                          href={`/finance/customers/${row.customerId}`}
                          className="text-brand-700 hover:underline"
                        >
                          查看客户对账
                        </Link>
                      ) : (
                        <Link
                          href="/finance"
                          className="text-brand-700 hover:underline"
                        >
                          前往结算中心
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!payableExceptions.length && (
              <p className="p-10 text-center text-sm text-slate-500">
                暂无付款异常记录。
              </p>
            )}
          </div>
        </section>
      )}
      {embeddedUrl && (
        <Modal
          open
          onClose={() => {
            setEmbeddedUrl(null);
            router.refresh();
          }}
          title="财务工作台处理"
          size="xl"
        >
          <iframe
            title="财务工作台内嵌处理"
            src={embeddedUrl}
            className="h-[75vh] w-full rounded-md border border-slate-200 bg-white"
          />
        </Modal>
      )}
      {reviewingBilling && (
        <Modal open onClose={() => !pending && setReviewingBilling(null)} title="审核开票申请" size="md">
          <div className="space-y-4"><div className="grid gap-3 rounded-lg bg-[#faf8ff] p-4 text-sm sm:grid-cols-2"><p><span className="text-xs text-slate-500">申请单</span><br />{reviewingBilling.requestNo}</p><p><span className="text-xs text-slate-500">客户 / 申请人</span><br />{reviewingBilling.customerName} · {reviewingBilling.applicantName}</p><p><span className="text-xs text-slate-500">票据方式</span><br />{reviewingBilling.documentType === "DOMESTIC" ? "国内发票" : "Invoice"} · {reviewingBilling.lineCount} 条</p><p><span className="text-xs text-slate-500">申请金额</span><br />{money(reviewingBilling.requestedAmount, reviewingBilling.currency)}</p><p className="sm:col-span-2"><span className="text-xs text-slate-500">关联合同</span><br />{reviewingBilling.contractNos.join("、") || "—"}</p></div><BillingItemsTable row={reviewingBilling} /><label className="block text-sm"><span className="label">退回原因（选择退回时必填）</span><textarea className="input min-h-24" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="请说明需要申请人补充或修改的内容" /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={pending} onClick={() => setReviewingBilling(null)}>取消</button><button type="button" className="btn-secondary text-rose-700" disabled={pending || reviewReason.trim().length < 2} onClick={() => startTransition(async () => { const result = await decideFinanceRequest("BILLING_REQUEST", reviewingBilling.id, "REJECT", reviewReason); if (!result.ok) setError(result.error ?? "退回失败"); else { setReviewingBilling(null); router.refresh(); } })}>退回申请</button><button type="button" className="btn-primary" disabled={pending} onClick={() => startTransition(async () => { const result = await decideFinanceRequest("BILLING_REQUEST", reviewingBilling.id, "APPROVE"); if (!result.ok) setError(result.error ?? "审核失败"); else { setReviewingBilling(null); router.refresh(); } })}>审核通过</button></div></div>
        </Modal>
      )}
      {reviewingOutgoing && (
        <Modal open onClose={() => !pending && setReviewingOutgoing(null)} title={reviewingOutgoing.kind === "PAYMENT" ? "审核付款申请" : "审核费用报销"} size="md">
          <div className="space-y-4"><div className="grid gap-3 rounded-lg bg-[#faf8ff] p-4 text-sm sm:grid-cols-2"><p><span className="text-xs text-slate-500">申请单</span><br />{reviewingOutgoing.requestNo}</p><p><span className="text-xs text-slate-500">申请人</span><br />{reviewingOutgoing.applicantName}</p><p><span className="text-xs text-slate-500">对象</span><br />{reviewingOutgoing.objectName}</p><p><span className="text-xs text-slate-500">金额</span><br />{money(reviewingOutgoing.amount, reviewingOutgoing.currency)}</p><p className="sm:col-span-2"><span className="text-xs text-slate-500">申请事项</span><br />{reviewingOutgoing.detail}</p></div><label className="block text-sm"><span className="label">退回原因（选择退回时必填）</span><textarea className="input min-h-24" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="请说明需要申请人补充或修改的内容" /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={pending} onClick={() => setReviewingOutgoing(null)}>取消</button><button type="button" className="btn-secondary text-rose-700" disabled={pending || reviewReason.trim().length < 2} onClick={() => startTransition(async () => { const result = await decideFinanceRequest(reviewingOutgoing.kind === "PAYMENT" ? "PAYMENT_REQUEST" : "EXPENSE_CLAIM", reviewingOutgoing.id, "REJECT", reviewReason); if (!result.ok) setError(result.error ?? "退回失败"); else { setReviewingOutgoing(null); router.refresh(); } })}>退回申请</button><button type="button" className="btn-primary" disabled={pending} onClick={() => startTransition(async () => { const result = await decideFinanceRequest(reviewingOutgoing.kind === "PAYMENT" ? "PAYMENT_REQUEST" : "EXPENSE_CLAIM", reviewingOutgoing.id, "APPROVE"); if (!result.ok) setError(result.error ?? "审核失败"); else { setReviewingOutgoing(null); router.refresh(); } })}>审核通过</button></div></div>
        </Modal>
      )}
      {paying && (
        <Modal open onClose={() => !pending && setPaying(null)} title="登记付款并核销" size="sm">
          <div className="space-y-4"><p className="text-sm text-slate-700">{paying.requestNo} · {paying.objectName} · <strong>{money(paying.amount, paying.currency)}</strong></p><label className="block text-sm"><span className="label">付款日期 *</span><input type="date" className="input" value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })} /></label><label className="block text-sm"><span className="label">交易流水号 *</span><input className="input" value={paymentForm.transactionNo} onChange={(event) => setPaymentForm({ ...paymentForm, transactionNo: event.target.value })} /></label><label className="block text-sm"><span className="label">付款回单 *</span><input type="file" multiple className="input mb-2" disabled={uploadingProof || pending} onChange={(event) => void uploadPaymentProofs(Array.from(event.target.files ?? []))} /><textarea className="input min-h-24" value={paymentForm.proofUrls} onChange={(event) => setPaymentForm({ ...paymentForm, proofUrls: event.target.value })} placeholder="也可填写回单 URL，每行一条" />{uploadingProof && <span className="mt-1 block text-xs text-slate-500">正在上传付款回单…</span>}</label><label className="block text-sm"><span className="label">付款备注</span><textarea className="input min-h-20" value={paymentForm.comment} onChange={(event) => setPaymentForm({ ...paymentForm, comment: event.target.value })} /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={pending || uploadingProof} onClick={() => setPaying(null)}>取消</button><button type="button" className="btn-primary" disabled={pending || uploadingProof || !paymentForm.paidAt || !paymentForm.transactionNo.trim() || !paymentForm.proofUrls.trim()} onClick={() => startTransition(async () => { const result = await decideFinanceRequest(paying.kind === "PAYMENT" ? "PAYMENT_REQUEST" : "EXPENSE_CLAIM", paying.id, "PAID", { paidAt: paymentForm.paidAt, transactionNo: paymentForm.transactionNo, proofUrls: paymentForm.proofUrls.split(/[\n,]/).map((item) => item.trim()).filter(Boolean), comment: paymentForm.comment }); if (!result.ok) setError(result.error ?? "付款登记失败"); else { setPaying(null); router.refresh(); } })}>{pending ? "处理中…" : "确认付款并核销"}</button></div></div>
        </Modal>
      )}
      {batchDialog && (
        <Modal open onClose={() => !pending && setBatchDialog(null)} title={batchDialog === "REJECT" ? "批量退回申请" : "批量删除申请"} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">已选择 <strong>{selectedOutgoing.length}</strong> 条记录。{batchDialog === "DELETE" ? "只有未产生付款事实的待审核或已退回记录可以删除。" : "退回原因会分别写入每条申请的审核记录并通知申请人。"}</p>
            <label className="block space-y-1.5 text-sm text-slate-700"><span className="font-medium">{batchDialog === "REJECT" ? "退回原因" : "删除原因"} *</span><textarea className="input min-h-24 resize-y" value={batchReason} onChange={(event) => setBatchReason(event.target.value)} autoFocus placeholder="请填写具体原因" /></label>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={pending} onClick={() => setBatchDialog(null)}>取消</button><button type="button" className="btn-danger" disabled={pending || batchReason.trim().length < 2} onClick={() => batchOutgoing(batchDialog)}>{pending ? "处理中…" : "确认"}</button></div>
          </div>
        </Modal>
      )}
      {billingBatchDialog && (
        <Modal open onClose={() => !pending && setBillingBatchDialog(null)} title={billingBatchDialog === "REJECT" ? "批量退回开票申请" : "批量删除开票申请"} size="sm">
          <div className="space-y-4"><p className="text-sm text-slate-700">已选择 <strong>{selectedBilling.length}</strong> 条开票申请。操作结果会同步到申请人的财务流程记录和站内信。</p><label className="block space-y-1.5 text-sm text-slate-700"><span className="font-medium">{billingBatchDialog === "REJECT" ? "退回原因" : "删除原因"} *</span><textarea className="input min-h-24 resize-y" value={billingBatchReason} onChange={(event) => setBillingBatchReason(event.target.value)} autoFocus /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={pending} onClick={() => setBillingBatchDialog(null)}>取消</button><button type="button" className="btn-danger" disabled={pending || billingBatchReason.trim().length < 2} onClick={() => batchBilling(billingBatchDialog)}>{pending ? "处理中…" : "确认"}</button></div></div>
        </Modal>
      )}
      {deleting && (
        <Modal
          open
          onClose={() => !pending && setDeleting(null)}
          title="删除开票申请"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              将删除申请 <strong>{deleting.requestNo}</strong>
              。关联票据和应收入口会隐藏，财务历史与审计日志仍保留。
            </p>
            {deleting.status !== "SUBMITTED" && (
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium">删除原因 *</span>
                <textarea
                  className="input min-h-24 resize-y"
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  placeholder="说明删除原因，便于后续审计"
                  autoFocus
                />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => setDeleting(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={
                  pending ||
                  (deleting.status !== "SUBMITTED" &&
                    deleteReason.trim().length < 2)
                }
                onClick={remove}
              >
                {pending ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BillingItemsTable({ row }: { row: BillingRow }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-[#e7e0ef] bg-white">
      <table className="w-full min-w-[680px] text-sm">
        <thead><tr className="border-b bg-[#faf8ff] text-left text-xs text-slate-500"><th className="px-3 py-2">开票明细</th><th>费用期间</th><th className="text-right">数量</th><th className="text-right">单价</th><th className="text-right">税率</th><th className="px-3 text-right">金额</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{row.items.map((item, index) => <tr key={`${item.description}-${index}`}><td className="px-3 py-2 font-medium text-slate-800">{item.description}</td><td>{item.period || "—"}</td><td className="text-right">{item.quantity}</td><td className="text-right">{money(item.unitPrice, row.currency)}</td><td className="text-right">{item.taxRate == null ? "不适用" : `${(item.taxRate * 100).toFixed(2)}%`}</td><td className="px-3 text-right font-medium">{money(item.amount, row.currency)}</td></tr>)}</tbody>
      </table>
      {!row.items.length && <p className="p-4 text-center text-sm text-slate-500">暂无开票明细。</p>}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {children}
    </button>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-40 flex-1 px-4 py-1 first:pl-0 last:pr-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
