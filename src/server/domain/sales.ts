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
  STATUS_LABEL,
} from "./shared";
import { ensureProduct, insertItem } from "./items";
import {
  applyPaymentPlan,
  createTitle,
  settleTitle,
  unwindSourceFinance,
  PAYMENT_METHODS,
} from "./finance";
import { systemCategoryId } from "./org";
import { allocate } from "@/lib/money";
import { randomBytes } from "node:crypto";

const tradeInSchema = z.object({
  product: z.object({
    productId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    brand: z.string().trim().max(60).optional().nullable(),
    model: z.string().trim().max(120).optional().nullable(),
    name: z.string().trim().max(160).optional().nullable(),
  }),
  serial: z.string().trim().max(120).optional().nullable(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).default("GOOD"),
  agreedValueCents: z.number().int().positive(),
  locationId: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const saleSchema = z.object({
  id: z.string().optional().nullable(),
  action: z.enum(["QUOTE", "CONFIRM"]),
  contactId: z.string().optional().nullable(),
  channel: z.string().trim().max(60).optional().nullable(),
  date: z.coerce.date(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().min(1).default(1),
        unitPriceCents: z.number().int().min(0),
        description: z.string().trim().max(200).optional().nullable(),
      }),
    )
    .min(1, "Adicione ao menos um item."),
  discountCents: z.number().int().min(0).default(0),
  shippingChargedCents: z.number().int().min(0).default(0),
  shippingCostCents: z.number().int().min(0).default(0),
  feeCents: z.number().int().min(0).default(0),
  /** Taxa retida pela maquininha/plataforma (descontada do valor recebido). Se false, é paga à parte. */
  feeWithheld: z.boolean().default(true),
  /** Conta de onde saiu o frete pago pelo vendedor; vazio = fica a pagar. */
  shippingAccountId: z.string().optional().nullable(),
  warrantyDays: z.number().int().min(0).max(3650).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  quoteValidUntil: z.coerce.date().optional().nullable(),
  reserveItems: z.boolean().default(false),
  delivered: z.boolean().default(false),
  payment: z
    .object({
      now: z
        .array(z.object({ amountCents: z.number().int().positive(), accountId: z.string().min(1), method: z.enum(PAYMENT_METHODS) }))
        .default([]),
      remainder: z
        .object({
          installments: z.number().int().min(1).max(48).default(1),
          firstDueDate: z.coerce.date(),
          intervalDays: z.number().int().min(1).max(365).optional(),
          method: z.enum(PAYMENT_METHODS).optional().nullable(),
        })
        .optional()
        .nullable(),
    })
    .optional(),
  tradeIns: z.array(tradeInSchema).default([]),
  opportunityId: z.string().optional().nullable(),
  idempotencyKey: z.string().optional(),
});

export type SaleInput = z.input<typeof saleSchema>;

type LoadedLine = {
  itemId: string;
  quantity: number;
  unitPriceCents: number;
  description: string;
  item: Awaited<ReturnType<Tx["item"]["findFirstOrThrow"]>>;
};

async function loadLines(tx: Tx, ctx: Ctx, lines: z.infer<typeof saleSchema>["lines"]): Promise<LoadedLine[]> {
  const ids = lines.map((l) => l.itemId);
  assert(new Set(ids).size === ids.length, "O mesmo item aparece duas vezes na venda.");
  const items = await tx.item.findMany({ where: { orgId: ctx.orgId, id: { in: ids } } });
  return lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) throw new NotFoundError("Item");
    if (item.ownership === "CLIENT" || item.ownership === "THIRD_PARTY") {
      throw new DomainError(`${item.code} pertence a terceiro e não pode ser vendido como estoque.`);
    }
    if (item.tracking === "UNIT") assert(l.quantity === 1, `${item.code} é uma unidade única.`);
    return { ...l, description: l.description || item.title, item };
  });
}

/** Libera reservas feitas por um orçamento (unidades e lotes). */
async function releaseSaleHolds(tx: Tx, ctx: Ctx, saleId: string, reason: string) {
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { lines: true } });
  if (!sale.reserveItems) return;
  for (const line of sale.lines) {
    const it = await tx.item.findFirst({ where: { id: line.itemId, orgId: ctx.orgId } });
    if (!it) continue;
    if (it.tracking === "UNIT") {
      if (it.status === "RESERVED" && it.holdType === "SALE" && it.holdId === saleId) {
        await transitionUnits(tx, ctx, [it.id], ["RESERVED"], "AVAILABLE", {
          holdType: null,
          holdId: null,
          holdUntil: null,
          requireHold: { type: "SALE", id: saleId },
        });
        await itemEvent(tx, ctx, {
          itemId: it.id,
          type: "RELEASED",
          message: `Reserva do orçamento ${sale.code} liberada`,
          fromStatus: "RESERVED",
          toStatus: "AVAILABLE",
          reason,
          refType: "SALE",
          refId: saleId,
        });
      }
    } else {
      await adjustLotQty(tx, ctx, it.id, { reserved: -line.quantity });
      await itemEvent(tx, ctx, { itemId: it.id, type: "RELEASED", message: `Reserva de ${line.quantity} un. liberada (${sale.code})`, reason, refType: "SALE", refId: saleId });
    }
  }
}

