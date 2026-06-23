"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Handshake,
  Link2,
  ShieldCheck,
  Receipt,
  UserPlus,
  Copy,
  Check,
  Trash2,
  FolderKanban,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleNavForRole, isStaff } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// /tasks 和 /worklogs 不再作为一级导航入口（页面和数据保留），收入工作台 tab。
const NAV: NavItem[] = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/customers", label: "客户管理", icon: Users },
  { href: "/contracts", label: "合同管理", icon: FileText },
  { href: "/finance", label: "财务对账", icon: Receipt },
  { href: "/operations", label: "经营管理", icon: TrendingUp },
  { href: "/projects", label: "项目管理", icon: FolderKanban },
  { href: "/bi", label: "推广数据BI", icon: BarChart3 },
  { href: "/affiliates", label: "联盟资源库", icon: Handshake },
];

export function Sidebar({
  role = "",
  userId = "",
}: {
  role?: string;
  userId?: string;
}) {
  const pathname = usePathname();
  const visibleHrefs = visibleNavForRole(role);
  const navItems = visibleHrefs
    ? NAV.filter((n) => visibleHrefs.includes(n.href))
    : NAV;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <div className="flex h-8 w-8 items-center justify-center">
          <img src="/thraive-logo.png" alt="Thraive" className="h-8 w-8 object-contain" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Thraive联盟营销系统</p>
          <p className="text-[11px] text-slate-400">Affiliate Marketing</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-3 py-4 space-y-1">
        {role === "ADMIN" && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/admin" || pathname.startsWith("/admin/")
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
            管理员面板
          </Link>
        )}
        {isStaff(role) && userId && <InviteButton userId={userId} />}
        {isStaff(role) && (
          <Link
            href="/recycle-bin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/recycle-bin"
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Trash2 className="h-[18px] w-[18px]" />
            回收站
          </Link>
        )}
        <Link
          href="/intake"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <Link2 className="h-[18px] w-[18px]" />
          客户门户表单
        </Link>
      </div>
    </aside>
  );
}

// 邀请注册按钮：复制带邀请人参数的注册链接
function InviteButton({ userId }: { userId: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/register?inviter=${userId}`
      : `/register?inviter=${userId}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShow(true)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <UserPlus className="h-[18px] w-[18px]" />
        邀请注册
      </button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              我的邀请链接
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              发送给被邀请人，他们注册成功后会显示「邀请人：你的姓名」
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="flex-1 truncate text-sm text-slate-700">
                {url}
              </span>
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded p-1 hover:bg-slate-200"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4 text-slate-500" />
                )}
              </button>
            </div>
            {copied && (
              <p className="mt-2 text-xs text-emerald-600">已复制到剪贴板</p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setShow(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
