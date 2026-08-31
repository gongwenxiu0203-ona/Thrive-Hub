import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { ConfirmationEditor } from "./ConfirmationEditor";

export default async function ConfirmationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  await requireFeaturePermission(session, "contracts.records", "READ");
  const { id } = await params;
  return <ConfirmationEditor contractId={id} />;
}
