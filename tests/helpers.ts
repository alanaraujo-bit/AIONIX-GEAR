import { prisma } from "@/server/db";
import { provisionOrganization } from "@/server/domain/team";
import type { Ctx } from "@/server/context";
import type { Role } from "@/lib/permissions";

let seq = 0;

export async function newOrg(name = "Loja Teste") {
  seq++;
  const email = `owner${Date.now()}${seq}@teste.dev`;
  const p = await provisionOrganization({ orgName: `${name} ${seq}`, ownerEmail: email, ownerName: "Dono" });
  const ctx: Ctx = { orgId: p.orgId, userId: p.userId, role: "OWNER" };
  const categories = await prisma.category.findMany({ where: { orgId: p.orgId } });
  const cat = (kind: string) => categories.find((c) => c.kind === kind)!.id;
  const accounts = await prisma.moneyAccount.findMany({ where: { orgId: p.orgId }, orderBy: { createdAt: "asc" } });
  const location = await prisma.location.findFirstOrThrow({ where: { orgId: p.orgId } });
  return { ctx, orgId: p.orgId, cat, cash: accounts[0].id, bank: accounts[1].id, locationId: location.id, setupToken: p.setupToken };
}

export async function memberCtx(orgId: string, role: Role): Promise<Ctx> {
  seq++;
  const user = await prisma.user.create({ data: { email: `m${Date.now()}${seq}@teste.dev`, name: `Membro ${role}` } });
  await prisma.membership.create({ data: { orgId, userId: user.id, role } });
  return { orgId, userId: user.id, role };
}

export async function item(orgId: string, id: string) {
  return prisma.item.findFirstOrThrow({ where: { orgId, id } });
}

export async function balance(orgId: string, accountId?: string) {
  const rows = await prisma.moneyTransaction.findMany({ where: { orgId, ...(accountId ? { accountId } : {}) } });
  return rows.reduce((a, r) => a + (r.direction === "IN" ? r.amountCents : -r.amountCents), 0);
}

export const ALL_TIME = { from: new Date("2000-01-01"), to: new Date("2100-01-01") };