async function applySaleHolds(tx: Tx, ctx: Ctx, saleId: string, code: string, lines: LoadedLine[], until: Date | null) {
  for (const l of lines) {
    if (l.item.tracking === "UNIT") {
      await transitionUnits(tx, ctx, [l.itemId], ["AVAILABLE"], "RESERVED", { holdType: "SALE", holdId: saleId, holdUntil: until });
      await itemEvent(tx, ctx, {
        itemId: l.itemId,
        type: "RESERVED",
        message: `Reservado para o orçamento ${code}`,
        fromStatus: "AVAILABLE",
        toStatus: "RESERVED",
        refType: "SALE",
        refId: saleId,
      });
    } else {
      await adjustLotQty(tx, ctx, l.itemId, { reserved: l.quantity });
      await itemEvent(tx, ctx, { itemId: l.itemId, type: "RESERVED", message: `${l.quantity} un. reservadas para ${code}`, refType: "SALE", refId: saleId });
    }
  }
}

/**
 * Cria/edita um orçamento ou fecha uma venda.
 * Orçamento NÃO é venda: não gera receita, não tira item do estoque (só reserva, se pedido).
 * Venda fechada gera receita e custo; recebimento é registrado separadamente (títulos);
 * entrega é outro passo (SOLD → DELIVERED).
 */
