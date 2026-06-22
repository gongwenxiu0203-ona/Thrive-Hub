// Write a Word comment (<w:comment>) into a .docx so the annotation also
// shows up when the file is opened in Microsoft Word / WPS.
//
// Anchored to the very last <w:t> run in the document body — this keeps the
// implementation tolerant of arbitrary template structures (the alternative
// is to search for a specific text range, which is brittle when the
// reviewer is commenting on the contract overall rather than a specific
// passage).

import JSZip from "jszip";

const COMMENTS_PART = "word/comments.xml";
const COMMENTS_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const COMMENTS_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nextRelId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function ensureCommentsContentType(contentTypesXml: string): string {
  if (contentTypesXml.includes(`PartName="/word/comments.xml"`)) return contentTypesXml;
  return contentTypesXml.replace(
    "</Types>",
    `<Override PartName="/word/comments.xml" ContentType="${COMMENTS_CONTENT_TYPE}"/></Types>`,
  );
}

function ensureCommentsRel(relsXml: string): { xml: string; alreadyLinked: boolean } {
  if (relsXml.includes(COMMENTS_REL_TYPE)) return { xml: relsXml, alreadyLinked: true };
  const relId = nextRelId(relsXml);
  const xml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${relId}" Type="${COMMENTS_REL_TYPE}" Target="comments.xml"/></Relationships>`,
  );
  return { xml, alreadyLinked: false };
}

/** Find next available w:id for a new <w:comment>. */
function nextCommentId(commentsXml: string): number {
  const ids = [...commentsXml.matchAll(/<w:comment\s[^>]*w:id="(\d+)"/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  return ids.length === 0 ? 0 : Math.max(...ids) + 1;
}

/** Build a <w:comment> XML element. */
function commentElementXml(
  id: number,
  author: string,
  initials: string,
  isoDate: string,
  text: string,
): string {
  const paragraphs = text.split(/\r?\n/).map((line) => `<w:p><w:r><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`).join("");
  return `<w:comment w:id="${id}" w:author="${escXml(author)}" w:initials="${escXml(initials)}" w:date="${escXml(isoDate)}">${paragraphs}</w:comment>`;
}

/** Bracket the last <w:t> run with commentRangeStart/End + commentReference. */
function anchorCommentToLastRun(documentXml: string, id: number): string {
  // Find the last <w:r>...</w:r> that contains a <w:t>. Walk backwards.
  const lastTextRunRe = /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>(?:(?!<\/w:r>)[\s\S])*<\/w:r>/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = lastTextRunRe.exec(documentXml)) !== null) last = m;
  if (!last) return documentXml; // 没有任何文本运行，放弃锚定（仅写入 comments.xml）

  const before = documentXml.slice(0, last.index);
  const matched = last[0];
  const after = documentXml.slice(last.index + matched.length);

  const rangeStart = `<w:commentRangeStart w:id="${id}"/>`;
  const rangeEnd = `<w:commentRangeEnd w:id="${id}"/>`;
  const refRun = `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>`;

  return `${before}${rangeStart}${matched}${rangeEnd}${refRun}${after}`;
}

const EMPTY_COMMENTS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:comments>`;

/** Append a Word comment to the given .docx. Returns the modified buffer +
 *  the new comment's w:id (useful if the caller wants to log it). */
export async function appendDocxComment(
  docxBytes: Buffer,
  opts: { author: string; initials?: string; text: string; isoDate?: string },
): Promise<{ buffer: Buffer; commentId: number }> {
  const zip = await JSZip.loadAsync(docxBytes);
  const docFile = zip.file("word/document.xml");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const typesFile = zip.file("[Content_Types].xml");
  if (!docFile || !relsFile || !typesFile) {
    throw new Error("DOCX 文件结构不完整，无法写入批注");
  }

  let documentXml = await docFile.async("string");
  let relsXml = await relsFile.async("string");
  let contentTypesXml = await typesFile.async("string");

  // 1) 确保 [Content_Types].xml 注册了 comments.xml
  contentTypesXml = ensureCommentsContentType(contentTypesXml);
  // 2) 确保 document.xml.rels 关联了 comments.xml
  const r = ensureCommentsRel(relsXml);
  relsXml = r.xml;

  // 3) 读取/初始化 comments.xml
  const commentsFile = zip.file(COMMENTS_PART);
  const existing = commentsFile ? await commentsFile.async("string") : EMPTY_COMMENTS_XML;
  const commentId = nextCommentId(existing);
  const isoDate = opts.isoDate ?? new Date().toISOString();
  const newComment = commentElementXml(
    commentId,
    opts.author,
    opts.initials ?? opts.author.slice(0, 1),
    isoDate,
    opts.text,
  );
  // 在 </w:comments> 前追加
  const updatedComments = existing.includes("</w:comments>")
    ? existing.replace("</w:comments>", `${newComment}</w:comments>`)
    : `${EMPTY_COMMENTS_XML.replace("</w:comments>", `${newComment}</w:comments>`)}`;

  // 4) 在 document.xml 里锚定到最后一个文本运行
  documentXml = anchorCommentToLastRun(documentXml, commentId);

  // 5) 写回
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file(COMMENTS_PART, updatedComments);

  const out = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  return { buffer: out, commentId };
}
