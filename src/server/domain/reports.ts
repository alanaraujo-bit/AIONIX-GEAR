import { prisma, Prisma } from "../db";
import { ON_BOOKS_STATUSES } from "./shared";

/**
 * Regras de cálculo (ver docs/REGRAS-DE-NEGOCIO.md):
 * - DRE gerencial por competência, 100% derivado do livro ResultEntry.
 * - Caixa = soma dos movimentos efetivos (MoneyTransaction). Lucro ≠ caixa.
 * - Estoque próprio a custo = Σ custo unitário × quantidade dos itens próprios ainda no ativo.
 * - Valor de mercado estimado é mostrado separado e nunca entra em lucro.
 */

export type Period = { from: Date; to: Date };

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function profitAndLoss(orgId: string, p: Period) {
  const rows = await prisma.resultEntry.groupBy({
    by: ["kind"],
    where: { orgId, date: { gte: p.from, lte: p.to } },
    _sum: { amountCents: true },
  });
  const sum = (k: string) => n(rows.find((r) => r.kind === k)?._sum.amountCents);
  const revenue = sum("REVENUE");
  const cogs = sum("COGS");
  const salesExpense = sum("SALES_EXPENSE");
  const opex = sum("OPERATING_EXPENSE");
  const otherIncome = sum("OTHER_INCOME");
  const otherExpense = sum("OTHER_EXPENSE");
  const gross = revenue - cogs;
  const contribution = gross - salesExpense;
  const net = contribution - opex + otherIncome - otherExpense;
  const unknown = await prisma.resultEntry.aggregate({
    where: { orgId, date: { gte: p.from, lte: p.to }, kind: "REVENUE", costStatus: "UNKNOWN" },
    _sum: { amountCents: true },
  });
  const estimated = await prisma.resultEntry.aggregate({
    where: { orgId, date: { gte: p.from, lte: p.to }, kind: "REVENUE", costStatus: "ESTIMATED" },
    _sum: { amountCents: true },
  });
  return {
    revenueCents: revenue,
    cogsCents: cogs,
    grossProfitCents: gross,
    grossMarginPct: revenue ? (gross / revenue) * 100 : null,
    salesExpenseCents: salesExpense,
    contributionCents: contribution,
    contributionMarginPct: revenue ? (contribution / revenue) * 100 : null,
    operatingExpenseCents: opex,
    otherIncomeCents: otherIncome,
    otherExpenseCents: otherExpense,
    netResultCents: net,
    netMarginPct: revenue ? (net / revenue) * 100 : null,
    revenueWithUnknownCostCents: n(unknown._sum.amountCents),
    revenueWithEstimatedCostCents: n(estimated._sum.amountCents),
  };
}

export async function inventorySummary(orgId: string) {
  const rows = await prisma.$queryRaw<
    { ownership: string; costStatus: string; units: bigint; cost: bigint | null; market: bigint | null; asking: bigint | null; items: bigint }[]
  >`
    SELECT "ownership", "costStatus",
      SUM("qtyOnHand") AS units,
      SUM(COALESCE("unitCostCents",0)::bigint * "qtyOnHand") AS cost,
      SUM(CASE WHEN "estimatedValueCents" IS NULL THEN NULL ELSE "estimatedValueCents"::bigint * (CASE WHEN "tracking"='LOT' THEN "qtyOnHand" ELSE 1 END) END) AS market,
      SUM(CASE WHEN "expectedPriceCents" IS NULL THEN NULL ELSE "expectedPriceCents"::bigint * (CASE WHEN "tracking"='LOT' THEN "qtyOnHand" ELSE 1 END) END) AS asking,
      COUNT(*) AS items
    FROM "Item"
    WHERE "orgId" = ${orgId} AND "status"::text IN (${Prisma.join(ON_BOOKS_STATUSES)})
    GROUP BY "ownership", "costStatus"`;
  const owned = rows.filter((r) => r.ownership === "OWNED");
  const byStatus = await prisma.item.groupBy({
    by: ["status"],
    where: { orgId, status: { notIn: ["VOID"] } },
    _count: { _all: true },
    _sum: { qtyOnHand: true },
  });
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, { items: s._count._all, units: n(s._sum.qtyOnHand) }]));
  const marketCoverage = await prisma.item.count({
    where: { orgId, ownership: "OWNED", status: { in: ON_BOOKS_STATUSES }, estimatedValueCents: { not: null } },
  });
  const ownedItems = owned.reduce((a, r) => a + Number(r.items), 0);
  return {
    ownedCostCents: owned.reduce((a, r) => a + n(r.cost), 0),
    ownedUnits: owned.reduce((a, r) => a + n(r.units), 0),
    ownedItems,
    unknownCostItems: owned.filter((r) => r.costStatus === "UNKNOWN").reduce((a, r) => a + Number(r.items), 0),
    estimatedCostItems: owned.filter((r) => r.costStatus === "ESTIMATED").reduce((a, r) => a + Number(r.items), 0),
    ownedMarketValueCents: owned.reduce((a, r) => a + n(r.market), 0),
    marketCoverageItems: marketCoverage,
    ownedAskingCents: owned.reduce((a, r) => a + n(r.asking), 0),
    consignedInUnits: rows.filter((r) => r.ownership === "CONSIGNED_IN").reduce((a, r) => a + n(r.units), 0),
    clientUnits: rows.filter((r) => r.ownership === "CLIENT" || r.ownership === "THIRD_PARTY").reduce((a, r) => a + n(r.units), 0),
    byStatus: counts as Record<string, { items: number; units: number }>,
  };
}

