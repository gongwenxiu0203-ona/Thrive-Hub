// Read a .docx (OOXML) buffer and return its concatenated body text.
// Strips XML tags, preserves paragraph breaks. Used for "upload existing
// contract" flow: extracted text is fed into the AI field extractor.

import JSZip from "jszip";

/** Extract plain text from a .docx buffer. Paragraphs separated by "\n". */
export async function extractDocxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("无法读取 word/document.xml");

  const paragraphs: string[] = [];
  const paraRe = /<w:p(\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  const textRe = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(xml)) !== null) {
    const inner = pm[2];
    let line = "";
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(inner)) !== null) {
      line += decodeXml(tm[2]);
    }
    if (line.trim()) paragraphs.push(line);
  }
  return paragraphs.join("\n");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