export async function saveSale(ctx: Ctx, raw: SaleInput) {
  requirePerm(ctx, "sales.manage");
  const input = saleSchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    if (input.contactId) {
      const c = await tx.contact.findFirst({ where: { id: input.contactId, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Cliente");
      if (!c.isCustomer) await tx.contact.update({ where: { id: c.id }, data: { isCustomer: true } });
    }
    let saleId = input.id ?? null;
    let code: string;
    if (saleId) {
      const existing = await tx.sale.findFirst({ where: { id: saleId, orgId: ctx.orgId } });
      if (!existing) throw new NotFoundError("Venda");
      if (existing.status !== "QUOTE") throw new DomainError("Esta venda já foi fechada ou cancelada; não pode ser editada.");
      await releaseSaleHolds(tx, ctx, saleId, "Orçamento editado");
      await tx.saleLine.deleteMany({ where: { saleId } });
      code = existing.code;
    } else {
      code = await nextCode(tx, ctx.orgId, "sale");
    }
    const lines = await loadLines(tx, ctx, input.lines);
    const subtotal = lines.reduce((a, l) => a + l.quantity * l.unitPriceCents, 0);
    assert(input.discountCents <= subtotal, "O desconto não pode ser maior que o valor dos itens.");
    const total = subtotal - input.discountCents + input.shippingChargedCents;
    const tradeInTotal = input.tradeIns.reduce((a, t) => a + t.agreedValueCents, 0);
    assert(tradeInTotal <= total, "O valor dos itens recebidos na troca não pode passar do total da venda.");

    const data = {
      contactId: input.contactId ?? null,
      channel: input.channel ?? null,
      date: input.date,
      subtotalCents: subtotal,
      discountCents: input.discountCents,
      shippingChargedCents: input.shippingChargedCents,
      shippingCostCents: input.shippingCostCents,
      feeCents: input.feeCents,
      tradeInCents: tradeInTotal,
      totalCents: total,
      warrantyDays: input.warrantyDays ?? null,
      notes: input.notes ?? null,
      quoteValidUntil: input.quoteValidUntil ?? null,
      reserveItems: input.action === "QUOTE" ? input.reserveItems : false,
      opportunityId: input.opportunityId ?? null,
    };
    if (saleId) {
      await tx.sale.update({ where: { id: saleId }, data });
    } else {
      const s = await tx.sale.create({ data: { ...data, orgId: ctx.orgId, code, createdById: ctx.userId, status: "QUOTE" } });
      saleId = s.id;
    }
    for (const l of lines) {
      await tx.saleLine.create({
        data: {
          orgId: ctx.orgId,
          saleId: saleId!,
          itemId: l.itemId,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
        },
      });
    }

    if (input.action === "QUOTE") {
      for (const l of lines) {
        const sellable = l.item.tracking === "LOT" ? l.item.qtyOnHand - l.item.qtyReserved >= l.quantity : l.item.status === "AVAILABLE";
        if (input.reserveItems && !sellable) {
          throw new ConflictError(`${l.item.code} não está disponível para reserva (${STATUS_LABEL[l.item.status]}).`);
        }
      }
      if (input.reserveItems) await applySaleHolds(tx, ctx, saleId!, code, lines, input.quoteValidUntil ?? null);
      await audit(tx, ctx, "sale.quote", `Orçamento ${code} salvo`, { entityType: "Sale", entityId: saleId! });
      return { id: saleId!, code, status: "QUOTE" };
    }

    await confirmSaleTx(tx, ctx, saleId!, lines, input);
    return { id: saleId!, code, status: "CONFIRMED" };
  });
}

async function confirmSaleTx(tx: Tx, ctx: Ctx, saleId: string, lines: LoadedLine[], input: z.infer<typeof saleSchema>) {
  // Trava: só um fechamento por venda, mesmo com cliques simultâneos.
  const lock = await tx.sale.updateMany({
    where: { id: saleId, orgId: ctx.orgId, status: "QUOTE" },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      date: input.date,
      deliveryStatus: input.delivered ? "DELIVERED" : "PENDING",
      deliveredAt: input.delivered ? input.date : null,
      reserveItems: false,
    },
  });
  if (lock.count !== 1) throw new ConflictError("Esta venda já foi fechada ou cancelada.");
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { lines: true } });
  const contact = sale.contactId ? await tx.contact.findUnique({ where: { id: sale.contactId } }) : null;
  const who = contact ? ` — ${contact.name}` : "";
  const to = input.delivered ? "DELIVERED" : "SOLD";

  // 1) Retira os itens do estoque (transição condicional — impede venda dupla).
  for (const l of lines) {
    const fresh = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
    const heldByMe = fresh.holdType === "SALE" && fresh.holdId === saleId;
    if (fresh.tracking === "UNIT") {
      await transitionUnits(tx, ctx, [fresh.id], heldByMe ? ["RESERVED"] : ["AVAILABLE"], to, {
        holdType: null,
        holdId: null,
        holdUntil: null,
        requireHold: heldByMe ? { type: "SALE", id: saleId } : null,
        exitedAt: input.delivered ? input.date : null,
        qtyOnHand: input.delivered ? 0 : 1,
      });
    } else {
      // Lote: a reserva deste orçamento já foi liberada na edição; baixa direta do saldo livre.
      await adjustLotQty(tx, ctx, fresh.id, { onHand: -l.quantity });
    }
    await itemEvent(tx, ctx, {
      itemId: fresh.id,
      type: "SOLD",
      message: `Vendido na venda ${sale.code}${who}${input.delivered ? " (entregue)" : ""}`,
      fromStatus: fresh.status,
      toStatus: fresh.tracking === "UNIT" ? to : undefined,
      qtyDelta: -l.quantity,
      refType: "SALE",
      refId: sale.id,
    });
  }

  // 2) Receita e custo por linha (desconto rateado pelo valor das linhas).
  const bases = sale.lines.map((l) => l.quantity * l.unitPriceCents);
  const disc = allocate(sale.discountCents, bases);
  const saleCat = await systemCategoryId(tx, ctx.orgId, "SALE");
  for (let i = 0; i < sale.lines.length; i++) {
    const line = sale.lines[i];
    const it = lines.find((l) => l.itemId === line.itemId)!.item;
    const cost = it.unitCostCents !== null ? it.unitCostCents * line.quantity : null;
    await tx.saleLine.update({ where: { id: line.id }, data: { costCents: cost, costStatus: it.costStatus } });
    await resultEntry(tx, ctx, {
      date: sale.date,
      kind: "REVENUE",
      amountCents: bases[i] - disc[i],
      description: `Venda ${sale.code}: ${line.description}${line.quantity > 1 ? ` × ${line.quantity}` : ""}`,
      refType: "SALE",
      refId: sale.id,
      itemId: it.id,
      saleId: sale.id,
      contactId: sale.contactId,
      categoryId: saleCat,
      costStatus: it.costStatus,
    });
    await resultEntry(tx, ctx, {
      date: sale.date,
      kind: "COGS",
      amountCents: cost ?? 0,
      description: `Custo de ${line.description}${it.costStatus === "UNKNOWN" ? " (custo desconhecido)" : ""}`,
      refType: "SALE",
      refId: sale.id,
      itemId: it.id,
      saleId: sale.id,
      contactId: sale.contactId,
      costStatus: it.costStatus,
    });
    // Consignado: o custo é o repasse devido ao dono do item.
    if (it.ownership === "CONSIGNED_IN" && cost && cost > 0) {
      await createTitle(tx, ctx, {
        direction: "PAYABLE",
        contactId: it.ownerContactId,
        description: `Repasse de consignação: ${it.code} ${it.title} (venda ${sale.code})`,
        amountCents: cost,
        dueDate: sale.date,
        sourceType: "CONSIGNMENT",
        sourceId: sale.id,
        categoryId: await systemCategoryId(tx, ctx.orgId, "CONSIGNMENT"),
      });
    }
  }
  if (sale.shippingChargedCents > 0) {
    await resultEntry(tx, ctx, {
      date: sale.date,
      kind: "REVENUE",
      amountCents: sale.shippingChargedCents,
      description: `Frete cobrado do cliente — venda ${sale.code}`,
      refType: "SALE",
      refId: sale.id,
      saleId: sale.id,
      contactId: sale.contactId,
      categoryId: saleCat,
    });
  }
  if (sale.shippingCostCents > 0) {
    await resultEntry(tx, ctx, {
      date: sale.date,
      kind: "SALES_EXPENSE",
      amountCents: sale.shippingCostCents,
      description: `Frete pago — venda ${sale.code}`,
      refType: "SALE",
      refId: sale.id,
      saleId: sale.id,
      categoryId: await systemCategoryId(tx, ctx.orgId, "SALE_SHIPPING"),
    });
  }
  if (sale.feeCents > 0) {
    await resultEntry(tx, ctx, {
      date: sale.date,
      kind: "SALES_EXPENSE",
      amountCents: sale.feeCents,
      description: `Taxas (cartão/plataforma) — venda ${sale.code}`,
      refType: "SALE",
      refId: sale.id,
      saleId: sale.id,
      categoryId: await systemCategoryId(tx, ctx.orgId, "SALE_FEE"),
    });
  }

  // 3) Itens recebidos como parte do pagamento (troca na venda).
  if (input.tradeIns.length) {
    const tiTitle = await createTitle(tx, ctx, {
      direction: "RECEIVABLE",
      contactId: sale.contactId,
      description: `Venda ${sale.code} — parte paga com itens (troca)`,
      amountCents: sale.tradeInCents,
      dueDate: sale.date,
      sourceType: "SALE",
      sourceId: sale.id,
      categoryId: saleCat,
    });
    for (const t of input.tradeIns) {
      const product = await ensureProduct(tx, ctx, t.product);
      const it = await insertItem(tx, ctx, {
        product,
        serial: t.serial,
        status: "INSPECTION",
        condition: t.condition,
        unitCostCents: t.agreedValueCents,
        costStatus: "KNOWN",
        costBreakdown: [{ kind: "ACQUISITION", amountCents: t.agreedValueCents, description: `Recebido como parte do pagamento da venda ${sale.code}` }],
        locationId: t.locationId,
        acquisitionType: "TRADE_IN",
        acquiredAt: sale.date,
        sourceSaleId: sale.id,
        notes: t.notes,
        eventMessage: `Recebido na troca da venda ${sale.code}${who}, pelo valor acordado`,
        refType: "SALE",
        refId: sale.id,
      });
      void it;
    }
    await settleTitle(tx, ctx, { titleId: tiTitle.id, amountCents: sale.tradeInCents, kind: "TRADE_IN", date: sale.date, note: "Quitado com itens recebidos" });
  }

  // 4) Taxas e frete pagos pelo vendedor também mexem no caixa.
  if (sale.feeCents > 0) {
    if (input.feeWithheld) {
      // Retida na fonte: o cliente "pagou" essa parte, mas o dinheiro ficou com a plataforma.
      const feeTitle = await createTitle(tx, ctx, {
        direction: "RECEIVABLE",
        contactId: sale.contactId,
        description: `Venda ${sale.code} — taxa retida pela plataforma/cartão`,
        amountCents: Math.min(sale.feeCents, sale.totalCents - sale.tradeInCents),
        dueDate: sale.date,
        sourceType: "SALE",
        sourceId: sale.id,
        categoryId: saleCat,
      });
      await settleTitle(tx, ctx, { titleId: feeTitle.id, amountCents: feeTitle.amountCents, kind: "FEE", date: sale.date, note: "Taxa retida na fonte" });
    } else {
      await applyPaymentPlan(tx, ctx, {
        direction: "PAYABLE",
        totalCents: sale.feeCents,
        sourceType: "SALE",
        sourceId: sale.id,
        description: `Taxas da venda ${sale.code}`,
        categoryId: await systemCategoryId(tx, ctx.orgId, "SALE_FEE"),
        date: sale.date,
        now: [],
        remainder: { installments: 1, firstDueDate: sale.date },
      });
    }
  }
  if (sale.shippingCostCents > 0) {
    await applyPaymentPlan(tx, ctx, {
      direction: "PAYABLE",
      totalCents: sale.shippingCostCents,
      sourceType: "SALE",
      sourceId: sale.id,
      description: `Frete da venda ${sale.code}`,
      categoryId: await systemCategoryId(tx, ctx.orgId, "SALE_SHIPPING"),
      date: sale.date,
      now: input.shippingAccountId ? [{ amountCents: sale.shippingCostCents, accountId: input.shippingAccountId, method: "PIX", date: sale.date }] : [],
      remainder: { installments: 1, firstDueDate: sale.date },
    });
  }

  // 5) Recebimento: o que entrou agora + parcelas a receber.
  const withheld = input.feeWithheld ? Math.min(sale.feeCents, sale.totalCents - sale.tradeInCents) : 0;
  const toReceive = sale.totalCents - sale.tradeInCents - withheld;
  if (toReceive > 0) {
    await applyPaymentPlan(tx, ctx, {
      direction: "RECEIVABLE",
      totalCents: toReceive,
      contactId: sale.contactId,
      sourceType: "SALE",
      sourceId: sale.id,
      description: `Venda ${sale.code}${who}`,
      categoryId: saleCat,
      date: sale.date,
      now: (input.payment?.now ?? []).map((p) => ({ ...p, date: sale.date })),
      remainder: input.payment?.remainder ?? { installments: 1, firstDueDate: sale.date },
    });
  }

  if (sale.opportunityId) {
    await tx.opportunity.updateMany({
      where: { id: sale.opportunityId, orgId: ctx.orgId },
      data: { stage: "WON", closedAt: new Date(), linkType: "SALE", linkId: sale.id },
    });
  }
  await audit(tx, ctx, "sale.confirm", `Venda ${sale.code} fechada${who}`, {
    entityType: "Sale",
    entityId: sale.id,
    data: { totalCents: sale.totalCents },
  });
}

