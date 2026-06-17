import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ContractV4Form } from "./ContractV4Form";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建合同 · Thraive联盟营销系统" };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (session.role === "BRAND" || session.role === "CHANNEL") redirect("/dashboard");

  const sp = await searchParams;
  const customerId = sp.customerId;
  const contractId = sp.contractId; // 编辑模式

  let customer: { id: string; brandName: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existingContract: any = null;

  if (customerId) {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, brandName: true },
    });
    if (!customer) notFound();
  }

  if (contractId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingContract = await (prisma.contract.findUnique as any)({
      where: { id: contractId },
    });
    if (!existingContract) notFound();
    if (!customer) {
      customer = await prisma.customer.findUnique({
        where: { id: existingContract.customerId },
        select: { id: true, brandName: true },
      });
    }
  }

  const [customers, users, templates] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, brandName: true }, orderBy: { brandName: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractTemplate.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, templateKey: true },
      orderBy: [{ templateKey: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {existingContract ? "编辑合同" : "新建合同"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {existingContract
            ? `合同编号：${existingContract.contractNo}`
            : "基于《平台联盟营销服务合同+项目确认书》模板创建"}
        </p>
      </div>

      <ContractV4Form
        customers={customers}
        users={users}
        templates={templates}
        presetCustomerId={customer?.id}
        presetCustomerName={customer?.brandName}
        currentUserId={session.userId}
        existingContract={existingContract}
      />
    </div>
  );
}
