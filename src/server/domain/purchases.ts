import { z } from "zod";
import type { Tx } from "../db";
import { prisma } from "../db";
import { requirePerm, withIdempotency, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, ConflictError, assert } from "../errors";
import { audit, itemEvent, nextCode, transitionUnits } from "./shared";
import { ensureProduct, insertItem, COST_KIND_LABEL } from "./items";
import { applyPaymentPlan, unwindSourceFinance, PAYMENT_METHODS } from "./finance";
import { systemCategoryId } from "./org";
import { allocate, splitEven } from "@/lib/money";

const lineSchema = z.object({
  product: z.object({
    productId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    brand: z.string().trim().max(60).optional().nullable(),
    model: z.string().trim().max(120).optional().nullable(),
    name: z.string().trim().max(160).optional().nullable(),
    specs: z.record(z.string(), z.unknown()).optional(),
    tracking: z.enum(["UNIT", "LOT"]).optional(),
  }),
  description: z.string().trim().max(200).optional().nullable(),
  quantity: z.number().int().min(1).max(10000),
  unitPriceCents: z.number().int().min(0),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).default("GOOD"),
  locationId: z.string().optional().nullable(),
  serials: z.array(z.string().trim().max(120)).max(10000).optional(),
  expectedPriceCents: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  defects: z.string().trim().max(2000).optional().nullable(),
  warrantyUntil: z.coerce.date().optional().nullable(),
  completeness: z.record(z.string(), z.boolean()).optional(),
  initialStatus: z.enum(["AVAILABLE", "INSPECTION"]).optional(),
});

const paymentSchema = z.object({
  now: z
    .array(
      z.object({
        amountCents: z.number().int().positive(),
        accountId: z.string().min(1),
        method: z.enum(PAYMENT_METHODS),
      }),
    )
    .default([]),
  remainder: z
    .object({
      installments: z.number().int().min(1).max(48).default(1),
      firstDueDate: z.coerce.date(),
      intervalDays: z.number().int().min(1).max(365).optional(),
    })
    .optional()
    .nullable(),
});

export const purchaseSchema = z.object({
  id: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  date: z.coerce.date(),
  channel: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Adicione ao menos um item à compra."),
  discountCents: z.number().int().min(0).default(0),
  extras: z
    .array(
      z.object({
        kind: z.enum(["FREIGHT", "FEE", "COMMISSION", "REPAIR", "TESTING", "OTHER"]),
        description: z.string().trim().min(1).max(200),
        amountCents: z.number().int().positive(),
      }),
    )
    .default([]),
  confirm: z.boolean().default(false),
  payment: paymentSchema.optional(),
  idempotencyKey: z.string().optional(),
});

export type PurchaseInput = z.input<typeof purchaseSchema>;

function totals(input: z.infer<typeof purchaseSchema>) {
  const subtotal = input.lines.reduce((a, l) => a + l.quantity * l.unitPriceCents, 0);
  const extras = input.extras.reduce((a, e) => a + e.amountCents, 0);
  assert(input.discountCents <= subtotal, "O desconto não pode ser maior que o valor dos itens.");
  return { subtotal, extras, total: subtotal - input.discountCents + extras };
}