export async function cashSummary(orgId: string) {
  const sums = await prisma.moneyTransaction.groupBy({ by: ["direction"], where: { orgId }, _sum: { amountCents: true } });
  const cash = n(sums.find((s) => s.direction === "IN")?._sum.amountCents) - n(sums.find((s) => s.direction === "OUT")?._sum.amountCents);
  const titles = await prisma.$queryRaw<{ direction: string; open: bigint; overdue: bigint }[]>`
    SELECT "direction",
      SUM("amountCents" - "settledCents") AS open,
      SUM(CASE WHEN "dueDate" < now() THEN "amountCents" - "settledCents" ELSE 0 END) AS overdue
    FROM "Title" WHERE "orgId" = ${orgId} AND "status" IN ('OPEN','PARTIAL')
    GROUP BY "direction"`;
  const get = (d: string, k: "open" | "overdue") => n(titles.find((t) => t.direction === d)?.[k]);
  return {
    cashCents: cash,
    receivableCents: get("RECEIVABLE", "open"),
    receivableOverdueCents: get("RECEIVABLE", "overdue"),
    payableCents: get("PAYABLE", "open"),
    payableOverdueCents: get("PAYABLE", "overdue"),
  };
}

export async function cashFlow(orgId: string, p: Period) {
  const rows = await prisma.moneyTransaction.groupBy({
    by: ["kind", "direction"],
    where: { orgId, date: { gte: p.from, lte: p.to } },
    _sum: { amountCents: true },
  });
  const inflow = rows.filter((r) => r.direction === "IN").reduce((a, r) => a + n(r._sum.amountCents), 0);
  const outflow = rows.filter((r) => r.direction === "OUT").reduce((a, r) => a + n(r._sum.amountCents), 0);
  return {
    inflowCents: inflow,
    outflowCents: outflow,
    netCents: inflow - outflow,
    byKind: rows.map((r) => ({ kind: r.kind, direction: r.direction, amountCents: n(r._sum.amountCents) })),
  };
}

/** Lucro realizado de um item, incluindo despesas da venda rateadas pela receita. */
export async function itemProfit(orgId: string, itemId: string) {
  const entries = await prisma.resultEntry.findMany({ where: { orgId, itemId } });
  const revenue = entries.filter((e) => e.kind === "REVENUE").reduce((a, e) => a + e.amountCents, 0);
  const cogs = entries.filter((e) => e.kind === "COGS").reduce((a, e) => a + e.amountCents, 0);
  const otherExpense = entries.filter((e) => e.kind === "OTHER_EXPENSE").reduce((a, e) => a + e.amountCents, 0);
  const saleIds = [...new Set(entries.map((e) => e.saleId).filter(Boolean))] as string[];
  let allocatedSalesExpense = 0;
  for (const saleId of saleIds) {
    const saleEntries = await prisma.resultEntry.findMany({ where: { orgId, saleId } });
    const saleRevenue = saleEntries.filter((e) => e.kind === "REVENUE" && e.itemId).reduce((a, e) => a + e.amountCents, 0);
    const itemRevenue = saleEntries.filter((e) => e.kind === "REVENUE" && e.itemId === itemId).reduce((a, e) => a + e.amountCents, 0);
    const exp = saleEntries.filter((e) => e.kind === "SALES_EXPENSE").reduce((a, e) => a + e.amountCents, 0);
    if (saleRevenue > 0) allocatedSalesExpense += Math.round((exp * itemRevenue) / saleRevenue);
  }
  const unknown = entries.some((e) => e.costStatus === "UNKNOWN");
  return {
    revenueCents: revenue,
    cogsCents: cogs,
    grossProfitCents: revenue - cogs,
    allocatedSalesExpenseCents: allocatedSalesExpense,
    otherExpenseCents: otherExpense,
    netProfitCents: revenue - cogs - allocatedSalesExpense - otherExpense,
    costUnknown: unknown,
  };
}

/**
 * Verificações independentes de integridade. Cada uma recalcula um número a partir da
 * fonte primária e compara com o valor mantido pelo sistema.
 */
