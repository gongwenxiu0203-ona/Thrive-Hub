import path from "node:path";

export class DomesticUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function domesticInvoiceForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !/boundary=/i.test(contentType))
    throw new DomesticUploadError("上传请求格式不正确，请重新选择文件后重试。请勿手动设置 Content-Type。");
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 21 * 1024 * 1024)
    throw new DomesticUploadError("上传请求超过大小限制，请选择20MB以内的文件。", 413);
  try { return await request.formData(); }
  catch { throw new DomesticUploadError("上传数据不完整或连接已中断，请重新选择原件后重试；已填写的信息不会自动清除。"); }
}

export async function domesticInvoiceFile(value: FormDataEntryValue | null): Promise<File> {
  if (!(value instanceof File) || value.size === 0 || value.size > 20 * 1024 * 1024)
    throw new DomesticUploadError("请选择不超过20MB的PDF、JPG、PNG或WebP发票原件。");
  const ext = path.extname(value.name).toLowerCase();
  const types: Record<string,string> = { ".pdf":"application/pdf", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp" };
  const type = types[ext];
  if (!type || (value.type && value.type !== "application/octet-stream" && value.type !== type))
    throw new DomesticUploadError("文件扩展名或类型不符合要求，请上传PDF、JPG、PNG或WebP原件。");
  const header = Buffer.from(await value.slice(0, 16).arrayBuffer());
  const valid = type === "application/pdf" ? header.subarray(0,5).toString() === "%PDF-"
    : type === "image/png" ? header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === "image/jpeg" ? header[0] === 255 && header[1] === 216 && header[2] === 255
    : header.subarray(0,4).toString() === "RIFF" && header.subarray(8,12).toString() === "WEBP";
  if (!valid) throw new DomesticUploadError("文件内容与扩展名不符，或文件已损坏，请重新上传原始文件。");
  return value.type === type ? value : new File([value],value.name,{type});
}
