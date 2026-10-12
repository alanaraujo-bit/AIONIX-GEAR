import "server-only";
import { prisma } from "../db";
import { hasPerm, type Ctx } from "../context";

export type LocationOption = { id: string; name: string; path: string; kind: string; parentId: string | null; archived: boolean };

export async function locationOptions(ctx: Ctx, includeArchived = false): Promise<LocationOption[]> {
  const all = await prisma.location.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } });
  const byId = new Map(all.map((l) => [l.id, l]));
  const path = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 10) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" › ");
  };
  return all
    .filter((l) => includeArchived || !l.archived)
    .map((l) => ({ id: l.id, name: l.name, path: path(l.id), kind: l.kind, parentId: l.parentId, archived: l.archived }))
    .sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
}

export async function categoryOptions(ctx: Ctx) {
  return prisma.category.findMany({ where: { orgId: ctx.orgId, archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } });
}

export async function contactOptions(ctx: Ctx, filter?: "customer" | "supplier") {
  return prisma.contact.findMany({
    where: {
      orgId: ctx.orgId,
      archived: false,
      anonymizedAt: null,
      ...(filter === "customer" ? { isCustomer: true } : filter === "supplier" ? { isSupplier: true } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, whatsapp: true, phone: true, city: true },
    take: 2000,
  });
}

export async function accountOptions(ctx: Ctx) {
  if (!hasPerm(ctx, "finance.manage") && !hasPerm(ctx, "sales.manage") && !hasPerm(ctx, "purchases.manage") && !hasPerm(ctx, "builds.manage")) return [];
  return prisma.moneyAccount.findMany({ where: { orgId: ctx.orgId, archived: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, kind: true } });
}

export async function productOptions(ctx: Ctx) {
  return prisma.product.findMany({
    where: { orgId: ctx.orgId, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, brand: true, model: true, categoryId: true, tracking: true, specs: true },
    take: 3000,
  });
}

export async function userNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
