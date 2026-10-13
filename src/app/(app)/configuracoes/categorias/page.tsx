import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const app = await requirePage("settings.manage");
  const cats = await prisma.category.findMany({ where: { orgId: app.ctx.orgId }, orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  return <CategoriesManager categories={cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, archived: c.archived, products: c._count.products }))} />;
}
