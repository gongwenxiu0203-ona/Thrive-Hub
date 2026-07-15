import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { TEMPLATE_KEY_LABELS } from "@/lib/contractTemplateKeys";
import { companySealExistsServer } from "@/lib/contractSeal";
import { TemplatesClient } from "./TemplatesClient";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { isStaff } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "合同模板库 · Thraive联盟营销系统" };

export default async function ContractTemplatesPage() {
  const session = await requireSession();
  const contractPermission = await resolveUserPermission(session.userId, "contracts");

  const [templates, hasFoshanSeal, hasHongkongSeal] = await Promise.all([
    prisma.contractTemplate.findMany({
      where: { deletedAt: null },
      orderBy: [{ templateKey: "asc" }, { createdAt: "desc" }],
      include: { uploader: { select: { id: true, name: true } } },
    }),
    companySealExistsServer("FOSHAN"),
    companySealExistsServer("HONGKONG"),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/contracts" className="btn-secondary text-sm">
          <ArrowLeft className="h-4 w-4" /> 返回合同管理
        </Link>
      </div>
      <PageHeader
        title="合同模板库"
        description="管理员上传与维护合同模板；仅具备合同管理权限的内部人员可下载。新建合同时也会从此处选择适用模板。"
      />

      <div className="mt-5">
        <TemplatesClient
          isAdmin={session.role === "ADMIN"}
          canDownloadTemplates={
            isStaff(session.role) && hasPermissionLevel(contractPermission, "MANAGE")
          }
          sealStatus={{ FOSHAN: hasFoshanSeal, HONGKONG: hasHongkongSeal }}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            templateKey: t.templateKey,
            templateKeyLabel: TEMPLATE_KEY_LABELS[t.templateKey] ?? t.templateKey,
            description: t.description,
            uploaderName: t.uploader?.name ?? "—",
            createdAt: t.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
