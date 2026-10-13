import "server-only";
import { prisma, Prisma } from "../db";
import { requirePerm, type Ctx } from "../context";
import type { Period } from "../domain/reports";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Resultado mês a mês (últimos N meses), no fuso da empresa. */
export async function monthlyResult(ctx: Ctx, tz: string, months = 12) {
  requirePerm(ctx, "reports.view");
  const since = new Date(Date.now() - (months + 1) * 31 * 86_400_000);
  const rows = await prisma.$queryRaw<{ ym: string; kind: string; total: bigint }[]>`
    SELECT to_char("date" AT TIME ZONE ${tz}, 'YYYY-MM') AS ym, "kind", SUM("amountCents") AS total
    FROM "ResultEntry" WHERE "orgId" = ${ctx.orgId} AND "date" >= ${since}
    GROUP BY 1, 2 ORDER BY 1`;
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = map.get(r.ym) ?? {};
    m[r.kind] = n(r.total);
    map.set(r.ym, m);
  }
  const out: { ym: string; revenue: number; cogs: number; gross: number; salesExp: number; opex: number; other: number; net: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = map.get(ym) ?? {};
    const revenue = m.REVENUE ?? 0;
    const cogs = m.COGS ?? 0;
    const salesExp = m.SALES_EXPENSE ?? 0;
    const opex = m.OPERATING_EXPENSE ?? 0;
    const other = (m.OTHER_INCOME ?? 0) - (m.OTHER_EXPENSE ?? 0);
    out.push({ ym, revenue, cogs, gross: revenue - cogs, salesExp, opex, other, net: revenue - cogs - salesExp - opex + other });
  }
  return out;
}

export type ProfitDim = "item" | "categoria" | "cliente" | "canal" | "montagem" | "catira" | "compra";

/**
 * Lucro bruto realizado (receita − custo das mercadorias) agrupado por dimensão,
 * a partir do livro de resultado. Despesas de venda são rateadas pela receita da venda.
 */
