import { redirect } from "next/navigation";

export default function LegacyBillingPage() {
  redirect("/finance/workbench");
}
