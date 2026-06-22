import JSZip from "jszip";

// 「日期：YYYY 年 MM 月 DD 日」自动填写：仅当 月/日 字段为空时才覆盖（避免改写
// 已经手填的日期）。年字段无论是否填写都会覆盖为当前年（保持一致性）。
const BLANK_STAMP_DATE_RE =
  /日期[：:]\s*\d{0,4}\s*年[\s　]+月[\s　]+日/;
// 在 乙方（盖章）标记之后多少个段落范围内查找日期行
const STAMP_DATE_WINDOW = 6;

const REL_TYPE_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const PNG_CONTENT_TYPE = '<Default Extension="png" ContentType="image/png"/>';

// 「乙方（盖章）」类标记 — 中英文括号都识别。兼容：
//   乙方（盖章）  乙方(盖章)  乙方（盖 章）  乙方（签字盖章） 乙方（签字/盖章）
//   乙方盖章处  乙方盖章: …
// 收紧匹配：要求括号包裹 或 以"处"作为标签后缀，避免命中正文里的「乙方盖章后送回甲方」。
const PARTY_B_STAMP_MARKER = /乙方\s*(?:[（(]\s*(?:盖章|签字盖章|盖\s*章|签字[\s/]*盖章)\s*[）)]|盖\s*章\s*处)\s*[:：]?/;

function nextRid(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function ensurePngContentType(contentTypesXml: string): string {
  if (contentTypesXml.includes('Extension="png"')) return contentTypesXml;
  return contentTypesXml.replace("</Types>", `${PNG_CONTENT_TYPE}</Types>`);
}

/** A standalone <w:p> wrapping the seal image. Inserted AFTER the marker
 *  paragraph so the seal lands in the empty space beneath "乙方（盖章）：".
 *  Left-aligned with a small left indent so it sits where signatures usually
 *  go in the templates we've seen. */
function partyBSealParagraph(relId: string, idSeed: number): string {
  const size = 1143000; // 约 3cm × 3cm
  return `<w:p>
    <w:pPr>
      <w:spacing w:before="60" w:after="60"/>
      <w:ind w:left="720"/>
    </w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${size}" cy="${size}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="${idSeed}" name="PartyBSeal${idSeed}"/>
          <wp:cNvGraphicFramePr/>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${idSeed}" name="PartyBSeal${idSeed}"/>
                  <pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${size}" cy="${size}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

/** Trailing seal — used as the fallback "bottom of document" stamp when no
 *  marker is found (preserves the previous behavior of stampDocx). */
function trailingSealParagraph(relId: string): string {
  const width = 1143000;
  const height = 1143000;
  return `
<w:p>
  <w:pPr>
    <w:jc w:val="right"/>
    <w:spacing w:before="240"/>
  </w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${width}" cy="${height}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="8888" name="CompanySeal"/>
        <wp:cNvGraphicFramePr/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="8888" name="CompanySeal"/>
                <pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
}

function formatStampDate(d: Date = new Date()): string {
  return `日期：${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** Rewrite a paragraph's <w:t> contents in-place, putting `newText` into the
 *  first text run and clearing subsequent ones. Preserves all formatting. */
function rewriteParagraphText(inner: string, newText: string): string {
  const TEXT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const matches: { start: number; end: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = TEXT_RE.exec(inner)) !== null) {
    matches.push({ start: mm.index, end: mm.index + mm[0].length });
  }
  if (matches.length === 0) return inner;

  const escaped = newText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const first = matches[0];
  const out: string[] = [];
  out.push(inner.slice(0, first.start));
  // 保留首个 <w:t> 的原始属性（如果有 xml:space="preserve" 则不再追加）
  const firstTagMatch = inner.slice(first.start, first.end).match(/^<w:t(\s[^>]*)?>/);
  const firstOpen = firstTagMatch ? firstTagMatch[0] : "<w:t>";
  const preservedOpen = firstOpen.includes("xml:space=")
    ? firstOpen
    : firstOpen.replace(/^<w:t/, `<w:t xml:space="preserve"`);
  out.push(`${preservedOpen}${escaped}</w:t>`);
  let lastEnd = first.end;
  for (let i = 1; i < matches.length; i++) {
    const ti = matches[i];
    out.push(inner.slice(lastEnd, ti.start));
    const om = inner.slice(ti.start, ti.end).match(/^<w:t(\s[^>]*)?>/);
    const oTag = om ? om[0] : "<w:t>";
    out.push(`${oTag}</w:t>`);
    lastEnd = ti.end;
  }
  out.push(inner.slice(lastEnd));
  return out.join("");
}

/** Walk paragraphs and inject the seal image at every paragraph whose
 *  concatenated text matches PARTY_B_STAMP_MARKER. Also auto-fills the
 *  blank "日期：年 月 日" line that follows the marker (within
 *  STAMP_DATE_WINDOW paragraphs) with today's date.
 *  Returns updated body XML + count of markers replaced. */
function injectAtPartyBMarkers(
  documentXml: string,
  relId: string,
): { xml: string; count: number } {
  const PARA_OPEN = /<w:p(\s[^>]*)?>/g;
  const out: string[] = [];
  let cursor = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  let seedBase = 9000;
  // 「乙方（盖章）」标记之后剩余的"在窗口内"段落数。>0 时遇到空白「日期：年 月 日」会被覆盖。
  let windowRemaining = 0;
  const todayLine = formatStampDate(new Date());

  while ((m = PARA_OPEN.exec(documentXml)) !== null) {
    if (m.index > cursor) out.push(documentXml.slice(cursor, m.index));
    const openTagEnd = m.index + m[0].length;
    const closeIdx = documentXml.indexOf("</w:p>", openTagEnd);
    if (closeIdx === -1) {
      out.push(documentXml.slice(m.index));
      cursor = documentXml.length;
      break;
    }
    let inner = documentXml.slice(openTagEnd, closeIdx);
    const concat = [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((mm) => mm[1])
      .join("");

    const isMarker = PARTY_B_STAMP_MARKER.test(concat);

    // 在窗口内：把段落里空白的「日期：年 月 日」覆盖为今天
    if (windowRemaining > 0 && BLANK_STAMP_DATE_RE.test(concat)) {
      const replaced = concat.replace(BLANK_STAMP_DATE_RE, todayLine);
      inner = rewriteParagraphText(inner, replaced);
    }

    out.push(m[0]);
    out.push(inner);
    out.push("</w:p>");

    if (isMarker) {
      out.push(partyBSealParagraph(relId, seedBase++));
      count += 1;
      windowRemaining = STAMP_DATE_WINDOW;
    } else if (windowRemaining > 0) {
      windowRemaining -= 1;
    }
    cursor = closeIdx + "</w:p>".length;
    PARA_OPEN.lastIndex = cursor;
  }
  if (cursor < documentXml.length) out.push(documentXml.slice(cursor));
  return { xml: out.join(""), count };
}

/** Bind the PNG into the docx zip + return the new relId. Mutates the zip /
 *  rels / content-types in place via the closure pattern used below. */
async function bindSealImage(zip: JSZip, sealPngBytes: Buffer): Promise<{
  relId: string;
  newRelsXml: string;
  newContentTypesXml: string;
}> {
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const typesFile = zip.file("[Content_Types].xml");
  if (!relsFile || !typesFile) throw new Error("DOCX 文件结构不完整，无法盖章");

  const relsXml = await relsFile.async("string");
  const contentTypesXml = await typesFile.async("string");

  const relId = nextRid(relsXml);
  const mediaName = `company-seal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  zip.file(`word/media/${mediaName}`, sealPngBytes);

  const newRelsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${relId}" Type="${REL_TYPE_IMAGE}" Target="media/${mediaName}"/></Relationships>`,
  );
  const newContentTypesXml = ensurePngContentType(contentTypesXml);

  return { relId, newRelsXml, newContentTypesXml };
}

