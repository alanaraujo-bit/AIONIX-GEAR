import "server-only";
import { prisma } from "../db";
import { hasPerm, type Ctx } from "../context";
import { ForbiddenError } from "../errors";
import { userNames } from "./common";

function assertCan(ctx: Ctx) {
  if (!(hasPerm(ctx, "contacts.manage") || hasPerm(ctx, "purchases.manage") || hasPerm(ctx, "trades.manage"))) throw new ForbiddenError();
}

export async function listContacts(ctx: Ctx, f: { q?: string; tipo?: string; arquivados?: string }) {
  assertCan(ctx);
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  const rows = await prisma.contact.findMany({
    where: {
      orgId: ctx.orgId,
      archived: f.arquivados === "1" ? true : false,
      ...(f.tipo === "clientes" ? { isCustomer: true } : f.tipo === "fornecedores" ? { isSupplier: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { city: { contains: q, mode: "insensitive" as const } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { whatsapp: { contains: digits } }, { document: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 300,
  });
  const ids = rows.map((r) => r.id);
  const [sales, purchases, open] = await Promise.all([
    prisma.sale.groupBy({ by: ["contactId"], where: { orgId: ctx.orgId, contactId: { in: ids }, status: "CONFIRMED" }, _sum: { totalCents: true }, _count: true }),
    prisma.purchase.groupBy({ by: ["contactId"], where: { orgId: ctx.orgId, contactId: { in: ids }, status: "CONFIRMED" }, _sum: { totalCents: true }, _count: true }),
    prisma.title.groupBy({ by: ["contactId", "direction"], where: { orgId: ctx.orgId, contactId: { in: ids }, status: { in: ["OPEN", "PARTIAL"] } }, _sum: { amountCents: true, settledCents: true } }),
  ]);
  const seeMoney = hasPerm(ctx, "sales.manage") || hasPerm(ctx, "finance.view");
  return rows.map((r) => {
    const rec = open.find((o) => o.contactId === r.id && o.direction === "RECEIVABLE");
    const pay = open.find((o) => o.contactId === r.id && o.direction === "PAYABLE");
    return {
      id: r.id,
      name: r.name,
      isCustomer: r.isCustomer,
      isSupplier: r.isSupplier,
      whatsapp: r.whatsapp,
      phone: r.phone,
      city: r.city,
      tags: r.tags,
      anonymized: !!r.anonymizedAt,
      salesCount: sales.find((s) => s.contactId === r.id)?._count ?? 0,
      salesCents: seeMoney ? sales.find((s) => s.contactId === r.id)?._sum.totalCents ?? 0 : null,
      purchasesCount: purchases.find((s) => s.contactId === r.id)?._count ?? 0,
      receivableCents: seeMoney && rec ? (rec._sum.amountCents ?? 0) - (rec._sum.settledCents ?? 0) : 0,
      payableCents: seeMoney && pay ? (pay._sum.amountCents ?? 0) - (pay._sum.settledCents ?? 0) : 0,
    };
  });
}

export async function getContactDetail(ctx: Ctx, id: string) {
  assertCan(ctx);
  const c = await prisma.contact.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!c) return null;
  const seeSales = hasPerm(ctx, "sales.manage");
  const seePurch = hasPerm(ctx, "purchases.manage");
  const seeTrades = hasPerm(ctx, "trades.manage");
  const seeFin = hasPerm(ctx, "finance.view") || seeSales;
  const [sales, purchases, trades, titles, owned, notes, opportunities] = await Promise.all([
    seeSales ? prisma.sale.findMany({ where: { orgId: ctx.orgId, contactId: c.id }, orderBy: { date: "desc" }, take: 50, include: { lines: { select: { description: true } } } }) : [],
    seePurch ? prisma.purchase.findMany({ where: { orgId: ctx.orgId, contactId: c.id }, orderBy: { date: "desc" }, take: 50, include: { lines: { select: { description: true } } } }) : [],
    seeTrades ? prisma.trade.findMany({ where: { orgId: ctx.orgId, contactId: c.id }, orderBy: { date: "desc" }, take: 50 }) : [],
    seeFin ? prisma.title.findMany({ where: { orgId: ctx.orgId, contactId: c.id, status: { in: ["OPEN", "PARTIAL"] } }, orderBy: { dueDate: "asc" }, include: { settlements: true } }) : [],
    prisma.item.findMany({ where: { orgId: ctx.orgId, ownerContactId: c.id, status: { notIn: ["VOID"] } }, select: { id: true, code: true, title: true, status: true, ownership: true } }),
    prisma.note.findMany({ where: { orgId: ctx.orgId, entityType: "Contact", entityId: c.id }, orderBy: { createdAt: "desc" } }),
    prisma.opportunity.findMany({ where: { orgId: ctx.orgId, contactId: c.id }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  const names = await userNames(notes.map((n) => n.userId));
  return {
    contact: c,
    sales: sales.map((s) => ({ id: s.id, code: s.code, status: s.status, date: s.date, totalCents: s.totalCents, description: s.lines.map((l) => l.description).join(", ") })),
    purchases: purchases.map((p) => ({ id: p.id, code: p.code, status: p.status, date: p.date, totalCents: p.totalCents, description: p.lines.map((l) => l.description).join(", ") })),
    trades: trades.map((t) => ({ id: t.id, code: t.code, status: t.status, date: t.date, title: t.title })),
    titles: titles.map((t) => ({ id: t.id, direction: t.direction, description: t.description, amountCents: t.amountCents, settledCents: t.settledCents, openCents: t.amountCents - t.settledCents, dueDate: t.dueDate, status: t.status, installmentNo: t.installmentNo, installmentCount: t.installmentCount, settlements: [] as never[] })),
    owned,
    noteList: notes.map((n) => ({ id: n.id, body: n.body, at: n.createdAt, user: n.userId ? names.get(n.userId) ?? null : null })),
    opportunities: opportunities.map((o) => ({ id: o.id, title: o.title, stage: o.stage, valueCents: o.valueCents })),
    canSettle: hasPerm(ctx, "finance.manage"),
  };
}
