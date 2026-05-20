"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BarChart3, List, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import AffiliateDashboard from "./AffiliateDashboard";
import AffiliateListTab from "./AffiliateListTab";
import AffiliateUploadTab from "./AffiliateUploadTab";
import AffiliateFormModal from "./AffiliateFormModal";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "dashboard", label: "概览面板", icon: BarChart3 },
  { key: "list", label: "资源列表", icon: List },
  { key: "upload", label: "批量导入", icon: Upload },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Options {
  sources: string[];
  categories: string[];
  types: string[];
  tags: string[];
  brands: string[];
  statuses: string[];
  modes: string[];
  names: string[];
  pics: string[];
  users: { id: string; name: string }[];
  customers: { id: string; brandName: string }[];
}

interface Props {
  options: Options;
  dashData: unknown;
  currentUserId: string;
}

export default function AffiliatesClient({ options, currentUserId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // Tab state is URL-backed so browser back/forward preserves it
  // (and detail-page Back returns to the list tab, not the dashboard default).
  const tabParam = sp.get("tab");
  const tab: TabKey = (TABS.some((t) => t.key === tabParam) ? tabParam : "dashboard") as TabKey;
  function setTab(key: TabKey) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`);
  }
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <PageHeader
        title="联盟资源库"
        description="管理联盟商资源，记录各平台链接、粉丝数、合作模式和开发状态"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm"
          >
            + 新增联盟商
          </button>
        }
      />

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && <AffiliateDashboard options={options} />}
      {tab === "list" && <AffiliateListTab options={options} />}
      {tab === "upload" && (
        <AffiliateUploadTab
          users={options.users}
          onComplete={() => {
            setTab("list");
            router.refresh();
          }}
        />
      )}

      {showCreate && (
        <AffiliateFormModal
          users={options.users}
          customers={options.customers}
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
