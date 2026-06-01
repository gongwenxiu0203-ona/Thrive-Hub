"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogOut, ChevronDown, Settings, Bell } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/utils";

export function Topbar({
  name,
  role,
  email,
  unreadCount = 0,
}: {
  name: string;
  role: string;
  email: string;
  unreadCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-white px-6">
      {/* Bell icon */}
      <Link href="/reminders"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials(name)}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-800">{name}</p>
            <p className="text-[11px] text-slate-400">
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>

        {open && (
          <div className="absolute right-0 top-12 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-medium text-slate-800">{name}</p>
              <p className="text-xs text-slate-400">{email}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4" />
              账号设置
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