export async function profitBy(ctx: Ctx, dim: ProfitDim, p: Period) {
  requirePerm(ctx, "reports.view");
  const base = Prisma.sql`
    FROM "ResultEntry" r
    LEFT JOIN "Item" i ON i."id" = r."itemId"
    LEFT JOIN "Product" pr ON pr."id" = i."productId"
    LEFT JOIN "Category" c ON c."id" = pr."categoryId"
    LEFT JOIN "Sale" s ON s."id" = r."saleId"
    WHERE r."orgId" = ${ctx.orgId} AND r."date" >= ${p.from} AND r."date" <= ${p.to} AND r."kind" IN ('REVENUE','COGS','SALES_EXPENSE')`;
  const keyExpr: Record<ProfitDim, Prisma.Sql> = {
    item: Prisma.sql`COALESCE(i."id", 'sem-item')`,
    categoria: Prisma.sql`COALESCE(c."name", 'Frete e outros')`,
    cliente: Prisma.sql`COALESCE(s."contactId", 'sem-cliente')`,
    canal: Prisma.sql`COALESCE(NULLIF(s."channel", ''), 'Não informado')`,
    montagem: Prisma.sql`i."sourceBuildId"`,
    catira: Prisma.sql`i."sourceTradeId"`,
    compra: Prisma.sql`(SELECT pl."purchaseId" FROM "PurchaseLine" pl WHERE pl."id" = i."sourcePurchaseLineId")`,
  };
  const k = keyExpr[dim];
  const rows = await prisma.$queryRaw<{ key: string | null; revenue: bigint; cogs: bigint; sales_exp: bigint; units: bigint; unknown_rev: bigint }[]>`
    SELECT ${k} AS key,
      SUM(CASE WHEN r."kind" = 'REVENUE' THEN r."amountCents" ELSE 0 END) AS revenue,
      SUM(CASE WHEN r."kind" = 'COGS' THEN r."amountCents" ELSE 0 END) AS cogs,
      SUM(CASE WHEN r."kind" = 'SALES_EXPENSE' THEN r."amountCents" ELSE 0 END) AS sales_exp,
      COUNT(DISTINCT CASE WHEN r."kind" = 'REVENUE' AND r."reversalOfId" IS NULL THEN r."id" END) AS units,
      SUM(CASE WHEN r."kind" = 'REVENUE' AND r."costStatus" = 'UNKNOWN' THEN r."amountCents" ELSE 0 END) AS unknown_rev
    ${base}
    GROUP BY 1`;
  // Despesas de venda não têm item: rateamos pela participação na receita de cada venda.
  const saleExp = await prisma.$queryRaw<{ saleId: string; exp: bigint }[]>`
    SELECT r."saleId", SUM(r."amountCents") AS exp FROM "ResultEntry" r
    WHERE r."orgId" = ${ctx.orgId} AND r."date" >= ${p.from} AND r."date" <= ${p.to} AND r."kind" = 'SALES_EXPENSE' AND r."saleId" IS NOT NULL
    GROUP BY 1`;
  const shares = saleExp.length
    ? await prisma.$queryRaw<{ saleId: string; key: string | null; rev: bigint }[]>`
        SELECT r."saleId", ${k} AS key, SUM(r."amountCents") AS rev ${base} AND r."kind" = 'REVENUE' AND r."saleId" IS NOT NULL GROUP BY 1, 2`
    : [];
  const expByKey = new Map<string | null, number>();
  for (const se of saleExp) {
    const parts = shares.filter((s) => s.saleId === se.saleId);
    const tot = parts.reduce((a, x) => a + n(x.rev), 0);
    for (const x of parts) expByKey.set(x.key, (expByKey.get(x.key) ?? 0) + (tot ? Math.round((n(se.exp) * n(x.rev)) / tot) : 0));
  }
  let list = rows
    .filter((r) => r.key !== null)
    .map((r) => {
      const revenue = n(r.revenue);
      const cogs = n(r.cogs);
      const exp = expByKey.get(r.key) ?? 0;
      return { key: r.key!, label: r.key!, revenue, cogs, gross: revenue - cogs, salesExpense: exp, net: revenue - cogs - exp, units: n(r.units), unknownRevenue: n(r.unknown_rev), marginPct: revenue ? ((revenue - cogs - exp) / revenue) * 100 : null, href: null as string | null };
    })
    .filter((r) => r.revenue !== 0 || r.cogs !== 0);
  // Rótulos legíveis
  const ids = list.map((l) => l.key);
  if (dim === "item") {
    const items = await prisma.item.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true, code: true, title: true } });
    list = list.map((l) => {
      const it = items.find((i) => i.id === l.key);
      return { ...l, label: it ? `${it.code} · ${it.title}` : "Frete cobrado / sem item", href: it ? `/estoque/${it.id}` : null };
    });
  } else if (dim === "cliente") {
    const cs = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true, name: true } });
    list = list.map((l) => ({ ...l, label: cs.find((c) => c.id === l.key)?.name ?? "Sem cliente identificado", href: cs.find((c) => c.id === l.key) ? `/contatos/${l.key}` : null }));
  } else if (dim === "montagem") {
    const bs = await prisma.build.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true, code: true, name: true } });
    list = list.map((l) => ({ ...l, label: bs.find((b) => b.id === l.key) ? `${bs.find((b) => b.id === l.key)!.code} · ${bs.find((b) => b.id === l.key)!.name}` : l.key, href: `/montagens/${l.key}` }));
  } else if (dim === "catira") {
    const ts = await prisma.trade.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true, code: true, title: true } });
    list = list.map((l) => ({ ...l, label: ts.find((t) => t.id === l.key) ? `${ts.find((t) => t.id === l.key)!.code} · ${ts.find((t) => t.id === l.key)!.title}` : l.key, href: `/catiras/${l.key}` }));
  } else if (dim === "compra") {
    const ps = await prisma.purchase.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true, code: true, date: true } });
    list = list.map((l) => ({ ...l, label: ps.find((x) => x.id === l.key)?.code ?? l.key, href: `/compras/${l.key}` }));
  }
  return list.sort((a, b) => b.net - a.net);
}

