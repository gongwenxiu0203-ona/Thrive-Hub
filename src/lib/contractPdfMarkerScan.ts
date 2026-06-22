// Scan a PDF page-by-page to find which pages contain the 乙方（盖章）marker.
// Used by the stamping flow to skip the per-page bottom-right pdf-lib stamp on
// signature pages (those already got an in-place seal during the DOCX
// preprocessing step).
//
// Uses pdf-parse with a pagerender callback to access per-page text content.

// pdf-parse 是 CommonJS 包，且其 index 会在加载时尝试读取一份 sample PDF，
// 这在 Next.js 静态分析阶段会触发问题；改用其 lib/ 入口。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

// 与 stampDocx.ts 里 PARTY_B_STAMP_MARKER 同义；这里独立维护，因为 PDF 文本
// 提取后括号/空格可能略有差异。
const MARKERS = [
  /乙方\s*[（(]\s*(?:盖章|签字盖章|盖\s*章|签字[\s/]*盖章)\s*[）)]/,
  /乙方\s*盖\s*章\s*处/,
];

/** Return a sorted, deduped array of 0-indexed page numbers that contain
 *  any 乙方（盖章）marker text. */
export async function findPartyBStampPages(pdfBytes: Buffer): Promise<number[]> {
  const pagesText: string[] = [];
  try {
    await pdfParse(pdfBytes, {
      pagerender: async (pageData: {
        getTextContent: (opts?: unknown) => Promise<{ items: { str: string }[] }>;
      }) => {
        const tc = await pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false,
        });
        const text = tc.items.map((i) => i.str).join("");
        pagesText.push(text);
        return text;
      },
    });
  } catch (e) {
    console.warn("[findPartyBStampPages] pdf-parse failed:", e);
    return [];
  }
  const out = new Set<number>();
  pagesText.forEach((text, idx) => {
    if (MARKERS.some((re) => re.test(text))) out.add(idx);
  });
  return Array.from(out).sort((a, b) => a - b);
}
