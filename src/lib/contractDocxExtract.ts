import mammoth from "mammoth";
import JSZip from "jszip";

export type ExtractedDocxContent = {
  text: string;
  html: string;
};

export async function extractDocxContent(buf: Buffer): Promise<ExtractedDocxContent> {
  let text: string;
  try {
    const rawText = await mammoth.extractRawText({ buffer: buf });
    text = rawText.value.trim();
  } catch (error) {
    console.warn("[contract-docx] mammoth text extraction failed; using XML fallback", error);
    text = await extractTextFromDocxXml(buf);
  }

  let previewBody: string;
  try {
    const html = await mammoth.convertToHtml(
      { buffer: buf },
      {
        includeDefaultStyleMap: true,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h3:fresh",
        ],
      },
    );
    previewBody = html.value;
  } catch (error) {
    console.warn("[contract-docx] mammoth HTML preview failed; using text preview", error);
    previewBody = `<pre>${escapeHtml(text)}</pre>`;
  }

  return {
    text,
    html: wrapDocxPreviewHtml(previewBody),
  };
}

/** Extract plain text from a .docx buffer. Kept for callers that only need text. */
export async function extractDocxText(buf: Buffer): Promise<string> {
  return (await extractDocxContent(buf)).text;
}

async function extractTextFromDocxXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) throw new Error("DOCX 缺少 word/document.xml，文件可能已损坏");

  const xml = await documentXml.async("string");
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      .replace(/<w:br\b[^>]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<\/w:tr>/gi, "\n")
      .replace(/<\/w:tc>/gi, "\t")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapDocxPreviewHtml(body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 18px;
    color: #334155;
    font-family: Arial, "Microsoft YaHei", sans-serif;
    font-size: 13px;
    line-height: 1.65;
    background: #f8fafc;
  }
  .docx-preview {
    max-width: 900px;
    margin: 0 auto;
    padding: 22px;
    background: #fff;
    border: 1px solid #e2e8f0;
  }
  p { margin: 0 0 10px; white-space: pre-wrap; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  h1, h2, h3 { margin: 14px 0 10px; color: #0f172a; line-height: 1.35; }
  h1 { font-size: 20px; }
  h2 { font-size: 17px; }
  h3 { font-size: 15px; }
  strong, b { font-weight: 700; }
  em, i { font-style: italic; }
  u { text-decoration: underline; }
  table {
    width: 100%;
    margin: 12px 0;
    border-collapse: collapse;
    table-layout: auto;
  }
  td, th {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    vertical-align: top;
    word-break: break-word;
  }
  th { background: #f1f5f9; font-weight: 700; }
  ul, ol { padding-left: 20px; }
  a { color: #4f46e5; }
</style>
</head>
<body><div class="docx-preview">${body || "<p>未识别到可展示的原文内容</p>"}</div></body>
</html>`;
}
