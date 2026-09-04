import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CircleDollarSign,
  FileCheck2,
  FolderKanban,
  Lightbulb,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireSession } from "@/lib/session";

export const metadata = { title: "网站说明 · Thraive联盟营销系统" };

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  USER: "内部员工",
  BRAND: "品牌方用户",
  CHANNEL: "渠道商用户",
};

const modules = [
  { icon: Users, title: "客户管理", href: "/customers", body: "维护客户档案、负责人、合作进度、渠道关联和门户提交资料。" },
  { icon: FileCheck2, title: "合同管理", href: "/contracts", body: "管理品牌方、渠道商和事务性合同，完成审核、导出、签署归档与版本留痕。" },
  { icon: FolderKanban, title: "项目管理", href: "/projects", body: "跟踪项目执行、KPI、源数据、折扣信息、联盟营销及单次合作。" },
  { icon: BarChart3, title: "推广数据 BI", href: "/bi", body: "上传和匹配推广销售数据，按客户、站点、ASIN 等维度查看看板与明细。" },
  { icon: Building2, title: "联盟资源库", href: "/affiliates", body: "维护联盟商资源、合作审核、批量导入、负责人和媒体包。" },
  { icon: CircleDollarSign, title: "结算与财务", href: "/finance", body: "从客户对账、开票和应收到收款核销，再到渠道及联盟商付款闭环。" },
];

