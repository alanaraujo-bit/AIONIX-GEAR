import { z } from "zod";
import type { Tx } from "../db";
import { requirePerm, withIdempotency, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, ConflictError, assert } from "../errors";
import {
  audit,
  itemEvent,
  nextCode,
  resultEntry,
  reverseResultEntries,
  transitionUnits,
  adjustLotQty,
  combineCostStatus,
  STATUS_LABEL,
  syncInstalledChildren,
} from "./shared";
import { ensureProduct, insertItem } from "./items";
import { applyPaymentPlan, unwindSourceFinance, PAYMENT_METHODS, accountBalances } from "./finance";
import { systemCategoryId } from "./org";
import { allocate, splitEven } from "@/lib/money";
import type { CostStatus } from "@/generated/prisma/client";

const inLineSchema = z.object({
  productId: z.string().optional().nullable(),
  categoryId: z.string().min(1, "Escolha a categoria do item recebido."),
  title: z.string().trim().min(2).max(160),
  brand: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  serial: z.string().trim().max(120).optional().nullable(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).default("GOOD"),
  conditionReport: z.string().trim().max(4000).optional().nullable(),
  specs: z.record(z.string(), z.unknown()).optional(),
  quantity: z.number().int().min(1).max(1000).default(1),
  agreedValueCents: z.number().int().min(0),
  estimatedValueCents: z.number().int().min(0).optional().nullable(),
  expectedPriceCents: z.number().int().min(0).optional().nullable(),
  locationId: z.string().optional().nullable(),
});

export const tradeSchema = z.object({
  id: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  title: z.string().trim().min(2).max(160),
  date: z.coerce.date(),
  notes: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["DRAFT", "NEGOTIATING"]).default("DRAFT"),
  out: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.number().int().min(1).default(1),
      agreedValueCents: z.number().int().min(0),
      estimatedValueCents: z.number().int().min(0).optional().nullable(),
    }),
  ),
  in: z.array(inLineSchema),
  cashInCents: z.number().int().min(0).default(0),
  cashOutCents: z.number().int().min(0).default(0),
  feesCents: z.number().int().min(0).default(0),
  revision: z
    .object({ author: z.enum(["US", "THEM"]), note: z.string().trim().max(1000).optional().nullable() })
    .optional()
    .nullable(),
  idempotencyKey: z.string().optional(),
});

export type TradeInput = z.input<typeof tradeSchema>;

// ─────────────────────────── Análise econômica ───────────────────────────

export type TradeAnalysis = {
  out: { itemId: string; code: string; title: string; quantity: number; costCents: number | null; costStatus: CostStatus; agreedValueCents: number; estimatedValueCents: number | null }[];
  in: { index: number; title: string; quantity: number; agreedValueCents: number; estimatedValueCents: number | null; allocatedCostCents: number; unitCostCents: number }[];
  outCostCents: number;
  outCostStatus: CostStatus;
  outAgreedCents: number;
  outEstimatedCents: number | null;
  inAgreedCents: number;
  inEstimatedCents: number | null;
  inEstimateCoveragePct: number;
  cashInCents: number;
  cashOutCents: number;
  feesCents: number;
  /** Efeito líquido no caixa (entra − sai − taxas) */
  netCashCents: number;
  /** Custo que passa para os itens recebidos (método do custo transferido) */
  incomingCostBasisCents: number;
  /** Resultado reconhecido agora: só dinheiro recebido acima do custo do que saiu */
  realizedResultCents: number;
  /** Ganho pelos valores acordados entre as partes (não realizado) */
  agreedGainCents: number;
  /** Potencial de revenda: valor de mercado estimado do recebido − novo custo (não realizado) */
  potentialUpsideCents: number | null;
  warnings: { level: "info" | "warn" | "risk"; text: string }[];
};