/** Fecha um orçamento existente como venda. */
export async function confirmQuote(
  ctx: Ctx,
  input: { saleId: string; date: Date; delivered: boolean; payment?: SaleInput["payment"]; idempotencyKey?: string },
) {
  requirePerm(ctx, "sales.manage");
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, orgId: ctx.orgId }, include: { lines: true } });
    if (!sale) throw new NotFoundError("Orçamento");
    if (sale.status !== "QUOTE") throw new ConflictError("Este orçamento já foi fechado ou cancelado.");
    const parsed = saleSchema.parse({
      id: sale.id,
      action: "CONFIRM",
      contactId: sale.contactId,
      channel: sale.channel,
      date: input.date,
      lines: sale.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPriceCents: l.unitPriceCents, description: l.description })),
      discountCents: sale.discountCents,
      shippingChargedCents: sale.shippingChargedCents,
      shippingCostCents: sale.shippingCostCents,
      feeCents: sale.feeCents,
      warrantyDays: sale.warrantyDays,
      notes: sale.notes,
      delivered: input.delivered,
      payment: input.payment,
      opportunityId: sale.opportunityId,
    });
    // Lotes reservados por este orçamento: libera a reserva antes de baixar o saldo.
    if (sale.reserveItems) {
      for (const l of sale.lines) {
        const it = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
        if (it.tracking === "LOT") await adjustLotQty(tx, ctx, it.id, { reserved: -l.quantity });
      }
    }
    const lines = await loadLines(tx, ctx, parsed.lines);
    await confirmSaleTx(tx, ctx, sale.id, lines, parsed);
    return { id: sale.id, code: sale.code };
  });
}

