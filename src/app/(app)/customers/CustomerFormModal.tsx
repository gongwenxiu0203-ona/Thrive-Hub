"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  CustomerSectionFields,
  type CustomerSectionDefaults,
} from "@/components/CustomerSectionFields";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { RATING_LABELS, AMAZON_CATEGORIES, CUSTOMER_STATUS_LABELS } from "@/lib/constants";
import { toInputDate } from "@/lib/utils";

type UserOption = { id: string; name: string };

export type CustomerEditData = CustomerSectionDefaults & {
  id: string;
  category?: string | null;
  rating?: string;
  businessOwnerId?: string | null;
  backendOwnerId?: string | null;
};

export function CustomerFormModal({
  users,
  customer,
  trigger = "button",
  includeInternal = true,
}: {
  users: UserOption[];
  customer?: CustomerEditData;
  trigger?: "button" | "link";
  includeInternal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!customer;

  function onSubmit(fd: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = isEdit
        ? await updateCustomer(customer!.id, fd)
        : await createCustomer(fd);
      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          // Surface the first invalid field.
          const first = formRef.current?.querySelector(
            "[name='brandName']",
          ) as HTMLElement | null;
          first?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (result.error) setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {trigger === "button" ? (
        <button className="btn-primary" onClick={() => setOpen(true)}>
          {isEdit ? (
            <>
              <Pencil className="h-4 w-4" /> 编辑
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> 新建客户
            </>
          )}
        </button>
      ) : (
        <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> 编辑
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "编辑客户" : "新建客户"}
        wide
      >
        <form action={onSubmit} ref={formRef} className="space-y-4">
          <CustomerSectionFields defaults={customer} errors={fieldErrors} />

          {/* 内部管理字段 */}
          {includeInternal && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-800">
              内部管理信息
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label text-xs">品类（亚马逊分类）</label>
                <select
                  name="category"
                  className="input"
                  defaultValue={customer?.category ?? ""}
                >
                  <option value="">请选择品类</option>
                  {AMAZON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">客户评估定级</label>
                <select
                  name="rating"
                  className="input"
                  defaultValue={customer?.rating ?? "PENDING"}
                >
                  {Object.entries(RATING_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">商务负责人</label>
                <select
                  name="businessOwnerId"
                  className="input"
                  defaultValue={customer?.businessOwnerId ?? ""}
                >
                  <option value="">未分配</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">后端负责人</label>
                <select
                  name="backendOwnerId"
                  className="input"
                  defaultValue={customer?.backendOwnerId ?? ""}
                >
                  <option value="">未分配</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* 新增客户时可直接设置合作状态 + Demo方案截止日期 */}
              {!isEdit && (
                <>
                  <div>
                    <label className="label text-xs">客户合作状态</label>
                    <select name="status" className="input" defaultValue="">
                      <option value="">自动（按是否分配负责人）</option>
                      {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Demo方案截止日期</label>
                    <input
                      type="date"
                      name="demoDueDate"
                      className="input"
                      min={toInputDate(new Date())}
                    />
                  </div>
                </>
              )}
            </div>
            {!isEdit && (
              <p className="mt-2 text-xs text-slate-400">
                选择商务负责人将自动创建「客户会议预约」任务；选择后端负责人将自动创建「Demo方案制定」任务（使用上方截止日期，创建后无需在详情页二次选择）。
              </p>
            )}
          </section>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