/**
 * Regra de custo da catira (método do custo transferido, conservador):
 *   custo dos itens recebidos = custo do que saiu + dinheiro pago + taxas − dinheiro recebido
 * rateado entre os itens recebidos na proporção do valor acordado.
 * Nenhuma receita é reconhecida pela troca em si — o lucro aparece quando os itens
 * recebidos forem vendidos. Exceção: se o dinheiro recebido supera o custo do que saiu,
 * o excedente é resultado realizado agora (e os recebidos entram com custo zero).
 */
export function analyzeTrade(
  out: { itemId: string; code: string; title: string; quantity: number; unitCostCents: number | null; costStatus: CostStatus; agreedValueCents: number; estimatedValueCents: number | null }[],
  incoming: { title: string; quantity: number; agreedValueCents: number; estimatedValueCents?: number | null; condition?: string }[],
  cash: { cashInCents: number; cashOutCents: number; feesCents: number },
  context?: { availableCashCents?: number },
): TradeAnalysis {
  const outRows = out.map((o) => ({
    itemId: o.itemId,
    code: o.code,
    title: o.title,
    quantity: o.quantity,
    costCents: o.unitCostCents !== null ? o.unitCostCents * o.quantity : null,
    costStatus: o.costStatus,
    agreedValueCents: o.agreedValueCents,
    estimatedValueCents: o.estimatedValueCents,
  }));
  const outCost = outRows.reduce((a, o) => a + (o.costCents ?? 0), 0);
  const outCostStatus = combineCostStatus(outRows.map((o) => o.costStatus));
  const outAgreed = outRows.reduce((a, o) => a + o.agreedValueCents, 0);
  const outEstimated = outRows.every((o) => o.estimatedValueCents !== null)
    ? outRows.reduce((a, o) => a + (o.estimatedValueCents ?? 0), 0)
    : null;
  const inAgreed = incoming.reduce((a, i) => a + i.agreedValueCents, 0);
  const withEstimate = incoming.filter((i) => i.estimatedValueCents !== null && i.estimatedValueCents !== undefined);
  const inEstimated = withEstimate.length === incoming.length && incoming.length > 0 ? withEstimate.reduce((a, i) => a + (i.estimatedValueCents ?? 0), 0) : null;
  const coverage = inAgreed > 0 ? (withEstimate.reduce((a, i) => a + i.agreedValueCents, 0) / inAgreed) * 100 : incoming.length ? (withEstimate.length / incoming.length) * 100 : 0;

  const { cashInCents, cashOutCents, feesCents } = cash;
  const rawBasis = outCost + cashOutCents + feesCents - cashInCents;
  const basis = Math.max(0, rawBasis);
  const realized = outCostStatus === "UNKNOWN" ? 0 : Math.max(0, -rawBasis);
  const weights = incoming.map((i) => (i.agreedValueCents > 0 ? i.agreedValueCents : i.estimatedValueCents ?? 0));
  const parts = incoming.length ? allocate(basis, weights) : [];
  const inRows = incoming.map((i, idx) => ({
    index: idx,
    title: i.title,
    quantity: i.quantity,
    agreedValueCents: i.agreedValueCents,
    estimatedValueCents: i.estimatedValueCents ?? null,
    allocatedCostCents: parts[idx] ?? 0,
    unitCostCents: Math.round((parts[idx] ?? 0) / Math.max(1, i.quantity)),
  }));
  const netCash = cashInCents - cashOutCents - feesCents;
  const agreedGain = inAgreed + cashInCents - outAgreed - cashOutCents - feesCents;
  const upside = inEstimated !== null ? inEstimated - basis : null;

  const warnings: TradeAnalysis["warnings"] = [];
  if (outCostStatus === "UNKNOWN") {
    warnings.push({ level: "risk", text: "Há itens saindo com custo desconhecido: o custo dos itens recebidos também ficará marcado como desconhecido e o lucro futuro não poderá ser apurado com precisão." });
  } else if (outCostStatus === "ESTIMATED") {
    warnings.push({ level: "warn", text: "Parte do custo dos itens que saem é estimada; o custo dos recebidos herda essa incerteza." });
  }
  if (incoming.length && coverage < 100) {
    warnings.push({ level: "warn", text: `Só ${Math.round(coverage)}% do valor recebido tem estimativa de mercado. Informe quanto cada item vale para revenda para medir o potencial.` });
  }
  if (agreedGain < 0) {
    warnings.push({ level: "risk", text: "Pelos valores acordados, você está entregando mais valor do que recebe." });
  }
  for (const o of outRows) {
    if (o.costCents !== null && o.agreedValueCents < o.costCents) {
      warnings.push({ level: "warn", text: `${o.code} está sendo avaliado na troca abaixo do seu custo.` });
    }
  }
  if (upside !== null && upside < 0) {
    warnings.push({ level: "risk", text: "O valor de mercado estimado do que você recebe é menor que o custo que ele vai carregar: a revenda tende a dar prejuízo." });
  }
  if (netCash < 0 && context?.availableCashCents !== undefined && context.availableCashCents + netCash < 0) {
    warnings.push({ level: "risk", text: "O dinheiro que você vai pagar é maior que o saldo disponível nas contas." });
  } else if (netCash < 0) {
    warnings.push({ level: "info", text: "Esta catira consome caixa: você troca dinheiro por estoque, que só vira dinheiro quando for revendido." });
  }
  if (incoming.some((i) => i.condition === "FOR_PARTS")) {
    warnings.push({ level: "warn", text: "Há item recebido marcado como 'para peças': avalie com cuidado o valor de revenda." });
  }
  if (realized > 0) {
    warnings.push({ level: "info", text: "O dinheiro recebido supera o custo do que você entrega: esse excedente é lucro realizado agora, e os itens recebidos entram com custo zero." });
  }
  return {
    out: outRows,
    in: inRows,
    outCostCents: outCost,
    outCostStatus,
    outAgreedCents: outAgreed,
    outEstimatedCents: outEstimated,
    inAgreedCents: inAgreed,
    inEstimatedCents: inEstimated,
    inEstimateCoveragePct: coverage,
    cashInCents,
    cashOutCents,
    feesCents,
    netCashCents: netCash,
    incomingCostBasisCents: basis,
    realizedResultCents: realized,
    agreedGainCents: agreedGain,
    potentialUpsideCents: upside,
    warnings,
  };
}