export async function markDelivered(ctx: Ctx, input: { saleId: string; date?: Date }) {
  requirePerm(ctx, "sales.manage");
  return withTx(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, orgId: ctx.orgId }, include: { lines: true } });
    if (!sale) throw new NotFoundError("Venda");
    if (sale.status !== "CONFIRMED") throw new DomainError("Só vendas fechadas podem ser entregues.");
    if (sale.deliveryStatus === "DELIVERED") throw new ConflictError("Esta venda já consta como entregue.");
    const date = input.date ?? new Date();
    const units = [];
    for (const l of sale.lines) {
      const it = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
      if (it.tracking === "UNIT" && it.status === "SOLD") units.push(it.id);
    }
    await transitionUnits(tx, ctx, units, ["SOLD"], "DELIVERED", { exitedAt: date, qtyOnHand: 0 });
    for (const id of units) {
      await tx.item.updateMany({ where: { orgId: ctx.orgId, parentItemId: id }, data: { qtyOnHand: 0, exitedAt: date } });
      await itemEvent(tx, ctx, { itemId: id, type: "DELIVERED", message: `Entregue ao cliente (venda ${sale.code})`, fromStatus: "SOLD", toStatus: "DELIVERED", refType: "SALE", refId: sale.id });
    }
    await tx.sale.update({ where: { id: sale.id }, data: { deliveryStatus: "DELIVERED", deliveredAt: date } });
    await audit(tx, ctx, "sale.deliver", `Venda ${sale.code} entregue`, { entityType: "Sale", entityId: sale.id });
    return { ok: true };
  });
}

