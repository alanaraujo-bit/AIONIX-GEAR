import "server-only";
import { prisma } from "../db";
import { requirePerm, type Ctx } from "../context";
import type { OrgSettings } from "./org";
import { accountBalances } from "./finance";
import { formatBRL } from "@/lib/money";

export type Insight = {
  key: string;
  area: "estoque" | "preco" | "vendas" | "financeiro" | "catiras" | "compras";
  severity: "risk" | "warn" | "opportunity" | "info";
  title: string;
  why: string;
  numbers: { label: string; value: string }[];
  action?: { label: string; href: string };
  items?: { id: string; label: string; detail: string; href: string }[];
};

const fmt = (c: number | null | undefined) => formatBRL(c ?? 0);
const DAY = 86_400_000;
const LIVE = ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED"] as const;

/**
 * Inteligência explicável: cada sugestão vem de uma regra simples sobre os
 * registros reais, mostra os números usados e leva para a tela onde conferir.
 * Nenhum preço de mercado é inventado — só usamos as estimativas que você informou.
 */
export async function computeInsights(ctx: Ctx, settings: OrgSettings): Promise<Insight[]> {
  requirePerm(ctx, "reports.view");
  const out: Insight[] = [];
  const now = Date.now();
  const target = settings.targetMarginPct / 100;
  const owned = await prisma.item.findMany({
    where: { orgId: ctx.orgId, ownership: "OWNED", status: { in: [...LIVE] } },
    select: { id: true, code: true, title: true, acquiredAt: true, unitCostCents: true, costStatus: true, qtyOnHand: true, expectedPriceCents: true, estimatedValueCents: true, warrantyUntil: true, tracking: true, product: { select: { category: { select: { name: true } } } } },
  });

  // 1) Capital parado
  const stale = owned.filter((i) => now - i.acquiredAt.getTime() > settings.staleDays * DAY).sort((a, b) => (b.unitCostCents ?? 0) * b.qtyOnHand - (a.unitCostCents ?? 0) * a.qtyOnHand);
  if (stale.length) {
    const capital = stale.reduce((a, i) => a + (i.unitCostCents ?? 0) * i.qtyOnHand, 0);
    out.push({
      key: "stale",
      area: "estoque",
      severity: capital > 0 ? "warn" : "info",
      title: `${fmt(capital)} parados em ${stale.length} item(ns) há mais de ${settings.staleDays} dias`,
      why: "Item parado não gera lucro e perde valor com lançamentos novos. Considere baixar o preço, anunciar de novo, usar em montagem ou em catira.",
      numbers: [
        { label: "Itens", value: String(stale.length) },
        { label: "Capital (custo)", value: fmt(capital) },
      ],
      action: { label: "Ver itens parados", href: `/estoque?stale=${settings.staleDays}&sort=oldest` },
      items: stale.slice(0, 6).map((i) => {
        const floor = i.unitCostCents ? Math.ceil(i.unitCostCents / (1 - Math.min(0.1, target)) / 100) * 100 : null;
        return {
          id: i.id,
          label: `${i.code} · ${i.title}`,
          detail: `${Math.floor((now - i.acquiredAt.getTime()) / DAY)} dias · custo ${fmt(i.unitCostCents)}${i.expectedPriceCents ? ` · pedindo ${fmt(i.expectedPriceCents)}` : ""}${floor ? ` · piso com 10% de margem: ${fmt(floor)}` : ""}`,
          href: `/estoque/${i.id}`,
        };
      }),
    });
  }

  // 2) Preço abaixo do custo ou margem fraca
  const weak = owned.filter((i) => i.expectedPriceCents && i.unitCostCents && i.costStatus !== "UNKNOWN" && (i.expectedPriceCents - i.unitCostCents) / i.expectedPriceCents < target / 2);
  if (weak.length) {
    const below = weak.filter((i) => i.expectedPriceCents! < i.unitCostCents!);
    out.push({
      key: "weak-margin",
      area: "preco",
      severity: below.length ? "risk" : "warn",
      title: below.length ? `${below.length} item(ns) com preço abaixo do custo` : `${weak.length} item(ns) com margem abaixo da metade da sua meta (${settings.targetMarginPct}%)`,
      why: `Preço pretendido versus custo real (com frete, taxas e reparos). Sugestão para atingir ${settings.targetMarginPct}% de margem: custo ÷ (1 − ${settings.targetMarginPct}%).`,
      numbers: [
        { label: "Itens", value: String(weak.length) },
        { label: "Abaixo do custo", value: String(below.length) },
      ],
      items: weak.slice(0, 8).map((i) => ({
        id: i.id,
        label: `${i.code} · ${i.title}`,
        detail: `custo ${fmt(i.unitCostCents)} · pedindo ${fmt(i.expectedPriceCents)} · sugerido ${fmt(Math.ceil(i.unitCostCents! / (1 - target) / 100) * 100)}`,
        href: `/estoque/${i.id}`,
      })),
    });
  }

  // 3) Sem preço definido
  const noPrice = owned.filter((i) => !i.expectedPriceCents);
  if (noPrice.length) {
    out.push({
      key: "no-price",
      area: "preco",
      severity: "info",
      title: `${noPrice.length} item(ns) sem preço de venda definido`,
      why: "Sem preço pretendido não dá para medir margem esperada nem montar anúncio rápido. Use “Preço” em massa no Estoque (margem sobre o custo).",
      numbers: [{ label: "Itens", value: String(noPrice.length) }],
      action: { label: "Abrir estoque", href: "/estoque?group=available" },
    });
  }

  // 4) Pedido muito acima/abaixo da SUA estimativa de mercado
  const vsMarket = owned.filter((i) => i.expectedPriceCents && i.estimatedValueCents && Math.abs(i.expectedPriceCents - i.estimatedValueCents) / i.estimatedValueCents > 0.15);
  if (vsMarket.length) {
    const under = vsMarket.filter((i) => i.expectedPriceCents! < i.estimatedValueCents!);
    out.push({
      key: "vs-market",
      area: "preco",
      severity: under.length ? "opportunity" : "info",
      title: `${vsMarket.length} item(ns) com preço 15%+ distante da sua estimativa de mercado`,
      why: "Comparação entre o preço que você pede e o valor de mercado que você mesmo informou (não buscamos preços externos). Abaixo: pode estar deixando dinheiro na mesa. Acima: pode explicar demora na venda.",
      numbers: [
        { label: "Abaixo do mercado", value: String(under.length) },
        { label: "Acima do mercado", value: String(vsMarket.length - under.length) },
      ],
      items: vsMarket.slice(0, 8).map((i) => ({ id: i.id, label: `${i.code} · ${i.title}`, detail: `pede ${fmt(i.expectedPriceCents)} · mercado ${fmt(i.estimatedValueCents)}`, href: `/estoque/${i.id}` })),
    });
  }

  // 5) Vendas com prejuízo nos últimos 90 dias
  const since90 = new Date(now - 90 * DAY);
  const lossLines = await prisma.saleLine.findMany({
    where: { orgId: ctx.orgId, sale: { status: "CONFIRMED", date: { gte: since90 } }, costCents: { not: null } },
    include: { sale: { select: { code: true, id: true, date: true } } },
  });
  const losses = lossLines.filter((l) => l.unitPriceCents * l.quantity < (l.costCents ?? 0));
  if (losses.length) {
    const total = losses.reduce((a, l) => a + (l.costCents ?? 0) - l.unitPriceCents * l.quantity, 0);
    out.push({
      key: "losses",
      area: "vendas",
      severity: losses.length >= 2 ? "risk" : "warn",
      title: `${losses.length} venda(s) abaixo do custo nos últimos 90 dias (${fmt(total)} de prejuízo bruto)`,
      why: "Linhas de venda cujo preço ficou menor que o custo registrado do item. Às vezes é estratégico (liberar caixa); se se repete, revise compras e preços.",
      numbers: [
        { label: "Vendas", value: String(losses.length) },
        { label: "Prejuízo bruto", value: fmt(total) },
      ],
      items: losses.slice(0, 6).map((l) => ({ id: l.id, label: `${l.sale.code} · ${l.description}`, detail: `vendido por ${fmt(l.unitPriceCents * l.quantity)} · custo ${fmt(l.costCents)}`, href: `/vendas/${l.sale.id}` })),
    });
  }

  // 6) Desconto médio sobre o preço pedido (margem esperada × realizada)
  const sold = lossLines.length
    ? await prisma.item.findMany({ where: { orgId: ctx.orgId, id: { in: lossLines.map((l) => l.itemId) }, expectedPriceCents: { not: null } }, select: { id: true, expectedPriceCents: true } })
    : [];
  const pairs = lossLines.map((l) => ({ l, asked: sold.find((s) => s.id === l.itemId)?.expectedPriceCents ?? null })).filter((p) => p.asked);
  if (pairs.length >= 3) {
    const asked = pairs.reduce((a, p) => a + p.asked! * p.l.quantity, 0);
    const got = pairs.reduce((a, p) => a + p.l.unitPriceCents * p.l.quantity, 0);
    const disc = asked ? ((asked - got) / asked) * 100 : 0;
    const expectedMargin = pairs.reduce((a, p) => a + (p.asked! * p.l.quantity - (p.l.costCents ?? 0)), 0);
    const realizedMargin = pairs.reduce((a, p) => a + (p.l.unitPriceCents * p.l.quantity - (p.l.costCents ?? 0)), 0);
    out.push({
      key: "discount",
      area: "vendas",
      severity: disc > 10 ? "warn" : "info",
      title: `Você vende, em média, ${disc.toFixed(0)}% abaixo do preço pedido`,
      why: "Comparação entre o preço pretendido dos itens e o preço fechado nas vendas dos últimos 90 dias. Use para calibrar o preço de anúncio já contando com a negociação.",
      numbers: [
        { label: "Margem esperada", value: fmt(expectedMargin) },
        { label: "Margem realizada", value: fmt(realizedMargin) },
        { label: "Vendas analisadas", value: String(pairs.length) },
      ],
    });
  }

  // 7) Categorias mais e menos lucrativas (90 dias) e velocidade de venda
  const catRows = await prisma.$queryRaw<{ name: string; revenue: bigint; cogs: bigint; n: bigint; avg_days: number | null }[]>`
    SELECT c."name",
      SUM(CASE WHEN r."kind" = 'REVENUE' THEN r."amountCents" ELSE 0 END) AS revenue,
      SUM(CASE WHEN r."kind" = 'COGS' THEN r."amountCents" ELSE 0 END) AS cogs,
      COUNT(DISTINCT CASE WHEN r."kind" = 'REVENUE' THEN r."itemId" END) AS n,
      AVG(CASE WHEN r."kind" = 'REVENUE' THEN GREATEST(0, EXTRACT(EPOCH FROM (r."date" - i."acquiredAt")) / 86400) END)::float AS avg_days
    FROM "ResultEntry" r JOIN "Item" i ON i."id" = r."itemId" JOIN "Product" p ON p."id" = i."productId" JOIN "Category" c ON c."id" = p."categoryId"
    WHERE r."orgId" = ${ctx.orgId} AND r."date" >= ${since90} AND r."kind" IN ('REVENUE','COGS') AND r."costStatus" IS DISTINCT FROM 'UNKNOWN'
    GROUP BY c."name" HAVING SUM(CASE WHEN r."kind" = 'REVENUE' THEN r."amountCents" ELSE 0 END) > 0`;
  if (catRows.length >= 2) {
    const ranked = catRows
      .map((c) => ({ name: c.name, revenue: Number(c.revenue), gross: Number(c.revenue) - Number(c.cogs), n: Number(c.n), days: c.avg_days ? Math.round(c.avg_days) : null }))
      .map((c) => ({ ...c, margin: c.revenue ? (c.gross / c.revenue) * 100 : 0 }))
      .sort((a, b) => b.margin - a.margin);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    out.push({
      key: "categories",
      area: "compras",
      severity: "opportunity",
      title: `${best.name} dá a melhor margem (${best.margin.toFixed(0)}%); ${worst.name}, a pior (${worst.margin.toFixed(0)}%)`,
      why: "Margem bruta e tempo médio entre comprar e vender, por categoria, nos últimos 90 dias. Bom guia do que vale comprar mais — e do que evitar.",
      numbers: ranked.slice(0, 5).map((c) => ({ label: c.name, value: `${c.margin.toFixed(0)}% · ${c.n} venda(s)${c.days !== null ? ` · ${c.days} dias p/ vender` : ""}` })),
      action: { label: "Lucro por categoria", href: "/relatorios?aba=lucro&periodo=quarter&por=categoria" },
    });
  }

  // 8) Concentração do estoque
  const byCat = new Map<string, number>();
  for (const i of owned) byCat.set(i.product.category.name, (byCat.get(i.product.category.name) ?? 0) + (i.unitCostCents ?? 0) * i.qtyOnHand);
  const totalCap = [...byCat.values()].reduce((a, b) => a + b, 0);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && totalCap > 0 && top[1] / totalCap > 0.5 && owned.length >= 5) {
    out.push({
      key: "concentration",
      area: "estoque",
      severity: "info",
      title: `${Math.round((top[1] / totalCap) * 100)}% do capital em estoque está em ${top[0]}`,
      why: "Concentração alta aumenta o risco se o preço dessa categoria cair (ex.: lançamento de nova geração).",
      numbers: [
        { label: top[0], value: fmt(top[1]) },
        { label: "Estoque total", value: fmt(totalCap) },
      ],
    });
  }

  // 9) Liquidez: contas a pagar nos próximos 30 dias × caixa
  {
    const balances = await accountBalances(ctx.orgId);
    const cash = balances.filter((b) => !b.archived).reduce((a, b) => a + b.balanceCents, 0);
    const pay = await prisma.title.aggregate({ where: { orgId: ctx.orgId, direction: "PAYABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: new Date(now + 30 * DAY) } }, _sum: { amountCents: true, settledCents: true } });
    const rec = await prisma.title.aggregate({ where: { orgId: ctx.orgId, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: new Date(now + 30 * DAY) } }, _sum: { amountCents: true, settledCents: true } });
    const payable = (pay._sum.amountCents ?? 0) - (pay._sum.settledCents ?? 0);
    const receivable = (rec._sum.amountCents ?? 0) - (rec._sum.settledCents ?? 0);
    if (payable > 0 && payable > cash) {
      out.push({
        key: "liquidity",
        area: "financeiro",
        severity: payable > cash + receivable ? "risk" : "warn",
        title: `Contas a pagar em 30 dias (${fmt(payable)}) superam o caixa (${fmt(cash)})`,
        why: "Mesmo com lucro, faltar dinheiro gera juros e quebra de compromisso. Priorize vender itens parados ou cobrar recebíveis antes de comprar mais.",
        numbers: [
          { label: "Caixa", value: fmt(cash) },
          { label: "A receber em 30 dias", value: fmt(receivable) },
          { label: "A pagar em 30 dias", value: fmt(payable) },
        ],
        action: { label: "Ver contas a pagar", href: "/financeiro/pagar" },
      });
    }
  }

  // 10) Recebíveis atrasados por cliente
  const overdue = await prisma.title.findMany({ where: { orgId: ctx.orgId, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: new Date(now) } }, select: { contactId: true, amountCents: true, settledCents: true } });
  if (overdue.length) {
    const total = overdue.reduce((a, t) => a + t.amountCents - t.settledCents, 0);
    out.push({
      key: "overdue",
      area: "financeiro",
      severity: "risk",
      title: `${fmt(total)} em recebimentos atrasados`,
      why: "Quanto mais tempo passa, menor a chance de receber. Envie um lembrete educado pelo WhatsApp direto da lista.",
      numbers: [{ label: "Parcelas", value: String(overdue.length) }],
      action: { label: "Cobrar atrasados", href: "/financeiro/receber?situacao=atrasados" },
    });
  }

  // 11) Despesas operacionais possivelmente esquecidas
  const revMonth = await prisma.resultEntry.aggregate({ where: { orgId: ctx.orgId, kind: "REVENUE", date: { gte: new Date(now - 30 * DAY) } }, _sum: { amountCents: true } });
  const opex = await prisma.resultEntry.count({ where: { orgId: ctx.orgId, kind: "OPERATING_EXPENSE", date: { gte: new Date(now - 45 * DAY) } } });
  if ((revMonth._sum.amountCents ?? 0) > 0 && opex === 0) {
    out.push({
      key: "missing-opex",
      area: "financeiro",
      severity: "warn",
      title: "Nenhuma despesa operacional lançada nos últimos 45 dias",
      why: "Houve vendas, mas nenhuma despesa fixa (internet, aluguel, energia, anúncios, combustível). Sem elas, o lucro mostrado fica maior que o real.",
      numbers: [{ label: "Receita (30 dias)", value: fmt(revMonth._sum.amountCents) }],
      action: { label: "Lançar despesa", href: "/financeiro/lancar" },
    });
  }

  // 12) Custos desconhecidos
  const unknown = owned.filter((i) => i.costStatus === "UNKNOWN");
  if (unknown.length) {
    out.push({
      key: "unknown",
      area: "estoque",
      severity: "info",
      title: `${unknown.length} item(ns) com custo desconhecido`,
      why: "Ao vender, o lucro desses itens não pode ser apurado com precisão. Se encontrar o comprovante, informe o custo na ficha do item.",
      numbers: [{ label: "Itens", value: String(unknown.length) }],
      action: { label: "Ver itens", href: "/estoque?cost=unknown" },
    });
  }

  // 13) Garantias vencendo (venda antes!)
  const warranty = owned.filter((i) => i.warrantyUntil && i.warrantyUntil.getTime() > now && i.warrantyUntil.getTime() < now + 30 * DAY);
  if (warranty.length) {
    out.push({
      key: "warranty",
      area: "estoque",
      severity: "warn",
      title: `${warranty.length} item(ns) perdem a garantia em até 30 dias`,
      why: "Item com garantia de fábrica vale mais. Destaque a garantia no anúncio enquanto ela existe.",
      numbers: [{ label: "Itens", value: String(warranty.length) }],
      items: warranty.slice(0, 6).map((i) => ({ id: i.id, label: `${i.code} · ${i.title}`, detail: `garantia até ${i.warrantyUntil!.toLocaleDateString("pt-BR")}`, href: `/estoque/${i.id}` })),
    });
  }

  // 14) Reservas paradas
  const reserved = await prisma.item.findMany({ where: { orgId: ctx.orgId, status: "RESERVED", updatedAt: { lt: new Date(now - settings.reservationDays * DAY) } }, select: { id: true, code: true, title: true, holdId: true } });
  if (reserved.length) {
    out.push({
      key: "stale-reservations",
      area: "vendas",
      severity: "warn",
      title: `${reserved.length} item(ns) reservados há mais de ${settings.reservationDays} dias`,
      why: "Reserva longa tira o item de circulação. Confirme com o cliente ou libere.",
      numbers: [{ label: "Itens", value: String(reserved.length) }],
      items: reserved.slice(0, 6).map((i) => ({ id: i.id, label: `${i.code} · ${i.title}`, detail: "reservado", href: i.holdId ? `/vendas/${i.holdId}` : `/estoque/${i.id}` })),
    });
  }

  // 15) Catiras: propostas que destroem valor e itens recebidos encalhados
  const negotiating = await prisma.trade.findMany({ where: { orgId: ctx.orgId, status: "NEGOTIATING" }, include: { outLines: true, inLines: true } });
  const badDeals = negotiating.filter((t) => t.inLines.reduce((a, l) => a + l.agreedValueCents, 0) + t.cashInCents < t.outLines.reduce((a, l) => a + l.agreedValueCents, 0) + t.cashOutCents + t.feesCents);
  if (badDeals.length) {
    out.push({
      key: "bad-trades",
      area: "catiras",
      severity: "risk",
      title: `${badDeals.length} catira(s) em negociação em que você entrega mais do que recebe`,
      why: "Pelos valores combinados, o lado que você recebe (itens + volta) vale menos do que o que você entrega (itens + volta + custos).",
      numbers: [{ label: "Negociações", value: String(badDeals.length) }],
      items: badDeals.map((t) => ({ id: t.id, label: `${t.code} · ${t.title}`, detail: "revise a proposta", href: `/catiras/${t.id}` })),
    });
  }
  const tradeStale = await prisma.item.findMany({ where: { orgId: ctx.orgId, acquisitionType: "TRADE", status: { in: [...LIVE] }, acquiredAt: { lt: new Date(now - 60 * DAY) } }, select: { id: true, code: true, title: true, unitCostCents: true } });
  if (tradeStale.length) {
    out.push({
      key: "trade-stale",
      area: "catiras",
      severity: "warn",
      title: `${tradeStale.length} item(ns) recebidos em catira ainda sem venda após 60 dias`,
      why: "O ganho de uma catira só existe quando o item recebido é vendido. Itens encalhados indicam que a avaliação foi otimista.",
      numbers: [{ label: "Capital", value: fmt(tradeStale.reduce((a, i) => a + (i.unitCostCents ?? 0), 0)) }],
      items: tradeStale.slice(0, 6).map((i) => ({ id: i.id, label: `${i.code} · ${i.title}`, detail: `custo ${fmt(i.unitCostCents)}`, href: `/estoque/${i.id}` })),
    });
  }

  const order = { risk: 0, warn: 1, opportunity: 2, info: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