async function loadOut(tx: Tx, ctx: Ctx, out: z.infer<typeof tradeSchema>["out"], tradeId: string | null) {
  const ids = out.map((o) => o.itemId);
  assert(new Set(ids).size === ids.length, "O mesmo item aparece duas vezes na catira.");
  const items = await tx.item.findMany({ where: { orgId: ctx.orgId, id: { in: ids } } });
  return out.map((o) => {
    const it = items.find((i) => i.id === o.itemId);
    if (!it) throw new NotFoundError("Item");
    if (it.ownership !== "OWNED") throw new DomainError(`${it.code} não é item próprio e não pode entrar em catira.`);
    const heldByMe = tradeId && it.holdType === "TRADE" && it.holdId === tradeId;
    if (it.tracking === "UNIT") {
      assert(o.quantity === 1, `${it.code} é unidade única.`);
      if (!(it.status === "AVAILABLE" || (heldByMe && it.status === "IN_NEGOTIATION"))) {
        throw new ConflictError(`${it.code} não está disponível (${STATUS_LABEL[it.status]}).`);
      }
    } else {
      const free = it.qtyOnHand - it.qtyReserved + (heldByMe ? o.quantity : 0);
      if (free < o.quantity) throw new ConflictError(`${it.code}: quantidade insuficiente no lote.`);
    }
    return { ...o, item: it };
  });
}

/** Valores para a tela: análise prévia de uma proposta ainda não salva ou salva. */
export async function previewTrade(ctx: Ctx, raw: TradeInput) {
  requirePerm(ctx, "trades.manage");
  const input = tradeSchema.parse({ ...raw, title: "Prévia" });
  return withTx(async (tx) => {
    const out = await loadOut(tx, ctx, input.out, input.id ?? null);
    const balances = await accountBalances(ctx.orgId);
    return analyzeTrade(
      out.map((o) => ({
        itemId: o.itemId,
        code: o.item.code,
        title: o.item.title,
        quantity: o.quantity,
        unitCostCents: o.item.unitCostCents,
        costStatus: o.item.costStatus,
        agreedValueCents: o.agreedValueCents,
        estimatedValueCents: o.estimatedValueCents ?? o.item.estimatedValueCents ?? null,
      })),
      input.in,
      input,
      { availableCashCents: balances.reduce((a, b) => a + b.balanceCents, 0) },
    );
  });
}