/**
 * Cancela orçamento ou venda fechada.
 * Venda fechada: itens voltam ao estoque com o custo original, receita/custo são
 * estornados por lançamentos opostos, valores já recebidos são devolvidos (saída de
 * caixa registrada) e parcelas em aberto são canceladas.
 */
export async function cancelSale(ctx: Ctx, input: { saleId: string; reason: string; refundAccountId?: string | null }) {
  requirePerm(ctx, "sales.manage");
  assert(input.reason?.trim().length >= 3, "Informe o motivo do cancelamento.");
  return withTx(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, orgId: ctx.orgId }, include: { lines: true, returns: true } });
    if (!sale) throw new NotFoundError("Venda");
    if (sale.status === "CANCELLED") throw new ConflictError("Esta venda já está cancelada.");
    const lock = await tx.sale.updateMany({
      where: { id: sale.id, orgId: ctx.orgId, status: sale.status },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
    });
    if (lock.count !== 1) throw new ConflictError("A venda mudou enquanto você operava. Recarregue.");

    if (sale.status === "QUOTE") {
      await releaseSaleHolds(tx, ctx, sale.id, `Orçamento cancelado: ${input.reason}`);
      await audit(tx, ctx, "sale.quote.cancel", `Orçamento ${sale.code} cancelado`, { entityType: "Sale", entityId: sale.id });
      return { ok: true };
    }
    if (sale.returns.length) {
      throw new DomainError("Esta venda já tem devoluções registradas. Registre a devolução dos itens restantes em vez de cancelar.");
    }
    const tradeInItems = await tx.item.findMany({ where: { orgId: ctx.orgId, sourceSaleId: sale.id } });
    const usedTradeIns = tradeInItems.filter((i) => !["AVAILABLE", "INSPECTION", "DEFECTIVE"].includes(i.status));
    if (usedTradeIns.length) {
      throw new DomainError(
        `Os itens recebidos na troca já foram usados (${usedTradeIns.map((i) => i.code).join(", ")}). Registre uma devolução em vez de cancelar.`,
      );
    }
    const date = new Date();
    for (const line of sale.lines) {
      const it = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
      if (it.tracking === "UNIT") {
        await transitionUnits(tx, ctx, [it.id], ["SOLD", "DELIVERED"], "AVAILABLE", { exitedAt: null, qtyOnHand: 1 });
        await tx.item.updateMany({ where: { orgId: ctx.orgId, parentItemId: it.id }, data: { qtyOnHand: 1, exitedAt: null } });
      } else {
        await adjustLotQty(tx, ctx, it.id, { onHand: line.quantity });
      }
      await itemEvent(tx, ctx, {
        itemId: it.id,
        type: "SALE_CANCELLED",
        message: `Venda ${sale.code} cancelada — item voltou ao estoque`,
        fromStatus: it.status,
        toStatus: it.tracking === "UNIT" ? "AVAILABLE" : undefined,
        qtyDelta: line.quantity,
        reason: input.reason,
        refType: "SALE",
        refId: sale.id,
      });
    }
    for (const ti of tradeInItems) {
      await tx.item.update({ where: { id: ti.id }, data: { status: "VOID", qtyOnHand: 0, exitedAt: date, version: { increment: 1 } } });
      await itemEvent(tx, ctx, { itemId: ti.id, type: "VOIDED", message: `Venda ${sale.code} cancelada — item da troca devolvido ao cliente`, fromStatus: ti.status, toStatus: "VOID", refType: "SALE", refId: sale.id });
    }
    // Receita e custo são estornados; taxas e frete já incorridos continuam como despesa.
    await reverseResultEntries(tx, ctx, { refType: "SALE", refId: sale.id }, date, `Venda ${sale.code} cancelada`, ["REVENUE", "COGS"]);
    const fin = await unwindSourceFinance(tx, ctx, { sourceType: "SALE", sourceId: sale.id }, `Venda ${sale.code} cancelada`, {
      refundAccountId: input.refundAccountId,
      direction: "RECEIVABLE",
    });
    await unwindSourceFinance(tx, ctx, { sourceType: "CONSIGNMENT", sourceId: sale.id }, `Venda ${sale.code} cancelada`);
    await audit(tx, ctx, "sale.cancel", `Venda ${sale.code} cancelada`, {
      entityType: "Sale",
      entityId: sale.id,
      data: { reason: input.reason, refundedCents: fin.moneyReversedCents },
    });
    return { ok: true, refundedCents: fin.moneyReversedCents };
  });
}

