import { loadEnvConfig } from "@next/env";
import { PDFDocument } from "pdf-lib";
import { generateInvoicePdf } from "../src/lib/invoicePdf";

// Production runtime check: same environment and renderer as the app, no DB or files written.
loadEnvConfig(process.cwd());
async function main() {
  const bytes = await generateInvoicePdf({
    invoiceNo: "RUNTIME-CHECK-NOT-A-REAL-INVOICE",
    invoiceDate: new Date("2026-11-05T00:00:00Z"), dueDate: new Date("2026-11-19T00:00:00Z"),
    periodLabel: "TEST", feeType: "MONTHLY_FEE", clientName: "TEST 测试", currency: "USD", totalAmount: 1,
    bankSnapshot: { beneficiary: "TEST COMPANY" },
    items: [{ feeType: "MONTHLY_FEE", description: "Synthetic runtime check only", currency: "USD", quantity: 1, unitPrice: 1, amount: 1 }],
  });
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() < 1 || bytes.byteLength < 1000) throw new Error("Invalid PDF runtime output");
  console.log(`PDF runtime OK: ${pdf.getPageCount()} page(s), ${bytes.byteLength} bytes; no invoice or business data created.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