/** Estoque próprio por idade: capital parado em cada faixa. */
export async function inventoryAging(ctx: Ctx) {
  requirePerm(ctx, "reports.view");
  const rows = await prisma.$queryRaw<{ bucket: string; items: bigint; cost: bigint; asking: bigint }[]>`
    SELECT CASE
        WHEN now() - "acquiredAt" <= interval '30 days' THEN '0-30'
        WHEN now() - "acquiredAt" <= interval '60 days' THEN '31-60'
        WHEN now() - "acquiredAt" <= interval '90 days' THEN '61-90'
        WHEN now() - "acquiredAt" <= interval '180 days' THEN '91-180'
        ELSE '180+' END AS bucket,
      COUNT(*) AS items,
      SUM(COALESCE("unitCostCents",0)::bigint * "qtyOnHand") AS cost,
      SUM(COALESCE("expectedPriceCents",0)::bigint * (CASE WHEN "tracking" = 'LOT' THEN "qtyOnHand" ELSE 1 END)) AS asking
    FROM "Item"
    WHERE "orgId" = ${ctx.orgId} AND "ownership" = 'OWNED' AND "status" IN ('AVAILABLE','RESERVED','INSPECTION','DEFECTIVE','IN_BUILD','IN_NEGOTIATION','CONSIGNED_OUT','RETURNED')
    GROUP BY 1`;
  const order = ["0-30", "31-60", "61-90", "91-180", "180+"];
  return order.map((b) => {
    const r = rows.find((x) => x.bucket === b);
    return { bucket: b, items: n(r?.items), costCents: n(r?.cost), askingCents: n(r?.asking) };
  });
}

export async function inventoryByCategory(ctx: Ctx) {
  requirePerm(ctx, "reports.view");
  const rows = await prisma.$queryRaw<{ name: string; items: bigint; units: bigint; cost: bigint; market: bigint; asking: bigint; unknown: bigint }[]>`
    SELECT c."name", COUNT(*) AS items, SUM(i."qtyOnHand") AS units,
      SUM(COALESCE(i."unitCostCents",0)::bigint * i."qtyOnHand") AS cost,
      SUM(COALESCE(i."estimatedValueCents",0)::bigint) AS market,
      SUM(COALESCE(i."expectedPriceCents",0)::bigint * (CASE WHEN i."tracking" = 'LOT' THEN i."qtyOnHand" ELSE 1 END)) AS asking,
      SUM(CASE WHEN i."costStatus" = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown
    FROM "Item" i JOIN "Product" p ON p."id" = i."productId" JOIN "Category" c ON c."id" = p."categoryId"
    WHERE i."orgId" = ${ctx.orgId} AND i."ownership" = 'OWNED' AND i."status" IN ('AVAILABLE','RESERVED','INSPECTION','DEFECTIVE','IN_BUILD','IN_NEGOTIATION','CONSIGNED_OUT','RETURNED')
    GROUP BY c."name" ORDER BY cost DESC`;
  return rows.map((r) => ({ name: r.name, items: n(r.items), units: n(r.units), costCents: n(r.cost), marketCents: n(r.market), askingCents: n(r.asking), unknownCost: n(r.unknown) }));
}

/** Giro: custo das mercadorias vendidas no período ÷ estoque médio (aproximado pelo estoque atual). */
export async function turnover(ctx: Ctx, p: Period, currentInventoryCents: number) {
  requirePerm(ctx, "reports.view");
  const cogs = await prisma.resultEntry.aggregate({ where: { orgId: ctx.orgId, kind: "COGS", date: { gte: p.from, lte: p.to } }, _sum: { amountCents: true } });
  const days = Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000));
  const c = n(cogs._sum.amountCents);
  const daily = c / days;
  return { cogsCents: c, days, coverageDays: daily > 0 ? Math.round(currentInventoryCents / daily) : null };
}
