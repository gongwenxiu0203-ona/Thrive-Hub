import { prisma } from "../src/lib/prisma";

const mappings: Record<string, string[]> = {
  "projects.progress_dashboard": ["projects.records", "tasks"],
  "projects.source_data": ["projects.records", "tasks"],
  "projects.discount_summary": ["projects.records", "tasks"],
  "projects.discount_products": ["projects.records", "tasks"],
  "projects.discount_sources": ["projects.records", "tasks"],
  "projects.discount_mappings": ["projects.records", "tasks"],
  "finance.billing_requests": ["operations.invoices", "finance_customer"],
  "finance.invoices": ["operations.invoices", "finance_customer"],
  "finance.domestic_invoices": ["operations.invoices", "finance_customer"],
  "finance.receivables": ["operations.accounts_receivable", "finance_customer"],
  "finance.receipt_allocation": ["operations.accounts_receivable", "finance_customer"],
  "finance.profiles": ["operations.accounts_receivable", "finance_customer"],
  "finance.exports": ["operations.accounts_receivable", "finance_customer"],
  "finance.payment_requests": ["finance.channel_reconciliation", "finance_channel"],
  "finance.payments": ["finance.channel_reconciliation", "finance_channel"],
  "finance.expenses": ["finance.channel_reconciliation", "finance_channel"],
  "finance.exceptions": ["finance.channel_reconciliation", "finance_channel"],
};

async function main() {
  const apply = process.argv.includes("--apply");
  const [roles, users] = await Promise.all([
    prisma.rolePermission.findMany(),
    prisma.userPermissionOverride.findMany(),
  ]);
  const roleExisting = new Set(roles.map((row) => `${row.role}\u0000${row.feature}`));
  const userExisting = new Set(users.map((row) => `${row.userId}\u0000${row.feature}`));
  const roleCreates: Array<{ role: string; feature: string; level: string }> = [];
  const userCreates: Array<{ userId: string; feature: string; level: string }> = [];

  for (const [target, sources] of Object.entries(mappings)) {
    for (const role of [...new Set(roles.map((row) => row.role))]) {
      if (roleExisting.has(`${role}\u0000${target}`)) continue;
      const source = sources.map((feature) => roles.find((row) => row.role === role && row.feature === feature)).find(Boolean);
      if (source) roleCreates.push({ role, feature: target, level: source.level });
    }
    for (const userId of [...new Set(users.map((row) => row.userId))]) {
      if (userExisting.has(`${userId}\u0000${target}`)) continue;
      const source = sources.map((feature) => users.find((row) => row.userId === userId && row.feature === feature)).find(Boolean);
      if (source) userCreates.push({ userId, feature: target, level: source.level });
    }
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", roleCreates, userCreates }, null, 2));
  if (!apply) return;
  await prisma.$transaction(async (tx) => {
    for (const row of roleCreates) await tx.rolePermission.create({ data: row });
    for (const row of userCreates) await tx.userPermissionOverride.create({ data: row });
  });
  console.log(`Permission leaf migration completed: ${roleCreates.length} role rows, ${userCreates.length} user rows.`);
  console.log("Legacy rows were retained for audit but are no longer read by the permission resolver.");
}

main()
  .catch((error) => {
    console.error("Permission leaf migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