async function releaseTradeHolds(tx: Tx, ctx: Ctx, tradeId: string, reason: string) {
  const held = await tx.item.findMany({ where: { orgId: ctx.orgId, holdType: "TRADE", holdId: tradeId } });
  for (const it of held) {
    if (it.tracking === "UNIT") {
      await transitionUnits(tx, ctx, [it.id], ["IN_NEGOTIATION"], "AVAILABLE", { holdType: null, holdId: null, requireHold: { type: "TRADE", id: tradeId } });
      await itemEvent(tx, ctx, { itemId: it.id, type: "RELEASED", message: "Liberado da negociação", fromStatus: "IN_NEGOTIATION", toStatus: "AVAILABLE", reason, refType: "TRADE", refId: tradeId });
    }
  }
  // Lotes: reservas registradas nas linhas de saída
  const lines = await tx.tradeOutLine.findMany({ where: { tradeId, orgId: ctx.orgId } });
  const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId } });
  if (trade.status === "NEGOTIATING") {
    for (const l of lines) {
      const it = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
      if (it.tracking === "LOT") await adjustLotQty(tx, ctx, it.id, { reserved: -l.quantity });
    }
  }
}

/**
 * Salva rascunho/negociação. Em "Em negociação", os itens que você oferece ficam
 * bloqueados (não aparecem como disponíveis para venda ou montagem).
 */