export const returnSchema = z.object({
  saleId: z.string(),
  lines: z.array(z.object({ saleLineId: z.string(), quantity: z.number().int().positive() })).min(1),
  reason: z.string().trim().min(3).max(500),
  refundCents: z.number().int().min(0),
  refundMode: z.enum(["NOW", "PENDING"]).default("NOW"),
  accountId: z.string().optional().nullable(),
  method: z.enum(PAYMENT_METHODS).optional().nullable(),
  itemStatus: z.enum(["RETURNED", "AVAILABLE", "DEFECTIVE"]).default("RETURNED"),
  date: z.coerce.date().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * Devolução (parcial ou total) de venda fechada. O item volta ao estoque pelo custo
 * original; a receita é estornada pelo valor devolvido ao cliente; o reembolso abate
 * primeiro o saldo em aberto da venda e o restante sai do caixa (ou fica a pagar).
 */
export async function returnSale(ctx: Ctx, raw: z.input<typeof returnSchema>) {
  requirePerm(ctx, "sales.manage");
  const input = returnSchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, orgId: ctx.orgId }, include: { lines: true } });
    if (!sale) throw new NotFoundError("Venda");
    if (sale.status !== "CONFIRMED") throw new DomainError("Só vendas fechadas aceitam devolução.");
    const date = input.date ?? new Date();
    const bases = sale.lines.map((l) => l.quantity * l.unitPriceCents);
    const disc = allocate(sale.discountCents, bases);
    let returnedRevenue = 0;
    const affected: { line: (typeof sale.lines)[number]; qty: number; revenue: number; cost: number | null; costStatus: string | null }[] = [];
    for (const r of input.lines) {
      const idx = sale.lines.findIndex((l) => l.id === r.saleLineId);
      assert(idx >= 0, "Linha de venda inválida.");
      const line = sale.lines[idx];
      const n = await tx.saleLine.updateMany({
        where: { id: line.id, orgId: ctx.orgId, returnedQty: { lte: line.quantity - r.quantity } },
        data: { returnedQty: { increment: r.quantity } },
      });
      if (n.count !== 1) throw new ConflictError(`A quantidade devolvida de "${line.description}" ultrapassa o que foi vendido.`);
      const revenue = Math.round(((bases[idx] - disc[idx]) * r.quantity) / line.quantity);
      const cost = line.costCents !== null ? Math.round((line.costCents * r.quantity) / line.quantity) : null;
      returnedRevenue += revenue;
      affected.push({ line, qty: r.quantity, revenue, cost, costStatus: line.costStatus });
    }
    assert(input.refundCents <= returnedRevenue + sale.shippingChargedCents, "O reembolso não pode passar do valor pago pelos itens devolvidos.");

    const ret = await tx.saleReturn.create({
      data: {
        orgId: ctx.orgId,
        saleId: sale.id,
        date,
        reason: input.reason,
        refundCents: input.refundCents,
        itemStatus: input.itemStatus,
        lines: input.lines,
        createdById: ctx.userId,
      },
    });
    // Estorno de receita pelo valor devolvido (rateado entre as linhas) e do custo integral.
    const revenueParts = allocate(Math.min(input.refundCents, returnedRevenue), affected.map((a) => a.revenue));
    for (let i = 0; i < affected.length; i++) {
      const a = affected[i];
      const it = await tx.item.findUniqueOrThrow({ where: { id: a.line.itemId } });
      if (it.tracking === "UNIT") {
        await transitionUnits(tx, ctx, [it.id], ["SOLD", "DELIVERED"], input.itemStatus, { exitedAt: null, qtyOnHand: 1, holdType: null, holdId: null });
        await tx.item.updateMany({ where: { orgId: ctx.orgId, parentItemId: it.id }, data: { qtyOnHand: 1, exitedAt: null } });
      } else {
        await adjustLotQty(tx, ctx, it.id, { onHand: a.qty });
      }
      await itemEvent(tx, ctx, {
        itemId: it.id,
        type: "RETURNED",
        message: `Devolvido pelo cliente (venda ${sale.code})`,
        fromStatus: it.status,
        toStatus: it.tracking === "UNIT" ? input.itemStatus : undefined,
        qtyDelta: a.qty,
        reason: input.reason,
        refType: "SALE_RETURN",
        refId: ret.id,
      });
      await resultEntry(tx, ctx, {
        date,
        kind: "REVENUE",
        amountCents: -revenueParts[i],
        description: `Devolução ${sale.code}: ${a.line.description}`,
        refType: "SALE_RETURN",
        refId: ret.id,
        itemId: it.id,
        saleId: sale.id,
        contactId: sale.contactId,
        costStatus: (a.costStatus as never) ?? null,
      });
      await resultEntry(tx, ctx, {
        date,
        kind: "COGS",
        amountCents: -(a.cost ?? 0),
        description: `Custo estornado (devolução ${sale.code}): ${a.line.description}`,
        refType: "SALE_RETURN",
        refId: ret.id,
        itemId: it.id,
        saleId: sale.id,
        contactId: sale.contactId,
        costStatus: (a.costStatus as never) ?? null,
      });
    }
    if (input.refundCents > returnedRevenue) {
      // Parte do frete cobrado também foi devolvida.
      await resultEntry(tx, ctx, {
        date,
        kind: "REVENUE",
        amountCents: -(input.refundCents - returnedRevenue),
        description: `Devolução ${sale.code}: frete reembolsado`,
        refType: "SALE_RETURN",
        refId: ret.id,
        saleId: sale.id,
        contactId: sale.contactId,
      });
    }

    // Reembolso: primeiro abate o que o cliente ainda devia; depois devolve dinheiro.
    let toRefund = input.refundCents;
    const openTitles = await tx.title.findMany({
      where: { orgId: ctx.orgId, sourceType: "SALE", sourceId: sale.id, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { dueDate: "desc" },
    });
    for (const t of openTitles) {
      if (toRefund <= 0) break;
      const amt = Math.min(toRefund, t.amountCents - t.settledCents);
      await settleTitle(tx, ctx, { titleId: t.id, amountCents: amt, kind: "CANCELLATION", date, note: `Abatido na devolução: ${input.reason}` });
      toRefund -= amt;
    }
    if (toRefund > 0) {
      if (input.refundMode === "NOW") assert(input.accountId, "Escolha a conta de onde sai o reembolso.");
      await applyPaymentPlan(tx, ctx, {
        direction: "PAYABLE",
        totalCents: toRefund,
        contactId: sale.contactId,
        sourceType: "SALE_REFUND",
        sourceId: ret.id,
        description: `Reembolso da devolução — venda ${sale.code}`,
        date,
        now: input.refundMode === "NOW" ? [{ amountCents: toRefund, accountId: input.accountId!, method: input.method ?? "PIX", date }] : [],
        remainder: { installments: 1, firstDueDate: date },
      });
    }
    await audit(tx, ctx, "sale.return", `Devolução na venda ${sale.code}`, {
      entityType: "Sale",
      entityId: sale.id,
      data: { refundCents: input.refundCents, reason: input.reason },
    });
    return { id: ret.id };
  });
}

