"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileDown, FilePenLine, Plus, Trash2, Upload } from "lucide-react";
import {
  setInvoiceStatus,
  softDeleteInvoice,
  type InvoiceListItem,
} from "@/actions/invoices";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import { createReceivableForArchivedInvoice, uploadInvoiceArchive } from "@/actions/invoiceArchive";
import { FilterBar, SearchFilter } from "@/components/ui/Filters";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { useSearchParams } from "next/navigation";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ISSUED: "已开具",
  VOID: "已作废",
};

export function InvoiceListClient({
  invoices,
  canEdit,
  canManage,
  archiveOptions,
}: {
  invoices: InvoiceListItem[];
  canEdit: boolean;
  canManage: boolean;
  archiveOptions: null | { customers: { id: string; brandName: string }[]; contracts: { id: string; customerId: string; contractNo: string }[] };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCustomerId, setUploadCustomerId] = useState("");
  const [receivableInvoiceId, setReceivableInvoiceId] = useState<string | null>(null);
  const csv = (key: string) => (params.get(key) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const invoiceNos = csv("invoiceNo");
  const customers = csv("customer");
  const contracts = csv("contract");
  const feeTypes = csv("feeType");
  const invoiceDates = csv("invoiceDate");
  const statuses = csv("status");
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const filteredInvoices = invoices.filter((invoice) =>
    (!invoiceNos.length || invoiceNos.includes(invoice.invoiceNo)) &&
    (!customers.length || customers.includes(invoice.customerName)) &&
    (!contracts.length || contracts.includes(invoice.contractNo ?? "")) &&
    (!feeTypes.length || feeTypes.includes(invoice.feeType)) &&
    (!invoiceDates.length || invoiceDates.includes(invoice.invoiceDate.slice(0, 10))) &&
    (!statuses.length || statuses.includes(invoice.status)) &&
    (!query || [invoice.invoiceNo, invoice.customerName, invoice.contractNo ?? ""].some((value) => value.toLowerCase().includes(query)))
  );
  const option = (values: string[], label?: (value: string) => string) => [...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: label?.(value) ?? value }));
  const currencyTotals = [...filteredInvoices.reduce((totals, invoice) => {
    for (const item of invoice.currencyTotals) totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amount);
    return totals;
  }, new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b));

  function remove(id: string) {
    if (!window.confirm("确认将这张 Invoice 移入回收状态？历史业务数据不会立即清除。")) return;
    startTransition(async () => {
      try {
        const result = await softDeleteInvoice(id);
        setMessage(result.ok ? "Invoice 已移除。" : result.error ?? "移除失败。");
        if (result.ok) router.refresh();
      } catch (error) {
        console.error("[invoice-list] remove failed", error);
        setMessage("移除请求失败，请检查网络后重试。");
      }
    });
  }

  function voidInvoice(id: string) {
    if (!window.confirm("确认作废这张已开具的 Invoice？")) return;
    startTransition(async () => {
      try {
        const result = await setInvoiceStatus(id, "VOID");
        setMessage(result.ok ? "Invoice 已作废。" : result.error ?? "作废失败。");
        if (result.ok) router.refresh();
      } catch (error) {
        console.error("[invoice-list] void failed", error);
        setMessage("作废请求失败，请检查网络后重试。");
      }
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="开票与收款"
        description="统一查看 Invoice 开具记录、文件与状态。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <button type="button" className="btn-secondary" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4" /> 上传 Invoice
                </button>
                <Link href="/invoices/new" className="btn-primary">
                  <Plus className="h-4 w-4" /> 新建 Invoice
                </Link>
              </>
            )}
          </div>
        )}
      />
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6" aria-label="开票与收款视图">
          <Link href="/invoices" aria-current="page" className="border-b-2 border-brand-600 pb-3 text-sm font-medium text-brand-700">Invoice</Link>
        </nav>
      </div>


      <FilterBar>
        <SearchFilter placeholder="搜索 Invoice 编号、客户或合同" />
        <MultiSelectFilter paramKey="invoiceNo" placeholder="Invoice 编号" options={option(invoices.map((row) => row.invoiceNo))} />
        <MultiSelectFilter paramKey="customer" placeholder="客户" options={option(invoices.map((row) => row.customerName))} />
        <MultiSelectFilter paramKey="contract" placeholder="合同编号" options={option(invoices.map((row) => row.contractNo ?? ""))} />
        <MultiSelectFilter paramKey="feeType" placeholder="费用类型" options={option(invoices.map((row) => row.feeType), (value) => value === "SALES_COMMISSION" ? "销售佣金" : value === "MIXED" ? "混合费用" : "月度服务费")} />
        <MultiSelectFilter paramKey="invoiceDate" placeholder="Invoice 日期" options={option(invoices.map((row) => row.invoiceDate.slice(0, 10)))} />
        <MultiSelectFilter paramKey="status" placeholder="状态" options={option(invoices.map((row) => row.status), (value) => STATUS_LABELS[value] ?? value)} />
      </FilterBar>

      {message && (
        <div role="status" className="rounded-lg border border-[#e7e0ef] bg-white px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      {filteredInvoices.length === 0 ? (
        <EmptyState
          title="暂无 Invoice"
          description="选择客户和合同后创建第一张 Invoice。"
          action={canEdit ? <Link href="/invoices/new" className="btn-primary">新建 Invoice</Link> : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="data min-w-[1050px]">
            <thead>
              <tr>
                <th>Invoice 编号</th>
                <th>客户</th>
                <th>合同</th>
                <th>期间</th>
                <th>费用类型</th>
                <th>Invoice 日期</th>
                <th>到期日</th>
                <th className="text-right">金额</th>
                <th>状态</th>
                <th>创建人</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link href={`/invoices/${invoice.id}`} className="font-medium text-brand-700 hover:underline">
                      {invoice.invoiceNo}
                    </Link>
                  </td>
                  <td>{invoice.customerName}</td>
                  <td>{invoice.contractNo}</td>
                  <td>{invoice.periodLabel}</td>
                  <td>
                    {invoice.feeType === "SALES_COMMISSION"
                      ? "销售佣金"
                      : invoice.feeType === "MIXED"
                        ? "混合费用"
                        : "月度服务费"}
                  </td>
                  <td>{formatDate(invoice.invoiceDate)}</td>
                  <td>{formatDate(invoice.dueDate)}</td>
                  <td className="text-right font-medium tabular-nums">
                    <div className="space-y-0.5">
                      {invoice.currencyTotals.map((entry) => (
                        <div key={entry.currency}>
                          {entry.currency} {entry.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td><StatusBadge status={invoice.status} /></td>
                  <td>{invoice.createdByName}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        aria-label={`编辑 ${invoice.invoiceNo}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        <FilePenLine className="h-4 w-4" />
                      </Link>
                      <a
                        href={invoice.originalFileUrl ? `${invoice.originalFileUrl}?download=1` : `/api/invoices/${invoice.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`下载 ${invoice.invoiceNo}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        <FileDown className="h-4 w-4" />
                      </a>
                      {canEdit && invoice.archiveOnly && !invoice.accountsReceivableId && (
                        <button type="button" className="btn-secondary h-9 px-2 text-xs" onClick={() => setReceivableInvoiceId(invoice.id)}>
                          创建应收
                        </button>
                      )}
                      {canManage && invoice.status === "ISSUED" && (
                        <button
                          type="button"
                          onClick={() => voidInvoice(invoice.id)}
                          aria-label={`作废 ${invoice.invoiceNo}`}
                          disabled={pending}
                          className="inline-flex h-9 items-center justify-center rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                          作废
                        </button>
                      )}
                      {canManage && invoice.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={() => remove(invoice.id)}
                          aria-label={`删除 ${invoice.invoiceNo}`}
                          disabled={pending}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {currencyTotals.length > 0 && (
        <section className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="当前筛选结果金额汇总">
          <span className="text-sm text-slate-500">当前筛选结果 · {filteredInvoices.length} 张 Invoice</span>
          {currencyTotals.map(([currency, amount]) => <span key={currency} className="text-sm font-semibold tabular-nums text-slate-900">{currency} {amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>)}
        </section>
      )}

      {uploadOpen && archiveOptions && (
        <Modal title="上传 Invoice 原件" onClose={() => setUploadOpen(false)}>
          <form action={(fd) => startTransition(async () => {
            const result = await uploadInvoiceArchive(fd);
            setMessage(result.ok ? "Invoice 已存档，不会自动创建应收账款。" : result.error ?? "上传失败。");
            if (result.ok) { setUploadOpen(false); setUploadCustomerId(""); router.refresh(); }
          })} className="space-y-4">
            <Field label="Invoice 编号"><input className="input" name="invoiceNo" required /></Field>
            <Field label="关联客户"><select className="input" name="customerId" required value={uploadCustomerId} onChange={(e) => setUploadCustomerId(e.target.value)}><option value="">请选择客户</option>{archiveOptions.customers.map((item) => <option key={item.id} value={item.id}>{item.brandName}</option>)}</select></Field>
            <Field label="关联合同"><select className="input" name="contractId" required disabled={!uploadCustomerId}><option value="">请选择合同</option>{archiveOptions.contracts.filter((item) => item.customerId === uploadCustomerId).map((item) => <option key={item.id} value={item.id}>{item.contractNo}</option>)}</select></Field>
            <Field label="Invoice 文件"><input className="input" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>取消</Button><Button type="submit" disabled={pending}>上传并存档</Button></div>
          </form>
        </Modal>
      )}

      {receivableInvoiceId && (
        <Modal title="手动创建应收账款" onClose={() => setReceivableInvoiceId(null)}>
          <form action={(fd) => startTransition(async () => {
            const result = await createReceivableForArchivedInvoice(receivableInvoiceId, {
              amount: Number(fd.get("amount")), currency: String(fd.get("currency") ?? "USD"),
              dueDate: String(fd.get("dueDate") ?? ""), exchangeRate: Number(fd.get("exchangeRate") ?? 1), remark: String(fd.get("remark") ?? ""),
            });
            setMessage(result.ok ? "应收账款已创建。" : result.error ?? "创建失败。");
            if (result.ok) { setReceivableInvoiceId(null); router.refresh(); }
          })} className="grid gap-4 sm:grid-cols-2">
            <Field label="应收金额"><input className="input" name="amount" type="number" min="0.01" step="0.01" required /></Field>
            <Field label="币种"><select className="input" name="currency" defaultValue="USD">{["USD","CNY","EUR","GBP","HKD","JPY","CAD","AUD","SGD"].map((code) => <option key={code}>{code}</option>)}</select></Field>
            <Field label="到期日"><input className="input" name="dueDate" type="date" required /></Field>
            <Field label="折本位币汇率"><input className="input" name="exchangeRate" type="number" min="0.000001" step="0.000001" defaultValue="1" required /></Field>
            <div className="sm:col-span-2"><Field label="备注"><textarea className="input min-h-24" name="remark" /></Field></div>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => setReceivableInvoiceId(null)}>取消</Button><Button type="submit" disabled={pending}>确认创建</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900">关闭</button></div>{children}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "badge",
      status === "ISSUED"
        ? "bg-emerald-100 text-emerald-700"
        : status === "VOID"
          ? "bg-slate-200 text-slate-600"
          : "bg-amber-100 text-amber-700",
    )}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
