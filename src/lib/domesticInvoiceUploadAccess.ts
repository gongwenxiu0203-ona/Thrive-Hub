import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { isStaff } from "@/lib/permissions";
import { DomesticUploadError } from "./domesticInvoiceUpload";
import { realpath, readFile } from "node:fs/promises";
import path from "node:path";

export async function domesticInvoiceOriginal(fileUrl: string) {
  const match=fileUrl.match(/^\/uploads\/([^/\\?#%\x00-\x1f]+)$/);
  if(!match || path.basename(match[1])!==match[1]) throw new DomesticUploadError("发票原件地址无效。",404);
  const name=match[1];
  const mime:Record<string,string>={".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"};
  const type=mime[path.extname(name).toLowerCase()];
  if(!type) throw new DomesticUploadError("发票原件类型无效。",404);
  const root=await realpath(path.resolve(process.cwd(),"uploads"));
  const target=await realpath(path.resolve(root,name));
  if(!target.startsWith(root+path.sep)) throw new DomesticUploadError("发票原件地址无效。",404);
  return {name,type,data:await readFile(target)};
}

export async function domesticInvoiceUploader() {
  const session = await getSession();
  if (!session) throw new DomesticUploadError("登录已失效，请重新登录。",401);
  const user = await prisma.user.findUnique({where:{id:session.userId},select:{role:true,status:true}});
  if (!user || user.status !== "APPROVED" || !isStaff(user.role))
    throw new DomesticUploadError("仅已启用的内部账号可以登记国内发票。",403);
  await requireFeaturePermission(session,"finance.domestic_invoices","EDIT");
  return session;
}
