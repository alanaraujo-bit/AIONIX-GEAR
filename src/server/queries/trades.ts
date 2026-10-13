import "server-only";
import { prisma, Prisma } from "../db";
import { hasPerm, requirePerm, type Ctx } from "../context";
import { userNames } from "./common";
import { sourceFinance } from "./commerce";
import { analyzeTrade, type TradeAnalysis } from "../domain/trades";

export async function listTrades(ctx: Ctx, f: { q?: string; situacao?: string }) {
  requirePerm(ctx, "trades.manage");
  const where: Prisma.TradeWhereInput = { orgId: ctx.orgId };
  if (f.situacao) where.status = f.situacao;
  if (f.q?.trim()) where.OR = [{ code: { contains: f.q.trim(), mode: "insensitive" } }, { title: { contains: f.q.trim(), mode: "insensitive" } }];
  const rows = await prisma.trade.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: 100, include: { outLines: true, inLines: true } });
  const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  return rows.map((r) => {
    const v = r.valuation as TradeAnalysis | null;
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      status: r.status,
      date: r.date,
      contact: contacts.find((c) => c.id === r.contactId)?.name ?? null,
      outCount: r.outLines.length,
      inCount: r.inLines.length,
      outAgreedCents: r.outLines.reduce((a, l) => a + l.agreedValueCents, 0),
      inAgreedCents: r.inLines.reduce((a, l) => a + l.agreedValueCents, 0),
      netCashCents: r.cashInCents - r.cashOutCents - r.feesCents,
      upsideCents: v?.potentialUpsideCents ?? null,
    };
  });
}

export async function getTradeDetail(ctx: Ctx, id: string) {
  requirePerm(ctx, "trades.manage");
  const t = await prisma.trade.findFirst({ where: { id, orgId: ctx.orgId }, include: { outLines: true, inLines: true, revisions: { orderBy: { number: "asc" } } } });
  if (!t) return null;
  const [contact, outItems, inItems, finance, attachments, audit, notes, categories] = await Promise.all([
    t.contactId ? prisma.contact.findFirst({ where: { id: t.contactId, orgId: ctx.orgId }, select: { id: true, name: true, whatsapp: true } }) : null,
    prisma.item.findMany({ where: { orgId: ctx.orgId, id: { in: t.outLines.map((l) => l.itemId) } }, include: { product: { include: { category: true } } } }),
    prisma.item.findMany({ where: { orgId: ctx.orgId, sourceTradeId: t.id }, select: { id: true, code: true, title: true, status: true, unitCostCents: true, costStatus: true } }),
    sourceFinance(ctx, ["TRADE"], t.id),
    prisma.attachment.findMany({ where: { orgId: ctx.orgId, entityType: "Trade", entityId: t.id }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ where: { orgId: ctx.orgId, entityType: "Trade", entityId: t.id }, orderBy: { createdAt: "asc" } }),
    prisma.note.findMany({ where: { orgId: ctx.orgId, entityType: "Trade", entityId: t.id }, orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true, kind: true } }),
  ]);
  const names = await userNames([...audit.map((a) => a.userId), ...notes.map((n) => n.userId), ...t.revisions.map((r) => r.userId)]);
  const live =
    t.status === "CONFIRMED" && t.valuation
      ? (t.valuation as unknown as TradeAnalysis)
      : analyzeTrade(
          t.outLines.map((l) => {
            const it = outItems.find((i) => i.id === l.itemId)!;
            return {
              itemId: l.itemId,
              code: it?.code ?? "?",
              title: it?.title ?? "?",
              quantity: l.quantity,
              unitCostCents: it?.unitCostCents ?? null,
              costStatus: it?.costStatus ?? "UNKNOWN",
              agreedValueCents: l.agreedValueCents,
              estimatedValueCents: l.estimatedValueCents ?? it?.estimatedValueCents ?? null,
            };
          }),
          t.inLines.map((l) => ({ title: l.title, quantity: l.quantity, agreedValueCents: l.agreedValueCents, estimatedValueCents: l.estimatedValueCents, condition: l.condition })),
          t,
        );
  return {
    ...t,
    contact,
    analysis: live,
    outLines: t.outLines.map((l) => {
      const it = outItems.find((i) => i.id === l.itemId);
      return { ...l, item: it ? { id: it.id, code: it.code, title: it.title, status: it.status, serial: it.serial, category: it.product.category.name, unitCostCents: it.unitCostCents, costStatus: it.costStatus, estimatedValueCents: it.estimatedValueCents, tracking: it.tracking } : null };
    }),
    inLines: t.inLines.map((l) => ({ ...l, category: categories.find((c) => c.id === l.categoryId)?.name ?? "" })),
    receivedItems: inItems,
    finance,
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, kind: a.kind, isCover: a.isCover })),
    revisions: t.revisions.map((r) => ({ id: r.id, number: r.number, author: r.author, note: r.note, snapshot: r.snapshot as { cashInCents: number; cashOutCents: number; feesCents: number; out: { agreedValueCents: number }[]; in: { title: string; agreedValueCents: number }[] }, at: r.createdAt, user: r.userId ? names.get(r.userId) ?? null : null })),
    history: audit.map((a) => ({ id: a.id, summary: a.summary, at: a.createdAt, user: a.userId ? names.get(a.userId) ?? null : null })),
    noteList: notes.map((n) => ({ id: n.id, body: n.body, at: n.createdAt, user: n.userId ? names.get(n.userId) ?? null : null })),
    seeCost: hasPerm(ctx, "inventory.cost"),
  };
}

export type TradeDetail = NonNullable<Awaited<ReturnType<typeof getTradeDetail>>>;