/** Salva (rascunho) e opcionalmente confirma uma compra. */
export async function savePurchase(ctx: Ctx, raw: PurchaseInput) {
  requirePerm(ctx, "purchases.manage");
  const input = purchaseSchema.parse(raw);
  const t = totals(input);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    if (input.contactId) {
      const c = await tx.contact.findFirst({ where: { id: input.contactId, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Fornecedor");
      if (!c.isSupplier) await tx.contact.update({ where: { id: c.id }, data: { isSupplier: true } });
    }
    let purchaseId = input.id ?? null;
    let code: string;
    if (purchaseId) {
      const existing = await tx.purchase.findFirst({ where: { id: purchaseId, orgId: ctx.orgId } });
      if (!existing) throw new NotFoundError("Compra");
      if (existing.status !== "DRAFT") throw new DomainError("Só é possível editar compras em rascunho.");
      await tx.purchaseLine.deleteMany({ where: { purchaseId } });
      await tx.purchaseExtra.deleteMany({ where: { purchaseId } });
      code = existing.code;
      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          contactId: input.contactId ?? null,
          date: input.date,
          channel: input.channel ?? null,
          notes: input.notes ?? null,
          subtotalCents: t.subtotal,
          discountCents: input.discountCents,
          extrasCents: t.extras,
          totalCents: t.total,
        },
      });
    } else {
      code = await nextCode(tx, ctx.orgId, "purchase");
      const p = await tx.purchase.create({
        data: {
          orgId: ctx.orgId,
          code,
          contactId: input.contactId ?? null,
          date: input.date,
          channel: input.channel ?? null,
          notes: input.notes ?? null,
          subtotalCents: t.subtotal,
          discountCents: input.discountCents,
          extrasCents: t.extras,
          totalCents: t.total,
          createdById: ctx.userId,
        },
      });
      purchaseId = p.id;
    }
    for (const l of input.lines) {
      const product = await ensureProduct(tx, ctx, l.product);
      if (product.tracking === "UNIT" && l.serials?.length) {
        assert(l.serials.length <= l.quantity, `Há mais números de série que unidades em "${product.name}".`);
      }
      if (l.locationId) {
        const loc = await tx.location.findFirst({ where: { id: l.locationId, orgId: ctx.orgId } });
        if (!loc) throw new NotFoundError("Local");
      }
      await tx.purchaseLine.create({
        data: {
          orgId: ctx.orgId,
          purchaseId: purchaseId!,
          productId: product.id,
          description: l.description || product.name,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          tracking: product.tracking,
          condition: l.condition,
          locationId: l.locationId ?? null,
          serials: (l.serials ?? []).filter(Boolean),
          expectedPriceCents: l.expectedPriceCents ?? null,
          notes: JSON.stringify({
            notes: l.notes ?? null,
            defects: l.defects ?? null,
            warrantyUntil: l.warrantyUntil ?? null,
            completeness: l.completeness ?? null,
            initialStatus: l.initialStatus ?? "AVAILABLE",
          }),
        },
      });
    }
    for (const e of input.extras) {
      await tx.purchaseExtra.create({ data: { orgId: ctx.orgId, purchaseId: purchaseId!, ...e } });
    }
    let created: { id: string; code: string }[] = [];
    if (input.confirm) {
      created = await confirmPurchaseTx(tx, ctx, purchaseId!, input.payment ?? { now: [], remainder: null });
    } else {
      await audit(tx, ctx, "purchase.save", `Compra ${code} salva como rascunho`, { entityType: "Purchase", entityId: purchaseId! });
    }
    return { id: purchaseId!, code, items: created };
  });
}

export async function confirmPurchase(ctx: Ctx, input: { id: string; payment: z.input<typeof paymentSchema>; idempotencyKey?: string }) {
  requirePerm(ctx, "purchases.manage");
  const payment = paymentSchema.parse(input.payment);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const items = await confirmPurchaseTx(tx, ctx, input.id, payment);
    return { items };
  });
}

/**
 * Confirma a compra: cria as unidades/lotes com custo rateado e registra o pagamento.
 * Regra de rateio: desconto e custos extras são distribuídos entre as linhas na
 * proporção do valor (quantidade × preço) de cada linha, e dentro da linha igualmente
 * entre as unidades — com centavos exatos (a soma dos custos = total da compra).
 */
