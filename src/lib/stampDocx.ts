import JSZip from "jszip";

const REL_TYPE_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const PNG_CONTENT_TYPE = '<Default Extension="png" ContentType="image/png"/>';

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

function drawingXml(relId: string): string {
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

export async function stampDocx(docxBytes: Buffer, sealPngBytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBytes);
  const docFile = zip.file("word/document.xml");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const typesFile = zip.file("[Content_Types].xml");
  if (!docFile || !relsFile || !typesFile) {
    throw new Error("DOCX 文件结构不完整，无法盖章");
  }

  let documentXml = await docFile.async("string");
  let relsXml = await relsFile.async("string");
  let contentTypesXml = await typesFile.async("string");

  const relId = nextRid(relsXml);
  const mediaName = `company-seal-${Date.now()}.png`;
  zip.file(`word/media/${mediaName}`, sealPngBytes);

  relsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${relId}" Type="${REL_TYPE_IMAGE}" Target="media/${mediaName}"/></Relationships>`,
  );
  contentTypesXml = ensurePngContentType(contentTypesXml);

  documentXml = documentXml.replace("</w:body>", `${drawingXml(relId)}</w:body>`);

  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  zip.file("[Content_Types].xml", contentTypesXml);

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
