import DiscountApp from "./DiscountApp"; import { getDiscountProjects } from "./project-options";
export default async function Page(){return <DiscountApp projects={await getDiscountProjects()} view="summary"/>}
