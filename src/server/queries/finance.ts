import "server-only";
import { prisma, Prisma } from "../db";
import { requirePerm, hasPerm, type Ctx } from "../context";
import { accountBalances } from "../domain/finance";
import { cashSummary } from "../domain/reports";

export async function financeOverview(ctx: Ctx) {
  requirePerm(ctx, "finance.view");
  const [balances, summary, categories] = await Promise.all([
    accountBalances(ctx.orgId),
    cashSummary(ctx.orgId),
    prisma.financeCategory.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
  ]);
  return { balances, summary, categories };
}

export async function listTransactions(ctx: Ctx, f: { accountId?: string; kind?: string; from?: Date; to?: Date; q?: string; page?: number }) {
  requirePerm(ctx, "finance.view");
  const where: Prisma.MoneyTransactionWhereInput = { orgId: ctx.orgId };
  if (f.accountId) where.accountId = f.accountId;
  if (f.kind === "in") where.direction = "IN";
  else if (f.kind === "out") where.direction = "OUT";
  else if (f.kind) where.kind = f.kind;
  if (f.from || f.to) where.date = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.q?.trim()) where.description = { contains: f.q.trim(), mode: "insensitive" };
  const page = Math.max(1, f.page ?? 1);
  const [total, rows, sums] = await Promise.all([
    prisma.moneyTransaction.count({ where }),
    prisma.moneyTransaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 100, take: 100, include: { account: { select: { name: true } } } }),
    prisma.moneyTransaction.groupBy({ by: ["direction"], where, _sum: { amountCents: true } }),
  ]);
  const inSum = sums.find((s) => s.direction === "IN")?._sum.amountCents ?? 0;
  const outSum = sums.find((s) => s.direction === "OUT")?._sum.amountCents ?? 0;
  const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 100)),
    inCents: inSum,
    outCents: outSum,
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date,
      account: r.account.name,
      direction: r.direction,
      amountCents: r.amountCents,
      kind: r.kind,
      method: r.method,
      description: r.description,
      contact: contacts.find((c) => c.id === r.contactId)?.name ?? null,
      refType: r.refType,
      refId: r.refId,
      reversal: !!r.reversalOfId,
    })),
  };
}

export async function listTitles(ctx: Ctx, direction: "RECEIVABLE" | "PAYABLE", f: { situacao?: string; q?: string }) {
  if (direction === "RECEIVABLE" && !hasPerm(ctx, "finance.view")) requirePerm(ctx, "sales.manage");
  else if (direction === "PAYABLE") requirePerm(ctx, "finance.view");
  const now = new Date();
  const where: Prisma.TitleWhereInput = {
    orgId: ctx.orgId,
    direction,
    ...(direction === "RECEIVABLE" && !hasPerm(ctx, "finance.view") ? { sourceType: "SALE" } : {}),
  };
  if (f.situacao === "atrasados") Object.assign(where, { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: now } });
  else if (f.situacao === "quitados") where.status = "PAID";
  else if (f.situacao === "todos") {
    /* sem filtro */
  } else where.status = { in: ["OPEN", "PARTIAL"] };
  if (f.q?.trim()) where.description = { contains: f.q.trim(), mode: "insensitive" };
  const rows = await prisma.title.findMany({ where, orderBy: [{ dueDate: "asc" }], take: 300, include: { settlements: { orderBy: { date: "asc" } } } });
  const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } }, select: { id: true, name: true, whatsapp: true } });
  const txIds = rows.flatMap((t) => t.settlements.map((s) => s.transactionId)).filter(Boolean) as string[];
  const txs = await prisma.moneyTransaction.findMany({ where: { orgId: ctx.orgId, id: { in: txIds } }, include: { account: { select: { name: true } } } });
  const totals = await prisma.title.groupBy({
    by: ["direction"],
    where: { orgId: ctx.orgId, direction, status: { in: ["OPEN", "PARTIAL"] } },
    _sum: { amountCents: true, settledCents: true },
  });
  const overdue = await prisma.title.aggregate({ where: { orgId: ctx.orgId, direction, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: now } }, _sum: { amountCents: true, settledCents: true } });
  const next7 = await prisma.title.aggregate({ where: { orgId: ctx.orgId, direction, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { gte: now, lt: new Date(Date.now() + 7 * 86_400_000) } }, _sum: { amountCents: true, settledCents: true } });
  const open = (totals[0]?._sum.amountCents ?? 0) - (totals[0]?._sum.settledCents ?? 0);
  return {
    openCents: open,
    overdueCents: (overdue._sum.amountCents ?? 0) - (overdue._sum.settledCents ?? 0),
    next7Cents: (next7._sum.amountCents ?? 0) - (next7._sum.settledCents ?? 0),
    rows: rows.map((t) => {
      const c = contacts.find((x) => x.id === t.contactId);
      return {
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
        sourceId: t.sourceId,
        contact: c?.name ?? null,
        contactId: c?.id ?? null,
        whatsapp: c?.whatsapp ?? null,
        settlements: t.settlements.map((s) => {
          const tx = txs.find((x) => x.id === s.transactionId);
          return { id: s.id, amountCents: s.amountCents, kind: s.kind, date: s.date, note: s.note, account: tx?.account.name ?? null, method: tx?.method ?? null, reversal: !!s.reversalOfId };
        }),
      };
    }),
  };
}

export async function listExpenses(ctx: Ctx, f: { from: Date; to: Date }) {
  requirePerm(ctx, "finance.view");
  const rows = await prisma.resultEntry.findMany({
    where: { orgId: ctx.orgId, refType: { in: ["EXPENSE", "INCOME"] }, date: { gte: f.from, lte: f.to } },
    orderBy: { date: "desc" },
    take: 200,
  });
  const reversed = new Set((await prisma.resultEntry.findMany({ where: { orgId: ctx.orgId, reversalOfId: { in: rows.map((r) => r.id) } }, select: { reversalOfId: true } })).map((r) => r.reversalOfId));
  const cats = await prisma.financeCategory.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true } });
  return rows
    .filter((r) => !r.reversalOfId)
    .map((r) => ({ id: r.id, refId: r.refId!, type: r.refType!, date: r.date, description: r.description, amountCents: r.amountCents, category: cats.find((c) => c.id === r.categoryId)?.name ?? "—", cancelled: reversed.has(r.id) }));
}