/**
 * Stamp a DOCX (fallback for when LibreOffice→PDF is unavailable).
 * Behavior:
 *  1. Walk every paragraph; if its concatenated text matches 乙方（盖章）
 *     marker, append an inline seal image to that paragraph.
 *  2. If NO markers found, fall back to appending a single trailing seal
 *     at the document tail (legacy behavior).
 */
export async function stampDocx(docxBytes: Buffer, sealPngBytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("DOCX 文件结构不完整，无法盖章");
  const documentXml = await docFile.async("string");

  const { relId, newRelsXml, newContentTypesXml } = await bindSealImage(zip, sealPngBytes);

  const { xml: afterMarkers, count } = injectAtPartyBMarkers(documentXml, relId);
  const finalXml =
    count > 0
      ? afterMarkers
      : afterMarkers.replace("</w:body>", `${trailingSealParagraph(relId)}</w:body>`);

  zip.file("word/document.xml", finalXml);
  zip.file("word/_rels/document.xml.rels", newRelsXml);
  zip.file("[Content_Types].xml", newContentTypesXml);

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/**
 * Pre-stamp the source DOCX with 乙方（盖章）markers ONLY. Used by the
 * PDF flow: we want the marker positions to bake into the PDF before the
 * per-page bottom-right pdf-lib stamp runs. Returns the modified buffer +
 * count of markers replaced. If 0 markers found, returns the original buffer.
 */
export async function embedPartyBStampMarkers(
  docxBytes: Buffer,
  sealPngBytes: Buffer,
): Promise<{ buffer: Buffer; count: number }> {
  const zip = await JSZip.loadAsync(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("DOCX 文件结构不完整，无法预处理盖章");
  const documentXml = await docFile.async("string");

  // Cheap check: avoid binding the image if no markers exist
  if (!PARTY_B_STAMP_MARKER.test(documentXml.replace(/<[^>]+>/g, ""))) {
    return { buffer: docxBytes, count: 0 };
  }

  const { relId, newRelsXml, newContentTypesXml } = await bindSealImage(zip, sealPngBytes);
  const { xml, count } = injectAtPartyBMarkers(documentXml, relId);

  zip.file("word/document.xml", xml);
  zip.file("word/_rels/document.xml.rels", newRelsXml);
  zip.file("[Content_Types].xml", newContentTypesXml);

  const out = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  return { buffer: out, count };
}
