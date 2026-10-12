import "server-only";
import { prisma, Prisma } from "../db";
import { hasPerm, requirePerm, type Ctx } from "../context";
import { userNames } from "./common";

/** Títulos (a receber/pagar) e pagamentos de uma origem, para a ficha da operação. */
export async function sourceFinance(ctx: Ctx, sourceTypes: string[], sourceId: string) {
  const titles = await prisma.title.findMany({
    where: { orgId: ctx.orgId, sourceType: { in: sourceTypes }, sourceId },
    include: { settlements: { orderBy: { date: "asc" } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  const txIds = titles.flatMap((t) => t.settlements.map((s) => s.transactionId)).filter(Boolean) as string[];
  const txs = await prisma.moneyTransaction.findMany({ where: { orgId: ctx.orgId, id: { in: txIds } }, include: { account: { select: { name: true } } } });
  return titles.map((t) => ({
    id: t.id,
    direction: t.direction,
    description: t.description,
    amountCents: t.amountCents,
    settledCents: t.settledCents,
    openCents: t.status === "CANCELLED" ? 0 : t.amountCents - t.settledCents,
    dueDate: t.dueDate,
    status: t.status,
    installmentNo: t.installmentNo,
    installmentCount: t.installmentCount,
    sourceType: t.sourceType,
    settlements: t.settlements.map((s) => {
      const tx = txs.find((x) => x.id === s.transactionId);
      return { id: s.id, amountCents: s.amountCents, kind: s.kind, date: s.date, note: s.note, account: tx?.account.name ?? null, method: tx?.method ?? null, reversal: !!s.reversalOfId };
    }),
  }));
}

export async function listPurchases(ctx: Ctx, f: { q?: string; status?: string; page?: number }) {
  requirePerm(ctx, "purchases.manage");
  const where: Prisma.PurchaseWhereInput = { orgId: ctx.orgId };
  if (f.status) where.status = f.status;
  if (f.q?.trim()) where.OR = [{ code: { contains: f.q.trim(), mode: "insensitive" } }, { lines: { some: { description: { contains: f.q.trim(), mode: "insensitive" } } } }];
  const page = Math.max(1, f.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 50, take: 50, include: { lines: { select: { description: true, quantity: true } } } }),
  ]);
  const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const open = await prisma.title.groupBy({
    by: ["sourceId"],
    where: { orgId: ctx.orgId, sourceType: "PURCHASE", sourceId: { in: rows.map((r) => r.id) }, status: { in: ["OPEN", "PARTIAL"] } },
    _sum: { amountCents: true, settledCents: true },
  });
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 50)),
    rows: rows.map((r) => {
      const o = open.find((x) => x.sourceId === r.id);
      return {
        id: r.id,
        code: r.code,
        date: r.date,
        status: r.status,
        contact: contacts.find((c) => c.id === r.contactId)?.name ?? null,
        description: r.lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.description}` : l.description)).join(", "),
        units: r.lines.reduce((a, l) => a + l.quantity, 0),
        totalCents: r.totalCents,
        openCents: o ? (o._sum.amountCents ?? 0) - (o._sum.settledCents ?? 0) : 0,
      };
    }),
  };
}

export async function getPurchaseDetail(ctx: Ctx, id: string) {
  requirePerm(ctx, "purchases.manage");
  const p = await prisma.purchase.findFirst({ where: { id, orgId: ctx.orgId }, include: { lines: true, extras: true } });
  if (!p) return null;
  const [contact, items, finance, attachments, audit] = await Promise.all([
    p.contactId ? prisma.contact.findFirst({ where: { id: p.contactId, orgId: ctx.orgId }, select: { id: true, name: true, whatsapp: true } }) : null,
    prisma.item.findMany({
      where: { orgId: ctx.orgId, sourcePurchaseLineId: { in: p.lines.map((l) => l.id) } },
      select: { id: true, code: true, title: true, status: true, serial: true, unitCostCents: true, qtyInitial: true, sourcePurchaseLineId: true, tracking: true },
      orderBy: { code: "asc" },
    }),
    sourceFinance(ctx, ["PURCHASE"], p.id),
    prisma.attachment.findMany({ where: { orgId: ctx.orgId, entityType: "Purchase", entityId: p.id }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ where: { orgId: ctx.orgId, entityType: "Purchase", entityId: p.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const names = await userNames(audit.map((a) => a.userId));
  return {
    ...p,
    contact,
    items,
    finance,
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, kind: a.kind, isCover: a.isCover })),
    history: audit.map((a) => ({ id: a.id, summary: a.summary, at: a.createdAt, user: a.userId ? names.get(a.userId) ?? null : null })),
  };
}

export async function listSales(ctx: Ctx, f: { q?: string; situacao?: string; entrega?: string; page?: number; contactId?: string }) {
  requirePerm(ctx, "sales.manage");
  const where: Prisma.SaleWhereInput = { orgId: ctx.orgId };
  if (f.situacao === "orcamentos") where.status = "QUOTE";
  else if (f.situacao === "vendas") where.status = "CONFIRMED";
  else if (f.situacao === "canceladas") where.status = "CANCELLED";
  if (f.entrega === "pendente") {
    where.status = "CONFIRMED";
    where.deliveryStatus = "PENDING";
  }
  if (f.contactId) where.contactId = f.contactId;
  if (f.q?.trim()) where.OR = [{ code: { contains: f.q.trim(), mode: "insensitive" } }, { lines: { some: { description: { contains: f.q.trim(), mode: "insensitive" } } } }];
  const page = Math.max(1, f.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 50, take: 50, include: { lines: { select: { description: true, quantity: true, costCents: true, unitPriceCents: true } } } }),
  ]);
  const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const open = await prisma.title.groupBy({
    by: ["sourceId"],
    where: { orgId: ctx.orgId, sourceType: "SALE", direction: "RECEIVABLE", sourceId: { in: rows.map((r) => r.id) }, status: { in: ["OPEN", "PARTIAL"] } },
    _sum: { amountCents: true, settledCents: true },
  });
  const seeCost = hasPerm(ctx, "inventory.cost");
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 50)),
    rows: rows.map((r) => {
      const o = open.find((x) => x.sourceId === r.id);
      const cost = r.lines.every((l) => l.costCents !== null) ? r.lines.reduce((a, l) => a + (l.costCents ?? 0), 0) : null;
      return {
        id: r.id,
        code: r.code,
        date: r.date,
        status: r.status,
        deliveryStatus: r.deliveryStatus,
        quoteValidUntil: r.quoteValidUntil,
        contact: contacts.find((c) => c.id === r.contactId)?.name ?? null,
        description: r.lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.description}` : l.description)).join(", "),
        totalCents: r.totalCents,
        openCents: o ? (o._sum.amountCents ?? 0) - (o._sum.settledCents ?? 0) : 0,
        grossCents: seeCost && r.status === "CONFIRMED" && cost !== null ? r.totalCents - r.shippingChargedCents - cost : null,
      };
    }),
  };
}