export async function saveTrade(ctx: Ctx, raw: TradeInput) {
  requirePerm(ctx, "trades.manage");
  const input = tradeSchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    if (input.contactId) {
      const c = await tx.contact.findFirst({ where: { id: input.contactId, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Contato");
    }
    for (const l of input.in) {
      const cat = await tx.category.findFirst({ where: { id: l.categoryId, orgId: ctx.orgId } });
      if (!cat) throw new NotFoundError("Categoria");
      if (l.locationId) {
        const loc = await tx.location.findFirst({ where: { id: l.locationId, orgId: ctx.orgId } });
        if (!loc) throw new NotFoundError("Local");
      }
    }
    let tradeId = input.id ?? null;
    let code: string;
    if (tradeId) {
      const t = await tx.trade.findFirst({ where: { id: tradeId, orgId: ctx.orgId } });
      if (!t) throw new NotFoundError("Catira");
      if (!["DRAFT", "NEGOTIATING"].includes(t.status)) throw new DomainError("Catira confirmada ou cancelada não pode ser editada.");
      await releaseTradeHolds(tx, ctx, tradeId, "Proposta alterada");
      await tx.tradeOutLine.deleteMany({ where: { tradeId } });
      await tx.tradeInLine.deleteMany({ where: { tradeId } });
      code = t.code;
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          contactId: input.contactId ?? null,
          title: input.title,
          date: input.date,
          notes: input.notes ?? null,
          status: input.status,
          cashInCents: input.cashInCents,
          cashOutCents: input.cashOutCents,
          feesCents: input.feesCents,
        },
      });
    } else {
      code = await nextCode(tx, ctx.orgId, "trade");
      const t = await tx.trade.create({
        data: {
          orgId: ctx.orgId,
          code,
          contactId: input.contactId ?? null,
          title: input.title,
          date: input.date,
          notes: input.notes ?? null,
          status: input.status,
          cashInCents: input.cashInCents,
          cashOutCents: input.cashOutCents,
          feesCents: input.feesCents,
          createdById: ctx.userId,
        },
      });
      tradeId = t.id;
    }
    const out = await loadOut(tx, ctx, input.out, null);
    for (const o of out) {
      await tx.tradeOutLine.create({
        data: {
          orgId: ctx.orgId,
          tradeId: tradeId!,
          itemId: o.itemId,
          quantity: o.quantity,
          agreedValueCents: o.agreedValueCents,
          estimatedValueCents: o.estimatedValueCents ?? null,
        },
      });
    }
    for (const l of input.in) {
      await tx.tradeInLine.create({
        data: {
          orgId: ctx.orgId,
          tradeId: tradeId!,
          productId: l.productId ?? null,
          categoryId: l.categoryId,
          title: l.title,
          brand: l.brand ?? null,
          model: l.model ?? null,
          serial: l.serial ?? null,
          condition: l.condition,
          conditionReport: l.conditionReport ?? null,
          specs: (l.specs ?? {}) as object,
          quantity: l.quantity,
          agreedValueCents: l.agreedValueCents,
          estimatedValueCents: l.estimatedValueCents ?? null,
          expectedPriceCents: l.expectedPriceCents ?? null,
          locationId: l.locationId ?? null,
        },
      });
    }
    if (input.status === "NEGOTIATING") {
      for (const o of out) {
        if (o.item.tracking === "UNIT") {
          await transitionUnits(tx, ctx, [o.itemId], ["AVAILABLE"], "IN_NEGOTIATION", { holdType: "TRADE", holdId: tradeId! });
          await itemEvent(tx, ctx, { itemId: o.itemId, type: "RESERVED", message: `Em negociação na catira ${code}`, fromStatus: "AVAILABLE", toStatus: "IN_NEGOTIATION", refType: "TRADE", refId: tradeId! });
        } else {
          await adjustLotQty(tx, ctx, o.itemId, { reserved: o.quantity });
        }
      }
    }
    if (input.revision) {
      const count = await tx.tradeRevision.count({ where: { tradeId: tradeId! } });
      await tx.tradeRevision.create({
        data: {
          orgId: ctx.orgId,
          tradeId: tradeId!,
          number: count + 1,
          author: input.revision.author,
          note: input.revision.note ?? null,
          userId: ctx.userId,
          snapshot: JSON.parse(JSON.stringify({ out: input.out, in: input.in, cashInCents: input.cashInCents, cashOutCents: input.cashOutCents, feesCents: input.feesCents })),
        },
      });
    }
    await audit(tx, ctx, "trade.save", `Catira ${code} salva (${input.status === "DRAFT" ? "rascunho" : "em negociação"})`, { entityType: "Trade", entityId: tradeId! });
    return { id: tradeId!, code };
  });
}

const cashPlanSchema = z
  .object({
    now: z.array(z.object({ amountCents: z.number().int().positive(), accountId: z.string().min(1), method: z.enum(PAYMENT_METHODS) })).default([]),
    remainder: z.object({ installments: z.number().int().min(1).max(48).default(1), firstDueDate: z.coerce.date() }).optional().nullable(),
  })
  .optional();

export const confirmTradeSchema = z.object({
  tradeId: z.string(),
  cashIn: cashPlanSchema,
  cashOut: cashPlanSchema,
  fees: cashPlanSchema,
  idempotencyKey: z.string().optional(),
});

/**
 * Confirma a catira: itens que saem viram "Trocado", itens recebidos entram no estoque
 * com o custo transferido, o dinheiro é registrado (ou fica a receber/pagar) e a análise
 * fica congelada no registro para auditoria.
 */
