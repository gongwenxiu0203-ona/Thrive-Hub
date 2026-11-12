import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { domesticInvoiceForm, domesticInvoiceFile, DomesticUploadError } from "../src/lib/domesticInvoiceUpload";
async function main() {
  const form=new FormData();form.set("file",new File(["%PDF-1.7\nmock"],"发票.pdf",{type:"application/pdf"}));form.set("invoiceNumber","000123");
  const request=new Request("http://localhost/api/finance/billing/test/domestic",{method:"POST",body:form});
  const parsed=await domesticInvoiceForm(request);assert.equal(parsed.get("invoiceNumber"),"000123");
  assert.equal((await domesticInvoiceFile(parsed.get("file"))).type,"application/pdf");
  assert.equal((await domesticInvoiceFile(new File(["%PDF-1.7"],"invoice.pdf"))).type,"application/pdf");
  await assert.rejects(domesticInvoiceFile(new File(["fake"],"invoice.pdf",{type:"application/pdf"})),/内容/);
  await assert.rejects(domesticInvoiceFile(new File(["%PDF-1.7"],"invoice.html",{type:"application/pdf"})),/扩展名/);
  await assert.rejects(domesticInvoiceFile(new File([],"invoice.pdf")),/20MB/);
  await assert.rejects(domesticInvoiceFile(new File([new Uint8Array(20*1024*1024+1)],"invoice.pdf")),/20MB/);
  await assert.rejects(domesticInvoiceForm(new Request("http://localhost",{method:"POST",headers:{"content-type":"multipart/form-data"},body:"bad"})),/格式/);
  await assert.rejects(domesticInvoiceForm(new Request("http://localhost",{method:"POST",headers:{"content-type":"multipart/form-data; boundary=x"},body:"truncated"})),e=>e instanceof DomesticUploadError && e.status===400 && !e.message.includes("Failed to parse"));
  const source=readFileSync("src/middleware.ts","utf8");
  assert.ok(source.includes("api/finance/billing/[^/]+/domestic(?:/extract)?/?$"));
  const excluded=/^\/api\/finance\/billing\/[^/]+\/domestic(?:\/extract)?\/?$/;
  for(const route of ["/api/finance/billing/a/domestic","/api/finance/billing/a/domestic/extract"])assert.ok(excluded.test(route));
  for(const route of ["/api/finance/billing/a/domestic/other","/api/finance/billing/a/other","/api/finance/domestic-invoices/a/original"])assert.ok(!excluded.test(route));
  const guard=readFileSync("src/lib/domesticInvoiceUploadAccess.ts","utf8");
  for(const fragment of ["getSession()","prisma.user.findUnique","APPROVED","isStaff(user.role)","finance.domestic_invoices","EDIT"])assert.ok(guard.includes(fragment));
  console.log("Multipart, damaged-body, size/type/magic validation and exact middleware exclusion tests passed; no DB/file storage writes.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
