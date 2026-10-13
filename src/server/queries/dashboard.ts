import "server-only";
import { prisma, Prisma } from "../db";
import { hasPerm, type Ctx } from "../context";
import { profitAndLoss, inventorySummary, cashSummary } from "../domain/reports";
import { accountBalances } from "../domain/finance";
import { resolvePeriod, toDateInput, type PeriodKey } from "@/lib/dates";
import type { OrgSettings } from "../domain/org";

export type NextAction = { key: string; tone: "negative" | "warning" | "info" | "neutral"; title: string; detail: string; href: string; count?: number; amountCents?: number };

/**
 * Centro de comando. Cada número vem de uma consulta sobre registros reais e
 * aponta para a tela onde ele pode ser conferido.
 */
export async function dashboard(ctx: Ctx, period: PeriodKey, tz: string, settings: OrgSettings) {
  const seeFinance = hasPerm(ctx, "finance.view");
  const seeCost = hasPerm(ctx, "inventory.cost");
  const seeReports = hasPerm(ctx, "reports.view");
  const p = resolvePeriod(period, tz);

  const [pl, plPrev, inv, cash, balances] = await Promise.all([
    seeReports ? profitAndLoss(ctx.orgId, p) : null,
    seeReports && p.previous ? profitAndLoss(ctx.orgId, p.previous) : null,
    hasPerm(ctx, "inventory.view") ? inventorySummary(ctx.orgId) : null,
    seeFinance ? cashSummary(ctx.orgId) : null,
    seeFinance ? accountBalances(ctx.orgId) : null,
  ]);

  const salesCount = hasPerm(ctx, "sales.manage") || seeReports
    ? await prisma.sale.count({ where: { orgId: ctx.orgId, status: "CONFIRMED", date: { gte: p.from, lte: p.to } } })
    : null;
  const salesCountPrev = p.previous && salesCount !== null ? await prisma.sale.count({ where: { orgId: ctx.orgId, status: "CONFIRMED", date: { gte: p.previous.from, lte: p.previous.to } } }) : null;

  // Série diária de receita e lucro bruto (para o gráfico)
  let series: { day: string; revenue: number; gross: number }[] = [];
  if (seeReports) {
    const rows = await prisma.$queryRaw<{ day: string; kind: string; total: bigint }[]>`
      SELECT to_char("date" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, "kind", SUM("amountCents") AS total
      FROM "ResultEntry"
      WHERE "orgId" = ${ctx.orgId} AND "date" >= ${p.from} AND "date" <= ${p.to} AND "kind" IN ('REVENUE','COGS')
      GROUP BY 1, 2 ORDER BY 1`;
    const map = new Map<string, { revenue: number; cogs: number }>();
    for (const r of rows) {
      const key = r.day;
      const cur = map.get(key) ?? { revenue: 0, cogs: 0 };
      if (r.kind === "REVENUE") cur.revenue += Number(r.total);
      else cur.cogs += Number(r.total);
      map.set(key, cur);
    }
    const days = Math.min(400, Math.ceil((p.to.getTime() - p.from.getTime()) / 86_400_000));
    const start = period === "all" ? (rows[0] ? new Date(`${rows[0].day}T15:00:00Z`) : new Date()) : p.from;
    const total = period === "all" ? Math.ceil((Date.now() - start.getTime()) / 86_400_000) + 1 : days;
    for (let i = 0; i < Math.min(total, 400); i++) {
      const key = toDateInput(new Date(start.getTime() + i * 86_400_000), tz);
      const v = map.get(key) ?? { revenue: 0, cogs: 0 };
      series.push({ day: key, revenue: v.revenue, gross: v.revenue - v.cogs });
    }
    if (series.length > 62) {
      // Agrupa por semana para períodos longos
      const weeks: typeof series = [];
      for (let i = 0; i < series.length; i += 7) {
        const chunk = series.slice(i, i + 7);
        weeks.push({ day: chunk[0].day, revenue: chunk.reduce((a, c) => a + c.revenue, 0), gross: chunk.reduce((a, c) => a + c.gross, 0) });
      }
      series = weeks;
    }
  }

  const actions = await nextActions(ctx, settings);

  // Itens parados com capital (top 5)
  const stale = hasPerm(ctx, "inventory.view")
    ? await prisma.item.findMany({
        where: {
          orgId: ctx.orgId,
          ownership: "OWNED",
          status: { in: ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED"] },
          acquiredAt: { lt: new Date(Date.now() - settings.staleDays * 86_400_000) },
        },
        orderBy: [{ acquiredAt: "asc" }],
        take: 6,
        select: { id: true, code: true, title: true, acquiredAt: true, unitCostCents: true, qtyOnHand: true, expectedPriceCents: true, status: true },
      })
    : [];

  const recent = await prisma.auditLog.findMany({
    where: {
      orgId: ctx.orgId,
      action: { in: ["sale.confirm", "purchase.confirm", "trade.confirm", "build.complete", "item.create", "sale.quote", "sale.cancel", "sale.return", "item.dispose", "count.close", "import.apply", "item.disassemble", "finance.settle"] },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const userIds = [...new Set(recent.map((r) => r.userId).filter(Boolean))] as string[];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const categoryMix = seeCost
    ? await prisma.$queryRaw<{ name: string; cost: bigint; units: bigint }[]>`
        SELECT c."name", SUM(COALESCE(i."unitCostCents",0)::bigint * i."qtyOnHand") AS cost, SUM(i."qtyOnHand") AS units
        FROM "Item" i JOIN "Product" p ON p."id" = i."productId" JOIN "Category" c ON c."id" = p."categoryId"
        WHERE i."orgId" = ${ctx.orgId} AND i."ownership" = 'OWNED'
          AND i."status"::text IN (${Prisma.join(["AVAILABLE", "RESERVED", "INSPECTION", "DEFECTIVE", "IN_BUILD", "IN_NEGOTIATION", "CONSIGNED_OUT", "RETURNED"])})
        GROUP BY c."name" ORDER BY cost DESC LIMIT 6`
    : [];

  return {
    period: p,
    pl,
    plPrev,
    inv: inv && {
      ...inv,
      ownedCostCents: seeCost ? inv.ownedCostCents : null,
    },
    cash,
    balances: balances?.filter((b) => !b.archived) ?? null,
    salesCount,
    salesCountPrev,
    series,
    actions,
    stale: stale.map((s) => ({ ...s, unitCostCents: seeCost ? s.unitCostCents : null })),
    recent: recent.map((r) => ({ id: r.id, summary: r.summary, createdAt: r.createdAt, user: r.userId ? users.get(r.userId) ?? null : null, entityType: r.entityType, entityId: r.entityId })),
    categoryMix: categoryMix.map((c) => ({ name: c.name, costCents: Number(c.cost), units: Number(c.units) })),
  };
}

/** Lista de próximas ações, priorizada pelo que custa dinheiro ou cliente. */
export async function nextActions(ctx: Ctx, settings: OrgSettings): Promise<NextAction[]> {
  const out: NextAction[] = [];
  const now = new Date();
  const in7 = new Date(Date.now() + 7 * 86_400_000);

  if (hasPerm(ctx, "finance.view") || hasPerm(ctx, "sales.manage")) {
    const overdue = await prisma.title.aggregate({
      where: { orgId: ctx.orgId, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: now } },
      _count: true,
      _sum: { amountCents: true, settledCents: true },
    });
    if (overdue._count) {
      out.push({
        key: "overdue-receivables",
        tone: "negative",
        title: `${overdue._count} recebimento${overdue._count > 1 ? "s" : ""} atrasado${overdue._count > 1 ? "s" : ""}`,
        detail: "Cobre o cliente ou registre o pagamento recebido.",
        href: "/financeiro/receber?situacao=atrasados",
        count: overdue._count,
        amountCents: (overdue._sum.amountCents ?? 0) - (overdue._sum.settledCents ?? 0),
      });
    }
  }
  if (hasPerm(ctx, "finance.view")) {
    const payables = await prisma.title.aggregate({
      where: { orgId: ctx.orgId, direction: "PAYABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: in7 } },
      _count: true,
      _sum: { amountCents: true, settledCents: true },
    });
    if (payables._count) {
      out.push({
        key: "payables",
        tone: "warning",
        title: `${payables._count} conta${payables._count > 1 ? "s" : ""} a pagar até 7 dias (ou vencidas)`,
        detail: "Evite juros e mantenha a reputação com fornecedores.",
        href: "/financeiro/pagar",
        count: payables._count,
        amountCents: (payables._sum.amountCents ?? 0) - (payables._sum.settledCents ?? 0),
      });
    }
  }
  if (hasPerm(ctx, "sales.manage")) {
    const undelivered = await prisma.sale.count({ where: { orgId: ctx.orgId, status: "CONFIRMED", deliveryStatus: "PENDING" } });
    if (undelivered) out.push({ key: "undelivered", tone: "info", title: `${undelivered} venda${undelivered > 1 ? "s" : ""} aguardando entrega`, detail: "Marque como entregue quando o cliente receber.", href: "/vendas?entrega=pendente", count: undelivered });
    const quotes = await prisma.sale.count({ where: { orgId: ctx.orgId, status: "QUOTE", OR: [{ quoteValidUntil: null }, { quoteValidUntil: { gte: now } }] } });
    const expiring = await prisma.sale.count({ where: { orgId: ctx.orgId, status: "QUOTE", quoteValidUntil: { gte: now, lt: new Date(Date.now() + 2 * 86_400_000) } } });
    if (expiring) out.push({ key: "quotes-expiring", tone: "warning", title: `${expiring} orçamento${expiring > 1 ? "s" : ""} vencendo em até 2 dias`, detail: "Faça o follow-up antes que a reserva expire.", href: "/vendas?situacao=orcamentos", count: expiring });
    else if (quotes) out.push({ key: "quotes", tone: "neutral", title: `${quotes} orçamento${quotes > 1 ? "s" : ""} em aberto`, detail: "Acompanhe e converta em venda.", href: "/vendas?situacao=orcamentos", count: quotes });
  }
  if (hasPerm(ctx, "sales.manage") || hasPerm(ctx, "trades.manage")) {
    const due = await prisma.opportunity.count({ where: { orgId: ctx.orgId, stage: { notIn: ["WON", "LOST"] }, nextActionAt: { lte: new Date(Date.now() + 86_400_000) } } });
    if (due) out.push({ key: "deals", tone: "warning", title: `${due} ${due > 1 ? "negociações" : "negociação"} com retorno para hoje`, detail: "Responda antes que o interessado esfrie.", href: "/negociacoes", count: due });
  }
  if (hasPerm(ctx, "trades.manage")) {
    const openTrades = await prisma.trade.count({ where: { orgId: ctx.orgId, status: "NEGOTIATING" } });
    if (openTrades) out.push({ key: "trades", tone: "info", title: `${openTrades} catira${openTrades > 1 ? "s" : ""} em negociação`, detail: "Itens oferecidos ficam bloqueados até você decidir.", href: "/catiras", count: openTrades });
  }
  if (hasPerm(ctx, "builds.manage")) {
    const builds = await prisma.build.count({ where: { orgId: ctx.orgId, status: { in: ["PLANNING", "ASSEMBLING", "TESTING"] } } });
    if (builds) out.push({ key: "builds", tone: "info", title: `${builds} ${builds > 1 ? "montagens" : "montagem"} em andamento`, detail: "Peças reservadas não podem ser vendidas avulsas.", href: "/montagens", count: builds });
  }
  if (hasPerm(ctx, "inventory.view")) {
    const inspection = await prisma.item.count({ where: { orgId: ctx.orgId, status: { in: ["INSPECTION", "RETURNED"] } } });
    if (inspection) out.push({ key: "inspection", tone: "warning", title: `${inspection} item${inspection > 1 ? "s" : ""} aguardando teste/avaliação`, detail: "Teste e libere para venda — item parado é dinheiro parado.", href: "/estoque?group=attention", count: inspection });
    const noLocation = await prisma.item.count({ where: { orgId: ctx.orgId, locationId: null, status: { in: ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RESERVED", "RETURNED"] } } });
    if (noLocation) out.push({ key: "no-location", tone: "neutral", title: `${noLocation} item${noLocation > 1 ? "s" : ""} sem local definido`, detail: "Defina onde estão para encontrar rápido.", href: "/estoque?locationId=none", count: noLocation });
    const warranty = await prisma.item.count({
      where: { orgId: ctx.orgId, status: { in: ["AVAILABLE", "RESERVED", "INSPECTION"] }, warrantyUntil: { gte: now, lt: new Date(Date.now() + 30 * 86_400_000) } },
    });
    if (warranty) out.push({ key: "warranty", tone: "warning", title: `${warranty} garantia${warranty > 1 ? "s" : ""} vencendo em 30 dias`, detail: "Itens com garantia vendem melhor — priorize a venda.", href: "/estoque?group=available&sort=oldest", count: warranty });
  }
  if (hasPerm(ctx, "inventory.cost")) {
    const unknown = await prisma.item.count({ where: { orgId: ctx.orgId, ownership: "OWNED", costStatus: "UNKNOWN", status: { in: ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RESERVED", "IN_BUILD", "RETURNED"] } } });
    if (unknown) out.push({ key: "unknown-cost", tone: "neutral", title: `${unknown} item${unknown > 1 ? "s" : ""} com custo desconhecido`, detail: "Sem custo, o lucro da venda não pode ser apurado.", href: "/estoque?cost=unknown", count: unknown });
  }
  void settings;
  return out;
}
