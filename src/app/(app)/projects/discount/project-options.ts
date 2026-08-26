import { prisma } from "@/lib/prisma";
import { projectScope } from "@/lib/dataScope";
import { requireSession } from "@/lib/session";
export async function getDiscountProjects(){const session=await requireSession();return prisma.project.findMany({where:{deletedAt:null,...projectScope({userId:session.userId,role:session.role},session.role==="ADMIN"?"all":"mine")},select:{id:true,name:true},orderBy:{createdAt:"desc"}})}
