// Contract template filling: takes a .docx template + a flat fields map,
// returns a new .docx buffer with placeholders replaced.
//
// Placeholder convention (preferred): {{key}} anywhere in the template body.
// Run-merging — Word often splits a single visible {{partyAName}} across
// multiple <w:r><w:t>...</w:t></w:r> runs (e.g. {{, partyAName, }}). To handle
// this, we merge adjacent <w:t> contents into a single per-paragraph string
// before applying the substitution, then rewrite the paragraph's runs.

import fs from "fs";
import path from "path";
import JSZip from "jszip";

export type FieldsMap = Record<string, string | number | null | undefined>;

function escXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stringify any field value into the form we want in the document. */
function display(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return String(v);
}

/**
 * Replace {{key}} placeholders inside a docx XML string.
 *
 * Strategy: walk the XML at the paragraph level. For each paragraph, collect
 * the concatenated text of its <w:t> runs. If that text contains a placeholder,
 * substitute it and rewrite the paragraph so all the original text-bearing runs
 * are replaced by a single new <w:r><w:t> carrying the substituted text. The
 * paragraph's <w:pPr> (formatting) is preserved.
 */
export function replaceMustacheInDocxXml(xml: string, fields: FieldsMap): string {
  // Cheap pre-scan to short-circuit when no placeholder is anywhere in the file
  if (!/\{\{[\w.]+\}\}/.test(xml.replace(/<[^>]+>/g, ""))) {
    // No raw placeholder text — still try with run-split-tolerant pass below
  }

  // Walk paragraphs: split on <w:p ...> ... </w:p>
  // Use a state machine to keep the boundaries intact.
  const PARA_OPEN = /<w:p(\s[^>]*)?>/g;
  const out: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = PARA_OPEN.exec(xml)) !== null) {
    // Pre-paragraph chunk
    if (m.index > cursor) out.push(xml.slice(cursor, m.index));
    const openTagEnd = m.index + m[0].length;
    const closeIdx = xml.indexOf("</w:p>", openTagEnd);
    if (closeIdx === -1) {
      // Malformed; bail out and emit the rest verbatim
      out.push(xml.slice(m.index));
      cursor = xml.length;
      break;
    }
    const inner = xml.slice(openTagEnd, closeIdx);
    out.push(m[0]);
    out.push(rewriteParagraphInner(inner, fields));
    out.push("</w:p>");
    cursor = closeIdx + "</w:p>".length;
    PARA_OPEN.lastIndex = cursor;
  }
  if (cursor < xml.length) out.push(xml.slice(cursor));
  return out.join("");
}

function rewriteParagraphInner(inner: string, fields: FieldsMap): string {
  // Concatenate text from all <w:t>...</w:t>
  const TEXT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let concatenated = "";
  const matches: { start: number; end: number; text: string }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = TEXT_RE.exec(inner)) !== null) {
    concatenated += mm[2];
    matches.push({ start: mm.index, end: mm.index + mm[0].length, text: mm[2] });
  }
  if (matches.length === 0) return inner;

  // Look for placeholders in the concatenated text
  if (!/\{\{[\w.]+\}\}/.test(concatenated)) return inner;

  const replaced = concatenated.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    if (key in fields) {
      const v = display(fields[key]);
      return v;
    }
    return ""; // unknown placeholders become empty (so blank lines collapse, not show {{...}})
  });

  // Strategy: put the entire replaced text into the FIRST <w:t> run; blank out subsequent ones.
  const firstMatch = matches[0];
  const result: string[] = [];
  result.push(inner.slice(0, firstMatch.start));
  // Reuse the first w:t's opening tag (which may carry attributes like xml:space="preserve")
  const openTagMatch = inner.slice(firstMatch.start, firstMatch.end).match(/^<w:t(\s[^>]*)?>/);
  const openTag = openTagMatch ? openTagMatch[0] : "<w:t>";
  // Always preserve whitespace (the replacement may have spaces at edges)
  const preservedOpen = openTag.includes("xml:space=")
    ? openTag
    : openTag.replace(/^<w:t/, `<w:t xml:space="preserve"`);
  result.push(`${preservedOpen}${escXml(replaced)}</w:t>`);

  // Fill the gaps between text nodes with the surrounding xml + blank out the other w:t nodes
  let lastEnd = firstMatch.end;
  for (let i = 1; i < matches.length; i++) {
    const ti = matches[i];
    result.push(inner.slice(lastEnd, ti.start));
    // emit an empty w:t (preserving attributes)
    const om = inner.slice(ti.start, ti.end).match(/^<w:t(\s[^>]*)?>/);
    const oTag = om ? om[0] : "<w:t>";
    result.push(`${oTag}</w:t>`);
    lastEnd = ti.end;
  }
  result.push(inner.slice(lastEnd));
  return result.join("");
}

/** Fill a docx template buffer with the given fields and return the new docx buffer. */
export async function fillContractTemplate(
  templateBuffer: Buffer,
  fields: FieldsMap
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("模板文件结构异常：找不到 word/document.xml");
  const xml = await docFile.async("string");
  const newXml = replaceMustacheInDocxXml(xml, fields);
  zip.file("word/document.xml", newXml);

  // Headers / footers may also carry placeholders.
  const headerFooterPaths = Object.keys(zip.files).filter((p) =>
    /^word\/(header|footer)\d*\.xml$/i.test(p)
  );
  for (const p of headerFooterPaths) {
    const f = zip.file(p);
    if (!f) continue;
    const hfXml = await f.async("string");
    zip.file(p, replaceMustacheInDocxXml(hfXml, fields));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

/** Convenience: read a template by absolute server path and fill it. */
export async function fillContractTemplateFromPath(
  absPath: string,
  fields: FieldsMap
): Promise<Buffer> {
  const buf = fs.readFileSync(absPath);
  return fillContractTemplate(buf, fields);
}

/** Resolve a stored fileUrl (e.g. "/contract-templates/abc.docx") to an absolute disk path. */
export function templateUrlToAbsPath(fileUrl: string): string {
  const rel = fileUrl.replace(/^\//, "");
  return path.join(process.cwd(), "public", rel);
}