export async function getSaleDetail(ctx: Ctx, id: string) {
  requirePerm(ctx, "sales.manage");
  const s = await prisma.sale.findFirst({ where: { id, orgId: ctx.orgId }, include: { lines: true, returns: { orderBy: { date: "asc" } } } });
  if (!s) return null;
  const seeCost = hasPerm(ctx, "inventory.cost");
  const [contact, items, finance, results, attachments, tradeIns, audit, notes] = await Promise.all([
    s.contactId ? prisma.contact.findFirst({ where: { id: s.contactId, orgId: ctx.orgId }, select: { id: true, name: true, whatsapp: true, phone: true, email: true, document: true, city: true } }) : null,
    prisma.item.findMany({ where: { orgId: ctx.orgId, id: { in: s.lines.map((l) => l.itemId) } }, select: { id: true, code: true, title: true, serial: true, status: true, condition: true, tracking: true, warrantyUntil: true, ownership: true } }),
    sourceFinance(ctx, ["SALE", "SALE_REFUND", "CONSIGNMENT"], s.id),
    seeCost ? prisma.resultEntry.findMany({ where: { orgId: ctx.orgId, saleId: s.id } }) : [],
    prisma.attachment.findMany({ where: { orgId: ctx.orgId, entityType: "Sale", entityId: s.id }, orderBy: { createdAt: "asc" } }),
    prisma.item.findMany({ where: { orgId: ctx.orgId, sourceSaleId: s.id }, select: { id: true, code: true, title: true, status: true, unitCostCents: true } }),
    prisma.auditLog.findMany({ where: { orgId: ctx.orgId, entityType: "Sale", entityId: s.id }, orderBy: { createdAt: "asc" } }),
    prisma.note.findMany({ where: { orgId: ctx.orgId, entityType: "Sale", entityId: s.id }, orderBy: { createdAt: "desc" } }),
  ]);
  // Também as devoluções têm reembolso em SALE_REFUND com sourceId = id da devolução
  const refunds = s.returns.length ? await sourceFinance(ctx, ["SALE_REFUND"], s.returns[0].id) : [];
  const extraRefunds = s.returns.length > 1 ? (await Promise.all(s.returns.slice(1).map((r) => sourceFinance(ctx, ["SALE_REFUND"], r.id)))).flat() : [];
  const names = await userNames([...audit.map((a) => a.userId), ...notes.map((n) => n.userId)]);
  const sum = (k: string) => results.filter((r) => r.kind === k).reduce((a, r) => a + r.amountCents, 0);
  const profit = seeCost && s.status !== "QUOTE"
    ? {
        revenueCents: sum("REVENUE"),
        cogsCents: sum("COGS"),
        salesExpenseCents: sum("SALES_EXPENSE"),
        grossCents: sum("REVENUE") - sum("COGS"),
        netCents: sum("REVENUE") - sum("COGS") - sum("SALES_EXPENSE"),
        unknownCost: s.lines.some((l) => l.costStatus === "UNKNOWN"),
      }
    : null;
  return {
    ...s,
    lines: s.lines.map((l) => ({ ...l, costCents: seeCost ? l.costCents : null, item: items.find((i) => i.id === l.itemId) ?? null })),
    contact,
    finance: [...finance, ...refunds, ...extraRefunds],
    profit,
    tradeIns: tradeIns.map((t) => ({ ...t, unitCostCents: seeCost ? t.unitCostCents : null })),
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, kind: a.kind, isCover: a.isCover })),
    history: audit.map((a) => ({ id: a.id, summary: a.summary, at: a.createdAt, user: a.userId ? names.get(a.userId) ?? null : null })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, at: n.createdAt, user: n.userId ? names.get(n.userId) ?? null : null })),
  };
}

export type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSaleDetail>>>;
