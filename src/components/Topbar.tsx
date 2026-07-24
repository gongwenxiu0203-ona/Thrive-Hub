"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronDown, Settings, Bell, Menu } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/utils";

const PAGE_LABELS = [
  ["/customers", "\u5ba2\u6237\u7ba1\u7406"],
  ["/contracts", "\u5408\u540c\u7ba1\u7406"],
  ["/projects", "\u9879\u76ee\u7ba1\u7406"],
  ["/bi", "\u63a8\u5e7f\u6570\u636e BI"],
  ["/affiliates", "\u8054\u76df\u8d44\u6e90\u5e93"],
  ["/finance", "\u8d22\u52a1\u5bf9\u8d26"],
  ["/invoices", "Invoice \u5f00\u5177"],
  ["/operations", "\u7ecf\u8425\u7ba1\u7406"],
  ["/dashboard", "\u5de5\u4f5c\u53f0"],
] as const;

export function Topbar({ name, role, email, unreadCount = 0, menuOpen = false, onMenuOpen }: {
  name: string;
  role: string;
  email: string;
  unreadCount?: number;
  menuOpen?: boolean;
  onMenuOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const pageLabel = useMemo(
    () => PAGE_LABELS.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ?? "\u5de5\u4f5c\u53f0",
    [pathname],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[#e7e0ef] bg-white px-2 sm:gap-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <button
          type="button"
          aria-label={"\u6253\u5f00\u5bfc\u822a\u83dc\u5355"}
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          onClick={onMenuOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-700">{pageLabel}</p>
          <p className="hidden text-xs text-slate-400 sm:block">Thraive {"\u5de5\u4f5c\u53f0"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/reminders"
          aria-label="\u63d0\u9192"
          className="relative flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={ref}>
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials(name)}</div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-slate-800">{name}</p>
              <p className="text-[11px] text-slate-400">{ROLE_LABELS[role] ?? role}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {open && (
            <div className="absolute right-0 top-12 z-30 w-52 rounded-md border border-[#e7e0ef] bg-white py-1 shadow-lg">
              <div className="border-b border-[#f0ecf4] px-3 py-2">
                <p className="text-sm font-medium text-slate-800">{name}</p>
                <p className="text-xs text-slate-400">{email}</p>
              </div>
              <Link href="/settings" onClick={() => setOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-brand-50">
                <Settings className="h-4 w-4" /> {"\u8d26\u53f7\u8bbe\u7f6e"}
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-brand-50">
                  <LogOut className="h-4 w-4" /> {"\u9000\u51fa\u767b\u5f55"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