export async function confirmTrade(ctx: Ctx, raw: z.input<typeof confirmTradeSchema>) {
  requirePerm(ctx, "trades.manage");
  const input = confirmTradeSchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const trade = await tx.trade.findFirst({ where: { id: input.tradeId, orgId: ctx.orgId }, include: { outLines: true, inLines: true } });
    if (!trade) throw new NotFoundError("Catira");
    assert(trade.outLines.length > 0, "Inclua ao menos um item que você entrega. Sem itens saindo, registre como compra.");
    assert(trade.inLines.length > 0, "Inclua ao menos um item que você recebe. Sem itens entrando, registre como venda.");
    const wasNegotiating = trade.status === "NEGOTIATING";
    const lock = await tx.trade.updateMany({
      where: { id: trade.id, orgId: ctx.orgId, status: { in: ["DRAFT", "NEGOTIATING"] } },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    if (lock.count !== 1) throw new ConflictError("Esta catira já foi confirmada ou cancelada.");
    const contact = trade.contactId ? await tx.contact.findUnique({ where: { id: trade.contactId } }) : null;
    const who = contact ? ` com ${contact.name}` : "";

    // 1) Saída dos itens entregues (condicional: impede usar o mesmo item em duas operações).
    const outItems = [];
    for (const l of trade.outLines) {
      const it = await tx.item.findFirstOrThrow({ where: { id: l.itemId, orgId: ctx.orgId } });
      const heldByMe = it.holdType === "TRADE" && it.holdId === trade.id;
      if (it.tracking === "UNIT") {
        await transitionUnits(tx, ctx, [it.id], heldByMe ? ["IN_NEGOTIATION"] : ["AVAILABLE"], "EXCHANGED", {
          holdType: null,
          holdId: null,
          requireHold: heldByMe ? { type: "TRADE", id: trade.id } : null,
          exitedAt: trade.date,
          qtyOnHand: 0,
        });
        await syncInstalledChildren(tx, ctx, [it.id], trade.date);
      } else {
        await adjustLotQty(tx, ctx, it.id, { onHand: -l.quantity, reserved: wasNegotiating ? -l.quantity : 0 });
      }
      await tx.tradeOutLine.update({
        where: { id: l.id },
        data: { costCents: it.unitCostCents !== null ? it.unitCostCents * l.quantity : null, costStatus: it.costStatus },
      });
      await itemEvent(tx, ctx, {
        itemId: it.id,
        type: "TRADED_OUT",
        message: `Entregue na catira ${trade.code}${who} (valor acordado ${(l.agreedValueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
        fromStatus: it.status,
        toStatus: it.tracking === "UNIT" ? "EXCHANGED" : undefined,
        qtyDelta: -l.quantity,
        refType: "TRADE",
        refId: trade.id,
      });
      outItems.push({ line: l, item: it });
    }

    // 2) Análise final congelada.
    const analysis = analyzeTrade(
      outItems.map(({ line, item }) => ({
        itemId: item.id,
        code: item.code,
        title: item.title,
        quantity: line.quantity,
        unitCostCents: item.unitCostCents,
        costStatus: item.costStatus,
        agreedValueCents: line.agreedValueCents,
        estimatedValueCents: line.estimatedValueCents ?? item.estimatedValueCents,
      })),
      trade.inLines.map((l) => ({ title: l.title, quantity: l.quantity, agreedValueCents: l.agreedValueCents, estimatedValueCents: l.estimatedValueCents, condition: l.condition })),
      trade,
    );
    const incomingStatus: CostStatus = analysis.outCostStatus;

    // 3) Entrada dos itens recebidos com custo transferido.
    for (let i = 0; i < trade.inLines.length; i++) {
      const l = trade.inLines[i];
      const allocated = analysis.in[i].allocatedCostCents;
      const product = await ensureProduct(tx, ctx, {
        productId: l.productId,
        categoryId: l.categoryId,
        brand: l.brand,
        model: l.model,
        name: l.brand || l.model ? null : l.title,
      });
      const desc = `Custo transferido da catira ${trade.code} (rateio pelo valor acordado)`;
      if (product.tracking === "LOT") {
        await insertItem(tx, ctx, {
          product,
          title: l.title,
          status: "INSPECTION",
          condition: l.condition,
          defects: l.conditionReport,
          specs: l.specs as Record<string, unknown>,
          quantity: l.quantity,
          unitCostCents: Math.round(allocated / l.quantity),
          costStatus: incomingStatus,
          costBreakdown: [{ kind: "TRADE_ALLOCATION", amountCents: allocated, description: desc }],
          expectedPriceCents: l.expectedPriceCents,
          estimatedValueCents: l.estimatedValueCents,
          estimatedValueNote: l.estimatedValueCents ? `Estimativa informada na catira ${trade.code}` : null,
          locationId: l.locationId,
          acquisitionType: "TRADE",
          acquiredAt: trade.date,
          sourceTradeId: trade.id,
          eventMessage: `Recebido na catira ${trade.code}${who}`,
          refType: "TRADE",
          refId: trade.id,
        }).then((it) => tx.tradeInLine.update({ where: { id: l.id }, data: { allocatedCostCents: allocated, createdItemId: it.id } }));
      } else {
        const units = splitEven(allocated, l.quantity);
        const agreedUnits = splitEven(l.agreedValueCents, l.quantity);
        let firstId: string | null = null;
        for (let u = 0; u < l.quantity; u++) {
          const it = await insertItem(tx, ctx, {
            product,
            title: l.title,
            serial: l.quantity === 1 ? l.serial : null,
            status: "INSPECTION",
            condition: l.condition,
            defects: l.conditionReport,
            specs: l.specs as Record<string, unknown>,
            unitCostCents: units[u],
            costStatus: incomingStatus,
            costBreakdown: [{ kind: "TRADE_ALLOCATION", amountCents: units[u], description: desc }],
            expectedPriceCents: l.expectedPriceCents,
            estimatedValueCents: l.estimatedValueCents ? splitEven(l.estimatedValueCents, l.quantity)[u] : null,
            estimatedValueNote: l.estimatedValueCents ? `Estimativa informada na catira ${trade.code}` : null,
            locationId: l.locationId,
            acquisitionType: "TRADE",
            acquiredAt: trade.date,
            sourceTradeId: trade.id,
            eventMessage: `Recebido na catira ${trade.code}${who} (valor acordado ${(agreedUnits[u] / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
            refType: "TRADE",
            refId: trade.id,
          });
          firstId ??= it.id;
        }
        await tx.tradeInLine.update({ where: { id: l.id }, data: { allocatedCostCents: allocated, createdItemId: firstId } });
      }
    }

    // 4) Resultado realizado (apenas dinheiro acima do custo entregue).
    if (analysis.realizedResultCents > 0) {
      await resultEntry(tx, ctx, {
        date: trade.date,
        kind: "OTHER_INCOME",
        amountCents: analysis.realizedResultCents,
        description: `Ganho realizado em dinheiro na catira ${trade.code}`,
        refType: "TRADE",
        refId: trade.id,
        tradeId: trade.id,
        contactId: trade.contactId,
      });
    }

    // 5) Dinheiro: o que entra, o que sai e taxas.
    const tradeCat = await systemCategoryId(tx, ctx.orgId, "TRADE");
    const plans: [number, "RECEIVABLE" | "PAYABLE", z.infer<typeof cashPlanSchema>, string][] = [
      [trade.cashInCents, "RECEIVABLE", input.cashIn, `Volta recebida na catira ${trade.code}${who}`],
      [trade.cashOutCents, "PAYABLE", input.cashOut, `Volta paga na catira ${trade.code}${who}`],
      [trade.feesCents, "PAYABLE", input.fees, `Custos da catira ${trade.code} (frete/taxas)`],
    ];
    for (const [amount, direction, plan, description] of plans) {
      if (amount <= 0) continue;
      await applyPaymentPlan(tx, ctx, {
        direction,
        totalCents: amount,
        contactId: trade.contactId,
        sourceType: "TRADE",
        sourceId: trade.id,
        description,
        categoryId: tradeCat,
        date: trade.date,
        now: (plan?.now ?? []).map((p) => ({ ...p, date: trade.date })),
        remainder: plan?.remainder ?? { installments: 1, firstDueDate: trade.date },
      });
    }
    await tx.trade.update({ where: { id: trade.id }, data: { valuation: JSON.parse(JSON.stringify(analysis)) } });
    await audit(tx, ctx, "trade.confirm", `Catira ${trade.code} confirmada${who}`, {
      entityType: "Trade",
      entityId: trade.id,
      data: { incomingCostBasisCents: analysis.incomingCostBasisCents, netCashCents: analysis.netCashCents },
    });
    return { id: trade.id, code: trade.code, analysis };
  });
}

/**
 * Cancela catira. Antes de confirmar: libera os itens. Depois de confirmada: só se os
 * itens recebidos ainda não foram usados — eles são anulados, os entregues voltam ao
 * estoque com o custo original e o dinheiro movimentado é estornado.
 */
export async function cancelTrade(ctx: Ctx, input: { tradeId: string; reason: string; refundAccountId?: string | null }) {
  requirePerm(ctx, "trades.manage");
  assert(input.reason?.trim().length >= 3, "Informe o motivo do cancelamento.");
  return withTx(async (tx) => {
    const trade = await tx.trade.findFirst({ where: { id: input.tradeId, orgId: ctx.orgId }, include: { outLines: true } });
    if (!trade) throw new NotFoundError("Catira");
    if (trade.status === "CANCELLED") throw new ConflictError("Esta catira já está cancelada.");
    if (trade.status !== "CONFIRMED") {
      await releaseTradeHolds(tx, ctx, trade.id, `Catira cancelada: ${input.reason}`);
      await tx.trade.update({ where: { id: trade.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason } });
      await audit(tx, ctx, "trade.cancel", `Catira ${trade.code} cancelada (não confirmada)`, { entityType: "Trade", entityId: trade.id });
      return { ok: true };
    }
    const received = await tx.item.findMany({ where: { orgId: ctx.orgId, sourceTradeId: trade.id } });
    const used = received.filter(
      (i) => !["AVAILABLE", "INSPECTION", "DEFECTIVE"].includes(i.status) || (i.tracking === "LOT" && (i.qtyOnHand !== i.qtyInitial || i.qtyReserved > 0)),
    );
    if (used.length) {
      throw new DomainError(`Os itens recebidos ${used.map((u) => u.code).join(", ")} já foram usados. A catira não pode ser desfeita automaticamente.`);
    }
    const lock = await tx.trade.updateMany({
      where: { id: trade.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
    });
    if (lock.count !== 1) throw new ConflictError("A catira mudou enquanto você operava.");
    const date = new Date();
    for (const it of received) {
      await tx.item.update({ where: { id: it.id }, data: { status: "VOID", qtyOnHand: 0, exitedAt: date, version: { increment: 1 } } });
      await itemEvent(tx, ctx, { itemId: it.id, type: "VOIDED", message: `Catira ${trade.code} desfeita — item devolvido`, fromStatus: it.status, toStatus: "VOID", reason: input.reason, refType: "TRADE", refId: trade.id });
    }
    for (const l of trade.outLines) {
      const it = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
      if (it.tracking === "UNIT") {
        await transitionUnits(tx, ctx, [it.id], ["EXCHANGED"], "AVAILABLE", { exitedAt: null, qtyOnHand: 1 });
        await syncInstalledChildren(tx, ctx, [it.id], null);
      } else {
        await adjustLotQty(tx, ctx, it.id, { onHand: l.quantity });
      }
      await itemEvent(tx, ctx, { itemId: it.id, type: "TRADE_UNDONE", message: `Catira ${trade.code} desfeita — item voltou ao estoque`, fromStatus: it.status, toStatus: it.tracking === "UNIT" ? "AVAILABLE" : undefined, qtyDelta: l.quantity, reason: input.reason, refType: "TRADE", refId: trade.id });
    }
    await reverseResultEntries(tx, ctx, { refType: "TRADE", refId: trade.id }, date, `Catira ${trade.code} desfeita`);
    await unwindSourceFinance(tx, ctx, { sourceType: "TRADE", sourceId: trade.id }, `Catira ${trade.code} desfeita`, { refundAccountId: input.refundAccountId });
    await audit(tx, ctx, "trade.undo", `Catira ${trade.code} desfeita`, { entityType: "Trade", entityId: trade.id, data: { reason: input.reason } });
    return { ok: true };
  });
}