export async function integrityChecks(orgId: string) {
  const checks: { key: string; label: string; ok: boolean; detail: string }[] = [];

  // 1) Custo de cada unidade = soma dos seus lançamentos de custo.
  const unitMismatch = await prisma.$queryRaw<{ code: string; unit: number | null; entries: bigint | null }[]>`
    SELECT i."code", i."unitCostCents" AS unit, SUM(c."amountCents") AS entries
    FROM "Item" i LEFT JOIN "CostEntry" c ON c."itemId" = i."id"
    WHERE i."orgId" = ${orgId} AND i."tracking" = 'UNIT' AND i."ownership" = 'OWNED' AND i."costStatus" <> 'UNKNOWN'
    GROUP BY i."id", i."code", i."unitCostCents"
    HAVING COALESCE(SUM(c."amountCents"),0) <> COALESCE(i."unitCostCents",0)`;
  checks.push({
    key: "unit-cost-ledger",
    label: "Custo das unidades confere com o histórico de custos",
    ok: unitMismatch.length === 0,
    detail: unitMismatch.length ? `Divergência em ${unitMismatch.map((u) => u.code).slice(0, 10).join(", ")}` : "Todas as unidades conferem.",
  });

  // 2) Valor baixado nos títulos = soma das baixas.
  const titleMismatch = await prisma.$queryRaw<{ id: string; description: string }[]>`
    SELECT t."id", t."description" FROM "Title" t LEFT JOIN "Settlement" s ON s."titleId" = t."id" AND s."reversalOfId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Settlement" r WHERE r."reversalOfId" = s."id")
    WHERE t."orgId" = ${orgId} AND t."status" <> 'CANCELLED'
    GROUP BY t."id", t."description", t."settledCents"
    HAVING COALESCE(SUM(s."amountCents"),0) <> t."settledCents"`;
  checks.push({
    key: "titles",
    label: "Contas a receber/pagar conferem com os pagamentos registrados",
    ok: titleMismatch.length === 0,
    detail: titleMismatch.length ? `${titleMismatch.length} título(s) divergente(s)` : "Todos os títulos conferem.",
  });

  // 3) Toda baixa em dinheiro tem movimento de caixa de mesmo valor.
  const settleCash = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "Settlement" s LEFT JOIN "MoneyTransaction" m ON m."id" = s."transactionId"
    WHERE s."orgId" = ${orgId} AND s."kind" = 'PAYMENT' AND (m."id" IS NULL OR m."amountCents" <> ABS(s."amountCents"))`;
  checks.push({
    key: "settlement-cash",
    label: "Todo pagamento registrado tem o movimento de caixa correspondente",
    ok: Number(settleCash[0].c) === 0,
    detail: Number(settleCash[0].c) ? `${settleCash[0].c} pagamento(s) sem movimento correspondente` : "OK.",
  });

  // 4) Estados coerentes: reservado/em montagem/em negociação têm vínculo; instalado tem PC.
  const holds = await prisma.item.count({
    where: { orgId, OR: [{ status: { in: ["RESERVED", "IN_BUILD", "IN_NEGOTIATION"] }, holdId: null, tracking: "UNIT" }, { status: "INSTALLED", parentItemId: null }] },
  });
  checks.push({
    key: "states",
    label: "Situação dos itens coerente (reservas, montagens, instalados)",
    ok: holds === 0,
    detail: holds ? `${holds} item(ns) com situação sem vínculo` : "OK.",
  });

  // 5) Uma unidade vendida aparece em no máximo uma venda ativa.
  const doubleSold = await prisma.$queryRaw<{ itemId: string }[]>`
    SELECT l."itemId" FROM "SaleLine" l JOIN "Sale" s ON s."id" = l."saleId" JOIN "Item" i ON i."id" = l."itemId"
    WHERE s."orgId" = ${orgId} AND s."status" = 'CONFIRMED' AND i."tracking" = 'UNIT' AND l."returnedQty" < l."quantity"
    GROUP BY l."itemId" HAVING COUNT(*) > 1`;
  checks.push({
    key: "double-sale",
    label: "Nenhuma unidade vendida duas vezes",
    ok: doubleSold.length === 0,
    detail: doubleSold.length ? `${doubleSold.length} unidade(s) em mais de uma venda ativa` : "OK.",
  });

  // 6) Lançamentos de estorno nunca duplicados.
  const reversals = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "ResultEntry" r JOIN "ResultEntry" o ON o."id" = r."reversalOfId"
    WHERE r."orgId" = ${orgId} AND r."amountCents" <> -o."amountCents"`;
  checks.push({
    key: "reversals",
    label: "Estornos espelham exatamente o lançamento original",
    ok: Number(reversals[0].c) === 0,
    detail: Number(reversals[0].c) ? `${reversals[0].c} estorno(s) divergente(s)` : "OK.",
  });

  return { ok: checks.every((c) => c.ok), checks };
}
