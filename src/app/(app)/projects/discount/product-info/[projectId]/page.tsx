import DiscountApp from "../../DiscountApp"; import { getDiscountProjects } from "../../project-options";
export default async function Page({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <DiscountApp projects={await getDiscountProjects()} view="products" detailProjectId={projectId}/>}
