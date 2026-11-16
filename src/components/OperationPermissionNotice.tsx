"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

/** Descriptive only: authorization remains enforced by the server actions/APIs. */
export function OperationPermissionNotice() {
  const path = usePathname();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360 });
  function cancelClose() { if (timer.current) clearTimeout(timer.current); }
  function show() {
    cancelClose();
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, window.innerWidth - 24);
    setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width });
    setOpen(true);
  }
  function hideSoon() { cancelClose(); timer.current = setTimeout(() => setOpen(false), 150); }
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest(`[data-permission-help="${id}"]`)) close(); };
    window.addEventListener("resize", close);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", close); document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [open, id]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  let text = "";
  if (path === "/bi") text = "批次删除和数据清理允许管理员及内部员工操作，需要“批量操作与数据清理”的编辑及以上权限；只读、禁用及外部账号不可操作。批次删除进入回收站，数据清理须先筛选并预览影响范围。";
  else if (path === "/contracts/templates") text = "上传、删除和恢复合同模板仅限管理员。";
  else if (path.startsWith("/contracts/")) text = "删除或终止整份合同、自动盖章、修改合同编号，以及修改确认书编号仅限管理员；合同签署完成后删除确认书草稿也仅限管理员。指定审核人仍可处理自己的审核任务。";
  else if (path === "/contracts") text = "删除或终止整份合同、自动盖章和修改合同编号仅限管理员。项目确认书的创建、替换和单独终止按原功能授权执行。";
  else if (path.startsWith("/invoices")) text = "修改 Invoice 编号仅限管理员；开具、作废和删除另按功能权限及票据状态判断。";
  else if (path.startsWith("/finance")) text = "删除付款/报销申请、删除已确认或已结算的客户对账、恢复作废的客户对账仅限管理员。删除开票申请按功能管理权限及开票/收款状态判断，并非仅限管理员。";
  else if (path === "/recycle-bin") text = "彻底删除仅限管理员，且不可恢复；恢复记录另按对应模块管理权限判断。";
  else if (path === "/affiliates") text = "联盟资源清理仅限管理员；日常维护按联盟资源功能授权执行。";
  else if (path === "/admin") text = "用户移交与移除、财务审批默认配置、邮件配置和系统错误查询等管理操作仅限管理员，并仍需对应功能权限。";
  if (!text) return null;
  return (
    <span className="inline-flex shrink-0 align-top" data-permission-help={id}>
      <button ref={trigger} type="button" aria-label="查看操作权限说明" aria-describedby={open ? id : undefined}
        onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={hideSoon}
        onClick={show}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && createPortal(
        <span id={id} role="tooltip" data-permission-help={id} onMouseEnter={cancelClose} onMouseLeave={hideSoon}
          className="fixed z-50 block overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-normal leading-6 text-slate-700"
          style={{ ...position, maxHeight: `calc(100dvh - ${position.top + 12}px)` }}>
          <span className="mb-1 block font-semibold text-slate-900">操作权限说明</span>{text}
          <span className="mt-2 block text-xs leading-5 text-slate-600">管理员专属操作不会因普通功能授权而开放；其他操作还受功能权限、记录状态和数据范围限制。</span>
        </span>, document.body)}
    </span>
  );
}