async function confirmPurchaseTx(tx: Tx, ctx: Ctx, purchaseId: string, payment: z.infer<typeof paymentSchema>) {
  // Trava a compra para impedir dupla confirmação simultânea.
  const locked = await tx.purchase.updateMany({
    where: { id: purchaseId, orgId: ctx.orgId, status: "DRAFT" },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
  if (locked.count !== 1) {
    const p = await tx.purchase.findFirst({ where: { id: purchaseId, orgId: ctx.orgId } });
    if (!p) throw new NotFoundError("Compra");
    throw new ConflictError("Esta compra já foi confirmada ou cancelada.");
  }
  const purchase = await tx.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { lines: true, extras: true },
  });
  const contact = purchase.contactId ? await tx.contact.findUnique({ where: { id: purchase.contactId } }) : null;
  const bases = purchase.lines.map((l) => l.quantity * l.unitPriceCents);
  const discountByLine = allocate(-purchase.discountCents, bases).map((x) => -x);
  const extrasByLine = purchase.extras.map((e) => ({ extra: e, parts: allocate(e.amountCents, bases) }));

  const created: { id: string; code: string }[] = [];
  for (let i = 0; i < purchase.lines.length; i++) {
    const line = purchase.lines[i];
    const meta = safeJson(line.notes);
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const lineAcq = bases[i] - discountByLine[i];
    const lineTotal = lineAcq + extrasByLine.reduce((a, x) => a + x.parts[i], 0);
    await tx.purchaseLine.update({ where: { id: line.id }, data: { allocatedCents: lineTotal } });
    const origin = `Comprado na compra ${purchase.code}${contact ? ` de ${contact.name}` : ""}`;
    if (line.tracking === "LOT") {
      const breakdown = [
        { kind: "ACQUISITION", amountCents: lineAcq, description: `Compra ${purchase.code}: ${line.quantity} × ${(line.unitPriceCents / 100).toFixed(2)}${discountByLine[i] ? " (com desconto rateado)" : ""}` },
        ...extrasByLine.map((x) => ({ kind: x.extra.kind, amountCents: x.parts[i], description: `${x.extra.description} (rateado)` })),
      ];
      const it = await insertItem(tx, ctx, {
        product,
        title: line.description,
        status: meta.initialStatus ?? "AVAILABLE",
        condition: line.condition,
        quantity: line.quantity,
        unitCostCents: Math.round(lineTotal / line.quantity),
        costStatus: "KNOWN",
        costBreakdown: breakdown,
        expectedPriceCents: line.expectedPriceCents,
        locationId: line.locationId,
        acquisitionType: "PURCHASE",
        acquiredAt: purchase.date,
        sourcePurchaseLineId: line.id,
        notes: meta.notes,
        defects: meta.defects,
        warrantyUntil: meta.warrantyUntil ? new Date(meta.warrantyUntil) : null,
        completeness: meta.completeness ?? undefined,
        eventMessage: origin,
        refType: "PURCHASE",
        refId: purchase.id,
      });
      created.push({ id: it.id, code: it.code });
    } else {
      const acqUnits = splitEven(lineAcq, line.quantity);
      const extraUnits = extrasByLine.map((x) => ({ extra: x.extra, units: splitEven(x.parts[i], line.quantity) }));
      for (let u = 0; u < line.quantity; u++) {
        const breakdown = [
          { kind: "ACQUISITION", amountCents: acqUnits[u], description: `Preço pago na compra ${purchase.code}${discountByLine[i] ? " (com desconto rateado)" : ""}` },
          ...extraUnits.map((x) => ({
            kind: x.extra.kind,
            amountCents: x.units[u],
            description: `${COST_KIND_LABEL[x.extra.kind] ?? x.extra.kind}: ${x.extra.description} (rateado)`,
          })),
        ];
        const unitCost = breakdown.reduce((a, b) => a + b.amountCents, 0);
        const it = await insertItem(tx, ctx, {
          product,
          title: line.description,
          serial: line.serials[u] ?? null,
          status: meta.initialStatus ?? "AVAILABLE",
          condition: line.condition,
          unitCostCents: unitCost,
          costStatus: "KNOWN",
          costBreakdown: breakdown,
          expectedPriceCents: line.expectedPriceCents,
          locationId: line.locationId,
          acquisitionType: "PURCHASE",
          acquiredAt: purchase.date,
          sourcePurchaseLineId: line.id,
          notes: meta.notes,
          defects: meta.defects,
          warrantyUntil: meta.warrantyUntil ? new Date(meta.warrantyUntil) : null,
          completeness: meta.completeness ?? undefined,
          eventMessage: origin,
          refType: "PURCHASE",
          refId: purchase.id,
        });
        created.push({ id: it.id, code: it.code });
      }
    }
  }
  if (purchase.totalCents > 0) {
    await applyPaymentPlan(tx, ctx, {
      direction: "PAYABLE",
      totalCents: purchase.totalCents,
      contactId: purchase.contactId,
      sourceType: "PURCHASE",
      sourceId: purchase.id,
      description: `Compra ${purchase.code}${contact ? ` — ${contact.name}` : ""}`,
      categoryId: await systemCategoryId(tx, ctx.orgId, "PURCHASE"),
      date: purchase.date,
      now: payment.now.map((p) => ({ ...p, date: purchase.date })),
      remainder: payment.remainder ?? { installments: 1, firstDueDate: purchase.date },
    });
  }
  await audit(tx, ctx, "purchase.confirm", `Compra ${purchase.code} confirmada: ${created.length} item(ns)`, {
    entityType: "Purchase",
    entityId: purchase.id,
    data: { totalCents: purchase.totalCents },
  });
  return created;
}