export async function shareSale(ctx: Ctx, saleId: string, enable: boolean) {
  requirePerm(ctx, "sales.manage");
  return withTx(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, orgId: ctx.orgId } });
    if (!sale) throw new NotFoundError("Venda");
    const token = enable ? sale.shareToken ?? randomBytes(18).toString("base64url") : null;
    await tx.sale.update({ where: { id: sale.id }, data: { shareToken: token } });
    await audit(tx, ctx, enable ? "sale.share" : "sale.unshare", `${enable ? "Link público criado" : "Link público desativado"} para ${sale.code}`, {
      entityType: "Sale",
      entityId: sale.id,
    });
    return { token };
  });
}

export async function updateAfterSales(ctx: Ctx, input: { saleId: string; afterSalesNotes: string }) {
  requirePerm(ctx, "sales.manage");
  return withTx(async (tx) => {
    const n = await tx.sale.updateMany({ where: { id: input.saleId, orgId: ctx.orgId }, data: { afterSalesNotes: input.afterSalesNotes.slice(0, 4000) } });
    if (n.count !== 1) throw new NotFoundError("Venda");
    return { ok: true };
  });
}

/** Libera reservas de orçamentos vencidos. Executado ao abrir o painel e por rotina. */
export async function expireStaleReservations(ctx: Ctx) {
  return withTx(async (tx) => {
    const stale = await tx.sale.findMany({
      where: { orgId: ctx.orgId, status: "QUOTE", reserveItems: true, quoteValidUntil: { lt: new Date() } },
      select: { id: true, code: true },
    });
    for (const s of stale) {
      await releaseSaleHolds(tx, ctx, s.id, "Validade do orçamento expirou");
      await tx.sale.update({ where: { id: s.id }, data: { reserveItems: false } });
    }
    return { released: stale.length };
  });
}
