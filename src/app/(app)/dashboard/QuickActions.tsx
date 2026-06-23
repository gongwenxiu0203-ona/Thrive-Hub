import Link from "next/link";
import { Plus, KanbanSquare, BookOpen, UserPlus, FileText } from "lucide-react";

/** 快捷创建：4 个常用入口。无内嵌弹窗，直接路由到对应创建页/页面顶部的创建按钮。 */
export function QuickActions() {
  return (
    <section className="card mt-6 p-5">
      <div className="mb-3 flex items-center gap-2 text-slate-600">
        <Plus className="h-4 w-4" />
        <h2 className="text-sm font-semibold">快捷创建</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Action href="/tasks" label="新建任务" icon={<KanbanSquare className="h-5 w-5" />} accent="text-amber-600 bg-amber-50" />
        <Action href="/worklogs" label="写工作日志" icon={<BookOpen className="h-5 w-5" />} accent="text-sky-600 bg-sky-50" />
        <Action href="/customers" label="新建客户" icon={<UserPlus className="h-5 w-5" />} accent="text-emerald-600 bg-emerald-50" />
        <Action href="/contracts/new" label="新建合同" icon={<FileText className="h-5 w-5" />} accent="text-indigo-600 bg-indigo-50" />
      </div>
    </section>
  );
}

function Action({ href, label, icon, accent }: { href: string; label: string; icon: React.ReactNode; accent: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-400">→ 跳转到对应页面</p>
      </div>
    </Link>
  );
}
