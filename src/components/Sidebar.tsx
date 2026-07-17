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
  ShieldCheck,
  Receipt,
  UserPlus,
  Copy,
  Check,
  Trash2,
  FolderKanban,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleNavForRole, isStaff } from "@/lib/permissions";
import { IntakeLinkButton } from "@/components/IntakeLinkButton";
import { Modal } from "@/components/ui/Modal";

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

export function Sidebar({
  role = "",
  userId = "",
  mobileOpen = false,
  onMobileClose,
}: {
  role?: string;
  userId?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const visibleHrefs = visibleNavForRole(role);
  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: visibleHrefs
      ? group.items.filter((item) => visibleHrefs.includes(item.href))
      : group.items,
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      id="mobile-navigation"
      aria-label="主导航"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-[#e7e0ef] bg-[#fbfaff] shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:w-64 md:translate-x-0 md:shadow-none",
        mobileOpen
          ? "visible translate-x-0"
          : "invisible -translate-x-full pointer-events-none md:visible md:pointer-events-auto",
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-[#e7e0ef] px-5">
        <div className="flex h-8 w-8 items-center justify-center">
          <img src="/thraive-logo.png" alt="Thraive" className="h-8 w-8 object-contain" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Thraive {"\u8054\u76df\u8425\u9500\u7cfb\u7edf"}</p>
          <p className="text-[11px] text-slate-400">Affiliate Marketing</p>
        </div>
        <button
          type="button"
          aria-label="关闭导航菜单"
          onClick={onMobileClose}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
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
                    onClick={onMobileClose}
                    className={cn(
                      "relative flex min-h-11 items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
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
            onClick={onMobileClose}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/recycle-bin"
                ? "bg-brand-50/80 text-brand-700 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r before:bg-brand-600"
                : "text-slate-600 hover:bg-white",
            )}
          >
            <Trash2 className="h-[18px] w-[18px]" />
            {"\u56de\u6536\u7ad9"}
          </Link>
        )}
        {(isStaff(role) || role === "CHANNEL") && <IntakeLinkButton compact />}
        {role === "ADMIN" && (
          <Link
            href="/admin"
            onClick={onMobileClose}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
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
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
      >
        <UserPlus className="h-[18px] w-[18px]" />
        {"\u9080\u8bf7\u6ce8\u518c"}
      </button>
      <Modal
        open={show}
        onClose={() => setShow(false)}
        title={"\u6211\u7684\u9080\u8bf7\u94fe\u63a5"}
        description={"\u53d1\u9001\u7ed9\u88ab\u9080\u8bf7\u4eba\uff0c\u5bf9\u65b9\u6ce8\u518c\u6210\u529f\u540e\u4f1a\u663e\u793a\u4f60\u4e3a\u9080\u8bf7\u4eba\u3002"}
        size="sm"
        footer={(
          <button type="button" className="btn-secondary text-sm" onClick={() => setShow(false)}>
            {"\u5173\u95ed"}
          </button>
        )}
      >
        <div className="flex items-center gap-2 rounded-md border border-[#e7e0ef] bg-[#faf8ff] px-3 py-2">
          <span className="flex-1 truncate text-sm text-slate-700">{url}</span>
          <button
            type="button"
            onClick={copy}
            aria-label="\u590d\u5236\u9080\u8bf7\u94fe\u63a5"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
          </button>
        </div>
        {copied && <p className="mt-2 text-xs text-emerald-600">{"\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f"}</p>}
      </Modal>
    </>
  );
}