function safeJson(s: string | null): {
  notes?: string | null;
  defects?: string | null;
  warrantyUntil?: string | null;
  completeness?: Record<string, boolean> | null;
  initialStatus?: "AVAILABLE" | "INSPECTION";
} {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return { notes: s };
  }
}

/**
 * Cancela uma compra. Confirmada: só se nenhum item já foi usado (vendido, montado,
 * trocado, reservado). Itens viram "Anulado", o pagamento feito é estornado (o fornecedor
 * devolveu) e as parcelas em aberto são canceladas. Tudo fica no histórico.
 */
export async function cancelPurchase(ctx: Ctx, input: { id: string; reason: string; refundAccountId?: string | null }) {
  requirePerm(ctx, "purchases.manage");
  assert(input.reason?.trim().length >= 3, "Informe o motivo do cancelamento.");
  return withTx(async (tx) => {
    const p = await tx.purchase.findFirst({ where: { id: input.id, orgId: ctx.orgId }, include: { lines: true } });
    if (!p) throw new NotFoundError("Compra");
    if (p.status === "CANCELLED") throw new ConflictError("Esta compra já está cancelada.");
    if (p.status === "CONFIRMED") {
      const items = await tx.item.findMany({ where: { orgId: ctx.orgId, sourcePurchaseLineId: { in: p.lines.map((l) => l.id) } } });
      const used = items.filter(
        (i) => !["AVAILABLE", "INSPECTION", "DEFECTIVE"].includes(i.status) || (i.tracking === "LOT" && (i.qtyOnHand !== i.qtyInitial || i.qtyReserved > 0)),
      );
      if (used.length) {
        throw new DomainError(
          `Não é possível cancelar: ${used.map((u) => u.code).join(", ")} já foi usado em outra operação. Registre uma devolução ou baixa desses itens.`,
        );
      }
      const units = items.filter((i) => i.tracking === "UNIT");
      await transitionUnits(tx, ctx, units.map((i) => i.id), ["AVAILABLE", "INSPECTION", "DEFECTIVE"], "VOID", { exitedAt: new Date(), qtyOnHand: 0 });
      for (const lot of items.filter((i) => i.tracking === "LOT")) {
        await tx.item.update({ where: { id: lot.id }, data: { status: "VOID", qtyOnHand: 0, exitedAt: new Date(), version: { increment: 1 } } });
      }
      for (const it of items) {
        await itemEvent(tx, ctx, {
          itemId: it.id,
          type: "VOIDED",
          message: `Compra ${p.code} cancelada`,
          fromStatus: it.status,
          toStatus: "VOID",
          reason: input.reason,
          refType: "PURCHASE",
          refId: p.id,
        });
      }
      await unwindSourceFinance(tx, ctx, { sourceType: "PURCHASE", sourceId: p.id }, `Compra ${p.code} cancelada`, {
        refundAccountId: input.refundAccountId,
      });
    }
    await tx.purchase.update({
      where: { id: p.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
    });
    await audit(tx, ctx, "purchase.cancel", `Compra ${p.code} cancelada`, { entityType: "Purchase", entityId: p.id, data: { reason: input.reason } });
    return { ok: true };
  });
}

export async function getPurchase(ctx: Ctx, id: string) {
  requirePerm(ctx, "purchases.manage");
  return prisma.purchase.findFirst({ where: { id, orgId: ctx.orgId }, include: { lines: true, extras: true } });
}
