import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { ConfirmationEditor } from "./ConfirmationEditor";

export default async function ConfirmationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ focus?: string; highlight?: string }> }) {
  const session = await requireSession();
  await requireFeaturePermission(session, "contracts.records", "READ");
  const { id } = await params;
  const query = await searchParams;
  return <ConfirmationEditor contractId={id} focusId={query.focus} highlightMissing={query.highlight === "missing"} />;
}
