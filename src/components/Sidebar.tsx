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

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "\u5de5\u4f5c\u6d41",
    items: [
      { href: "/dashboard", label: "\u5de5\u4f5c\u53f0", icon: LayoutDashboard },
      { href: "/customers", label: "\u5ba2\u6237\u7ba1\u7406", icon: Users },
      { href: "/contracts", label: "\u5408\u540c\u7ba1\u7406", icon: FileText },
      { href: "/projects", label: "\u9879\u76ee\u7ba1\u7406", icon: FolderKanban },
    ],
  },
  {
    label: "\u6570\u636e\u4e0e\u8d44\u6e90",
    items: [
      { href: "/bi", label: "\u63a8\u5e7f\u6570\u636e BI", icon: BarChart3 },
      { href: "/affiliates", label: "\u8054\u76df\u8d44\u6e90\u5e93", icon: Handshake },
    ],
  },
  {
    label: "\u8d22\u52a1\u4e0e\u7ecf\u8425",
    items: [
      { href: "/finance", label: "\u8d22\u52a1\u5bf9\u8d26", icon: Receipt },
      { href: "/operations", label: "\u7ecf\u8425\u7ba1\u7406", icon: TrendingUp },
    ],
  },
];

export function Sidebar({ role = "", userId = "" }: { role?: string; userId?: string }) {
  const pathname = usePathname();
  const visibleHrefs = visibleNavForRole(role);
  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: visibleHrefs
      ? group.items.filter((item) => visibleHrefs.includes(item.href))
      : group.items,
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[#e7e0ef] bg-[#fbfaff]">
      <div className="flex h-16 items-center gap-2 border-b border-[#e7e0ef] px-5">
        <div className="flex h-8 w-8 items-center justify-center">
          <img src="/thraive-logo.png" alt="Thraive" className="h-8 w-8 object-contain" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Thraive {"\u8054\u76df\u8425\u9500\u7cfb\u7edf"}</p>
          <p className="text-[11px] text-slate-400">Affiliate Marketing</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group, groupIndex) => (
          <section key={group.label} className={groupIndex === 0 ? "" : "mt-5"}>
            <p className="mb-2 px-3 text-[11px] font-semibold text-slate-400">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-transparent bg-brand-50/80 text-brand-700 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r before:bg-brand-600"
                        : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="space-y-1 border-t border-[#e7e0ef] px-3 py-4">
        {isStaff(role) && userId && <InviteButton userId={userId} />}
        {isStaff(role) && (
          <Link
            href="/recycle-bin"
            className={cn(
              "relative flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/recycle-bin"
                ? "bg-brand-50/80 text-brand-700 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r before:bg-brand-600"
                : "text-slate-600 hover:bg-white",
            )}
          >
            <Trash2 className="h-[18px] w-[18px]" />
            {"\u56de\u6536\u7ad9"}
          </Link>
        )}
        <Link
          href="/intake"
          target="_blank"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
        >
          <Link2 className="h-[18px] w-[18px]" />
          {"\u5ba2\u6237\u95e8\u6237\u8868\u5355"}
        </Link>
        {role === "ADMIN" && (
          <Link
            href="/admin"
            className={cn(
              "relative flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/admin" || pathname.startsWith("/admin/")
                ? "bg-brand-50/80 text-brand-700 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r before:bg-brand-600"
                : "text-slate-600 hover:bg-white",
            )}
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
            {"\u7ba1\u7406\u5458\u9762\u677f"}
          </Link>
        )}
      </div>
    </aside>
  );
}

function InviteButton({ userId }: { userId: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined"
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
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
      >
        <UserPlus className="h-[18px] w-[18px]" />
        {"\u9080\u8bf7\u6ce8\u518c"}
      </button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">{"\u6211\u7684\u9080\u8bf7\u94fe\u63a5"}</h2>
            <p className="mb-4 text-xs text-slate-500">{"\u53d1\u9001\u7ed9\u88ab\u9080\u8bf7\u4eba\uff0c\u5bf9\u65b9\u6ce8\u518c\u6210\u529f\u540e\u4f1a\u663e\u793a\u4f60\u4e3a\u9080\u8bf7\u4eba\u3002"}</p>
            <div className="flex items-center gap-2 rounded-md border border-[#e7e0ef] bg-[#faf8ff] px-3 py-2">
              <span className="flex-1 truncate text-sm text-slate-700">{url}</span>
              <button type="button" onClick={copy} aria-label="\u590d\u5236\u9080\u8bf7\u94fe\u63a5" className="shrink-0 rounded p-1 hover:bg-brand-100">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
              </button>
            </div>
            {copied && <p className="mt-2 text-xs text-emerald-600">{"\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f"}</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setShow(false)}>{"\u5173\u95ed"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
