import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { loadImage } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer";
import { generateInvoicePdf, invoiceLogoBounds } from "../src/lib/invoicePdf";
import { invoiceDocumentHtml } from "../src/lib/invoiceDocument";

async function main() {
  const html = invoiceDocumentHtml({ invoiceNo: "TEST", invoiceDate: "2026-11-05", dueDate: "2026-11-19", clientName: '<img src="https://evil.test/">', items: [], currencyTotals: [{ currency: "USD", amount: 0 }], terms: "<script>alert(1)</script>", bank: null });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes('<img src="https://evil.test/">'));
  assert.ok(html.includes("Tinos-Regular.woff2"));
  assert.ok(html.includes("Tinos-Bold.woff2"));
  assert.ok(html.includes("object-fit:contain"));
  assert.ok(html.includes("width:793.7px"));
  for (const [width, height] of [[1765, 2107], [1000, 100], [50, 50]]) {
    const fitted = invoiceLogoBounds(width, height);
    assert.ok(fitted.width <= 64 && fitted.height <= 64);
    assert.ok(Math.abs(fitted.width / fitted.height - width / height) < 1e-10);
  }
  assert.throws(() => invoiceLogoBounds(0, 1));
  const image = await loadImage("public/thraive-logo.png");
  const bounds = invoiceLogoBounds(image.width, image.height);
  const bytes = await generateInvoicePdf({
    invoiceNo: "TEST-LOGO-RATIO", invoiceDate: new Date("2026-11-05"), dueDate: new Date("2026-11-19"),
    periodLabel: "2026-11", feeType: "MONTHLY_FEE", clientName: "TEST Client", clientAddress: "Test address", currency: "USD", totalAmount: 1200,
    bankSnapshot: { bankName: "TEST Bank", beneficiary: "TEST Holder", accountNo: "TEST ONLY" },
    items: Array.from({length: 42}, (_, index) => ({feeType: "MONTHLY_FEE", description: `TEST item ${index + 1}`, quantity: 1, unitPrice: 1200 / 42, amount: 1200 / 42})),
  });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1, "Exercise compact continuation headers");
  await fs.mkdir("output/pdf", { recursive: true });
  await fs.writeFile("output/pdf/invoice-logo-ratio-test.pdf", bytes);
  console.log(JSON.stringify({ source: [image.width, image.height], fitted: bounds, pages: pdf.getPageCount(), output: "output/pdf/invoice-logo-ratio-test.pdf" }));
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined), headless: true, args: process.platform === "linux" ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] : [] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    let embedded = html;
    for (const [file, mime] of [["thraive-logo.png", "image/png"], ["fonts/Tinos-Regular.woff2", "font/woff2"], ["fonts/Tinos-Bold.woff2", "font/woff2"], ["fonts/SourceHanSansCN-Regular.otf", "font/otf"], ["fonts/SourceHanSansCN-Bold.otf", "font/otf"]]) {
      embedded = embedded.replace('/'+file, `data:${mime};base64,${(await fs.readFile('public/'+file)).toString('base64')}`);
    }
    await page.setContent(embedded);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(i=>i.decode())); });
    const metrics = () => page.evaluate(() => Array.from(document.querySelectorAll('header,.title,.company,table,.notes')).map(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight})));
    await page.emulateMediaType('screen'); const screen = await metrics();
    await page.emulateMediaType('print'); const print = await metrics();
    assert.deepEqual(screen, print);
    assert.equal(await page.evaluate(() => Array.from(document.fonts).every(font => font.status === 'loaded')), true);
    await page.screenshot({ path: 'output/pdf/invoice-shared-document.png', fullPage: true });
    console.log('Shared HTML screen/print layout metrics and embedded font loading passed.');
  } finally { await browser.close(); }
}
main();
