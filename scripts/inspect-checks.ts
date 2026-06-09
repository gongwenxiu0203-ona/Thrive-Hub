import JSZip from "jszip";
import * as fs from "fs";
(async () => {
  const buf = fs.readFileSync("C:/Temp/test-contract-output.docx");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const paras = xml.split("</w:p>");
  for (const p of paras) {
    if (p.includes("✓")) {
      const text = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");
      const nChecks = (p.match(/✓/g) || []).length;
      console.log(`[${nChecks}✓] ${text.slice(0, 100)}`);
    }
  }
})();