export default async function GuidePage() {
  const session = await requireSession();
  const roleLabel = roleLabels[session.role] ?? session.role;

  return <div className="mx-auto max-w-6xl">
    <header className="border-b border-[#e7e0ef] pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-brand-700">Thraive Hub 使用指南</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">从客户合作到收付款，一页看懂系统怎么用</h1>
          <p className="mt-3 max-w-[72ch] text-sm leading-6 text-slate-600">本页说明各模块之间的关系、常用操作顺序和权限边界。你当前以“{roleLabel}”身份登录；实际可见入口由管理员配置的权限决定。</p>
        </div>
        <Link href="/dashboard" className="btn-secondary">返回工作台</Link>
      </div>
    </header>

    <div className="grid gap-8 py-7 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="说明目录" className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 px-3 text-xs font-semibold text-slate-500">本页目录</p>
        <div className="space-y-1 border-l border-[#dcd4e7] pl-2">
          {[['start','快速开始'],['flow','业务流程'],['modules','模块说明'],['roles','角色与权限'],['faq','常见问题']].map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-white hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">{label}</a>)}
        </div>
      </nav>

      <main className="min-w-0 space-y-10">
        <section id="start" className="scroll-mt-6">
          <SectionHeading title="快速开始" description="第一次进入系统，建议按这个顺序熟悉。" />
          <ol className="mt-5 divide-y divide-[#eee9f3] border-y border-[#e7e0ef]">
            <Step number="1" title="先看工作台" body="查看待办、任务、工作日志、提醒与快捷入口，确认今天需要处理的事项。" />
            <Step number="2" title="从业务对象进入" body="客户、合同、项目、推广数据和财务记录互相关联；优先从客户或具体记录进入详情。" />
            <Step number="3" title="完成操作后核对状态" body="保存、提交审核、签署归档、对账和付款都会改变状态；以页面状态和操作记录为准。" />
          </ol>
        </section>

        <section id="flow" className="scroll-mt-6">
          <SectionHeading title="核心业务流程" description="系统围绕四条主线协同，数据会从上游记录进入下游结算。" />
          <div className="mt-5 space-y-3">
            <Flow title="品牌方合作" nodes={["客户资料", "主格式合同", "项目确认书", "签署归档", "项目与 BI", "客户对账", "开票与收款"]} />
            <Flow title="渠道商合作" nodes={["关联客户", "渠道商合同", "分账规则", "渠道对账", "付款申请", "付款核销"]} />
            <Flow title="联盟商合作" nodes={["资源建档", "合作审核", "项目执行", "联盟商结算"]} />
            <Flow title="推广数据" nodes={["上传数据", "字段与 ASIN 匹配", "数据看板", "经营分析"]} />
          </div>
        </section>

        <section id="modules" className="scroll-mt-6">
          <SectionHeading title="模块说明" description="看不到某个入口通常代表当前账号没有该模块的读取权限。" />
          <div className="mt-5 divide-y divide-[#eee9f3] border-y border-[#e7e0ef]">
            {modules.map(({ icon: Icon, title, href, body }) => <div key={title} className="flex gap-4 py-4 first:pt-0 last:pb-0 sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div>
              <Link href={href} className="hidden shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline sm:inline-flex">前往 <ArrowRight className="h-4 w-4" /></Link>
            </div>)}
          </div>
        </section>

        <section id="roles" className="scroll-mt-6">
          <SectionHeading title="角色与权限" description="功能权限决定能做什么，数据范围决定能看到谁的数据。" />
          <dl className="mt-5 overflow-hidden rounded-lg border border-[#e7e0ef] bg-white">
            <RoleRow role="管理员" detail="负责用户审核、权限配置、数据质量、审计和系统错误；默认拥有全模块管理权限。" />
            <RoleRow role="内部员工" detail="根据分配的读取、编辑或管理权限处理内部业务；通常可以查看内部共享业务数据。" />
            <RoleRow role="品牌方" detail="仅查看所属品牌范围内获授权的数据和流程，不能访问其他品牌资料。" />
            <RoleRow role="渠道商" detail="仅查看与自身账号关联的客户、合同、对账及推广数据。" />
          </dl>
          <div className="mt-4 flex gap-3 rounded-lg bg-[#f4f0ff] px-4 py-3 text-sm leading-6 text-[#51418f]"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>权限可以由管理员按账号调整。如果入口消失、按钮不可用或记录不可见，请先联系管理员核对功能权限和数据归属。</p></div>
        </section>

        <section id="faq" className="scroll-mt-6">
          <SectionHeading title="常见问题" description="先判断是权限、字段、文件还是状态问题。" />
          <div className="mt-5 space-y-2">
            <Faq q="为什么我看不到某个模块或按钮？" a="系统会按账号权限隐藏入口；外部账号还受品牌或渠道数据范围限制。联系管理员核对权限，不要重复创建记录。" />
            <Faq q="为什么保存或提交失败？" a="先查看当前操作区附近的错误提示。必填字段缺失、状态不允许、文件格式不符或记录已被他人更新都会阻止提交。" />
            <Faq q="合同应该从哪里开始？" a="品牌方合同使用主格式合同和项目确认书；渠道商合同填写返佣规则并上传签署原件；事务性合同填写起止日期并上传原件。" />
            <Faq q="上传数据后为什么看板没有变化？" a="确认字段映射、客户/站点/ASIN 匹配和上传结果，再刷新页面。外部账号只能看到授权范围内的数据。" />
            <Faq q="出现“页面加载失败”或错误代码怎么办？" a="保留错误代码、操作时间和页面截图，交给管理员在系统错误中查询。不要连续重复提交可能产生业务记录的操作。" />
          </div>
          <div className="mt-5 flex gap-3 border-t border-[#e7e0ef] pt-5 text-sm text-slate-600"><Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p className="leading-6">涉及合同签署、对账、开票、收款核销和付款时，先核对关联对象、币种、期间和原件，再提交下一步。</p></div>
        </section>
      </main>
    </div>
  </div>;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>;
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return <li className="flex gap-4 py-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{number}</span><div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div></li>;
}

function Flow({ title, nodes }: { title: string; nodes: string[] }) {
  return <div className="rounded-lg border border-[#e7e0ef] bg-white px-4 py-4"><h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3><div className="flex flex-wrap items-center gap-2">{nodes.map((node, index) => <div key={node} className="flex items-center gap-2"><span className="rounded-md bg-[#faf8ff] px-2.5 py-1.5 text-sm text-slate-700">{node}</span>{index < nodes.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-slate-400" /> : null}</div>)}</div></div>;
}

function RoleRow({ role, detail }: { role: string; detail: string }) {
  return <div className="grid gap-1 border-b border-[#eee9f3] px-4 py-3 last:border-b-0 sm:grid-cols-[120px_1fr] sm:gap-4"><dt className="font-semibold text-slate-900">{role}</dt><dd className="text-sm leading-6 text-slate-600">{detail}</dd></div>;
}

function Faq({ q, a }: { q: string; a: string }) {
  return <details className="group rounded-lg border border-[#e7e0ef] bg-white px-4 py-3 open:border-brand-200"><summary className="cursor-pointer list-none pr-8 text-sm font-semibold text-slate-900 marker:hidden">{q}<span className="float-right text-brand-600 group-open:rotate-45">＋</span></summary><p className="mt-3 max-w-[72ch] border-t border-[#eee9f3] pt-3 text-sm leading-6 text-slate-600">{a}</p></details>;
}
