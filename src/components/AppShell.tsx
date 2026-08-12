"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import type { PermLevel } from "@/lib/featurePermissions";

type AppShellProps = {
  children: React.ReactNode;
  name: string;
  role: string;
  email: string;
  userId: string;
  unreadCount: number;
  canViewReminders: boolean;
  permissions: Record<string, PermLevel>;
};

export function AppShell({ children, name, role, email, userId, unreadCount, canViewReminders, permissions }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#fbfaff]">
      <Sidebar
        userId={userId}
        permissions={permissions}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {sidebarOpen && (
        <button
          type="button"
          aria-label="关闭导航菜单"
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <Topbar
          name={name}
          role={role}
          email={email}
          unreadCount={unreadCount}
          canViewReminders={canViewReminders}
          menuOpen={sidebarOpen}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto overscroll-contain bg-[#fbfaff] p-4 sm:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
