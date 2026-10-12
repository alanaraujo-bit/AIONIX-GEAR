import { z } from "zod";
import type { Tx } from "../db";
import { prisma } from "../db";
import { requirePerm, hasPerm, withIdempotency, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, ConflictError, assert } from "../errors";
import {
  audit,
  itemEvent,
  nextCode,
  resultEntry,
  transitionUnits,
  adjustLotQty,
  combineCostStatus,
  STATUS_LABEL,
} from "./shared";
import { ensureProduct, insertItem } from "./items";
import { applyPaymentPlan, unwindSourceFinance, PAYMENT_METHODS } from "./finance";
import { systemCategoryId } from "./org";
import { checkCompatibility } from "./compat";
import { planDisassembly } from "@/lib/disassembly-plan";
import type { ItemStatus } from "@/generated/prisma/client";

const OPEN_STATUSES = ["PLANNING", "ASSEMBLING", "TESTING"];

export const BUILD_STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planejamento",
  ASSEMBLING: "Em montagem",
  TESTING: "Em testes",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const buildSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  purpose: z.enum(["SALE", "CUSTOMER_ORDER"]).default("SALE"),
  contactId: z.string().optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  targetPriceCents: z.number().int().min(0).optional().nullable(),
  warrantyDays: z.number().int().min(0).max(3650).optional().nullable(),
  ownLaborCents: z.number().int().min(0).default(0),
  notes: z.string().trim().max(4000).optional().nullable(),
  testNotes: z.string().trim().max(4000).optional().nullable(),
  benchmarks: z.string().trim().max(4000).optional().nullable(),
});

export async function saveBuild(ctx: Ctx, raw: z.input<typeof buildSchema>) {
  requirePerm(ctx, "builds.manage");
  const input = buildSchema.parse(raw);
  if (input.purpose === "CUSTOMER_ORDER") assert(input.contactId, "Informe o cliente da encomenda.");
  return withTx(async (tx) => {
    if (input.contactId) {
      const c = await tx.contact.findFirst({ where: { id: input.contactId, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Cliente");
    }
    const data = {
      name: input.name,
      purpose: input.purpose,
      contactId: input.contactId ?? null,
      description: input.description ?? null,
      targetPriceCents: input.targetPriceCents ?? null,
      warrantyDays: input.warrantyDays ?? null,
      ownLaborCents: input.ownLaborCents,
      notes: input.notes ?? null,
      testNotes: input.testNotes ?? null,
      benchmarks: input.benchmarks ?? null,
    };
    if (input.id) {
      const b = await tx.build.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
      if (!b) throw new NotFoundError("Montagem");
      if (!OPEN_STATUSES.includes(b.status)) {
        // Após concluída, só textos de teste/observações podem mudar.
        await tx.build.update({ where: { id: b.id }, data: { testNotes: data.testNotes, benchmarks: data.benchmarks, notes: data.notes } });
      } else {
        await tx.build.update({ where: { id: b.id }, data });
      }
      await audit(tx, ctx, "build.update", `Montagem ${b.code} atualizada`, { entityType: "Build", entityId: b.id });
      return { id: b.id, code: b.code };
    }
    const code = await nextCode(tx, ctx.orgId, "build");
    const b = await tx.build.create({ data: { ...data, orgId: ctx.orgId, code, createdById: ctx.userId } });
    await audit(tx, ctx, "build.create", `Montagem ${code} criada: ${input.name}`, { entityType: "Build", entityId: b.id });
    return { id: b.id, code };
  });
}

async function openBuild(tx: Tx, ctx: Ctx, buildId: string) {
  const b = await tx.build.findFirst({ where: { id: buildId, orgId: ctx.orgId } });
  if (!b) throw new NotFoundError("Montagem");
  if (!OPEN_STATUSES.includes(b.status)) throw new DomainError("Esta montagem já foi concluída ou cancelada.");
  return b;
}

/** Reserva uma peça para a montagem: ela deixa de estar disponível para venda avulsa. */
export async function addBuildPart(ctx: Ctx, input: { buildId: string; itemId: string; quantity?: number; role?: string | null }) {
  requirePerm(ctx, "builds.manage");
  return withTx(async (tx) => {
    const b = await openBuild(tx, ctx, input.buildId);
    const it = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId }, include: { product: { include: { category: true } } } });
    if (!it) throw new NotFoundError("Item");
    if (it.product.category.kind === "PC") throw new DomainError("Um PC completo não pode ser peça de outra montagem. Desmonte-o primeiro.");
    if (it.ownership === "CLIENT") {
      assert(b.purpose === "CUSTOMER_ORDER" && it.ownerContactId === b.contactId, "Peça de cliente só entra em encomenda do próprio cliente.");
    } else if (it.ownership !== "OWNED") {
      throw new DomainError("Itens consignados ou de terceiros não podem ser usados em montagens.");
    }
    const qty = it.tracking === "UNIT" ? 1 : Math.max(1, input.quantity ?? 1);
    if (it.tracking === "UNIT") {
      await transitionUnits(tx, ctx, [it.id], ["AVAILABLE"], "IN_BUILD", { holdType: "BUILD", holdId: b.id });
    } else {
      await adjustLotQty(tx, ctx, it.id, { reserved: qty });
    }
    const part = await tx.buildPart.create({
      data: { orgId: ctx.orgId, buildId: b.id, itemId: it.id, quantity: qty, role: input.role ?? it.product.category.kind },
    });
    await itemEvent(tx, ctx, {
      itemId: it.id,
      type: "ADDED_TO_BUILD",
      message: `Reservado para a montagem ${b.code} — ${b.name}${qty > 1 ? ` (${qty} un.)` : ""}`,
      fromStatus: it.tracking === "UNIT" ? "AVAILABLE" : undefined,
      toStatus: it.tracking === "UNIT" ? "IN_BUILD" : undefined,
      refType: "BUILD",
      refId: b.id,
    });
    await audit(tx, ctx, "build.part.add", `${it.code} adicionado à montagem ${b.code}`, { entityType: "Build", entityId: b.id });
    return { id: part.id };
  });
}

/** Retira uma peça (substituição ou defeito). A peça volta ao estoque ou é marcada com defeito. */
export async function removeBuildPart(ctx: Ctx, input: { buildId: string; partId: string; reason: string; outcome: "AVAILABLE" | "DEFECTIVE" }) {
  requirePerm(ctx, "builds.manage");
  assert(input.reason?.trim().length >= 3, "Informe o motivo da retirada.");
  return withTx(async (tx) => {
    const b = await openBuild(tx, ctx, input.buildId);
    const part = await tx.buildPart.findFirst({ where: { id: input.partId, buildId: b.id, orgId: ctx.orgId, status: "ACTIVE" } });
    if (!part) throw new NotFoundError("Peça");
    const it = await tx.item.findUniqueOrThrow({ where: { id: part.itemId } });
    if (it.tracking === "UNIT") {
      await transitionUnits(tx, ctx, [it.id], ["IN_BUILD"], input.outcome, {
        holdType: null,
        holdId: null,
        requireHold: { type: "BUILD", id: b.id },
      });
      if (input.outcome === "DEFECTIVE") {
        await tx.item.update({ where: { id: it.id }, data: { defects: [it.defects, `Defeito na montagem ${b.code}: ${input.reason}`].filter(Boolean).join("\n") } });
      }
    } else {
      await adjustLotQty(tx, ctx, it.id, { reserved: -part.quantity });
    }
    await tx.buildPart.update({ where: { id: part.id }, data: { status: "REMOVED", removedAt: new Date(), removedReason: input.reason } });
    await itemEvent(tx, ctx, {
      itemId: it.id,
      type: "REMOVED_FROM_BUILD",
      message: `Retirado da montagem ${b.code}${input.outcome === "DEFECTIVE" ? " com defeito" : ""}`,
      fromStatus: it.tracking === "UNIT" ? "IN_BUILD" : undefined,
      toStatus: it.tracking === "UNIT" ? (input.outcome as ItemStatus) : undefined,
      reason: input.reason,
      refType: "BUILD",
      refId: b.id,
    });
    await audit(tx, ctx, "build.part.remove", `${it.code} retirado da montagem ${b.code}`, { entityType: "Build", entityId: b.id, data: { reason: input.reason } });
    return { ok: true };
  });
}

export const buildExpenseSchema = z.object({
  buildId: z.string(),
  kind: z.enum(["LABOR", "CONSUMABLE", "TESTING", "PARTS", "OTHER"]),
  description: z.string().trim().min(2).max(200),
  amountCents: z.number().int().positive(),
  paymentMode: z.enum(["PAID", "PAYABLE"]),
  accountId: z.string().optional().nullable(),
  method: z.enum(PAYMENT_METHODS).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  contactId: z.string().optional().nullable(),
  idempotencyKey: z.string().optional(),
});

/**
 * Despesa real da montagem (mão de obra de terceiro, insumos, testes…). Entra no custo
 * do PC na conclusão. Mão de obra própria NÃO é despesa: fica em ownLaborCents e só
 * influencia o preço sugerido.
 */
export async function addBuildExpense(ctx: Ctx, raw: z.input<typeof buildExpenseSchema>) {
  requirePerm(ctx, "builds.manage");
  requirePerm(ctx, "inventory.cost");
  const input = buildExpenseSchema.parse(raw);
  if (input.paymentMode === "PAID") assert(input.accountId, "Escolha a conta do pagamento.");
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const b = await openBuild(tx, ctx, input.buildId);
    const e = await tx.buildExpense.create({
      data: {
        orgId: ctx.orgId,
        buildId: b.id,
        kind: input.kind,
        description: input.description,
        amountCents: input.amountCents,
        paymentMode: input.paymentMode,
        accountId: input.accountId ?? null,
      },
    });
    await applyPaymentPlan(tx, ctx, {
      direction: "PAYABLE",
      totalCents: input.amountCents,
      contactId: input.contactId,
      sourceType: "BUILD",
      sourceId: e.id,
      description: `Montagem ${b.code}: ${input.description}`,
      categoryId: await systemCategoryId(tx, ctx.orgId, "BUILD"),
      now: input.paymentMode === "PAID" ? [{ amountCents: input.amountCents, accountId: input.accountId!, method: input.method ?? "PIX" }] : [],
      remainder: input.paymentMode === "PAYABLE" ? { installments: 1, firstDueDate: input.dueDate ?? new Date() } : null,
    });
    await audit(tx, ctx, "build.expense.add", `Despesa na montagem ${b.code}: ${input.description}`, { entityType: "Build", entityId: b.id });
    return { id: e.id };
  });
}

export async function removeBuildExpense(ctx: Ctx, input: { buildId: string; expenseId: string; reason: string; refundAccountId?: string | null }) {
  requirePerm(ctx, "builds.manage");
  requirePerm(ctx, "inventory.cost");
  return withTx(async (tx) => {
    const b = await openBuild(tx, ctx, input.buildId);
    const e = await tx.buildExpense.findFirst({ where: { id: input.expenseId, buildId: b.id, orgId: ctx.orgId } });
    if (!e) throw new NotFoundError("Despesa");
    await unwindSourceFinance(tx, ctx, { sourceType: "BUILD", sourceId: e.id }, `Despesa removida da montagem ${b.code}: ${input.reason}`, {
      refundAccountId: input.refundAccountId,
    });
    await tx.buildExpense.delete({ where: { id: e.id } });
    await audit(tx, ctx, "build.expense.remove", `Despesa removida da montagem ${b.code}: ${e.description}`, {
      entityType: "Build",
      entityId: b.id,
      data: { amountCents: e.amountCents, reason: input.reason },
    });
    return { ok: true };
  });
}

export async function setBuildStage(ctx: Ctx, input: { buildId: string; status: "PLANNING" | "ASSEMBLING" | "TESTING" }) {
  requirePerm(ctx, "builds.manage");
  return withTx(async (tx) => {
    const b = await openBuild(tx, ctx, input.buildId);
    await tx.build.update({ where: { id: b.id }, data: { status: input.status } });
    await audit(tx, ctx, "build.stage", `Montagem ${b.code}: ${BUILD_STATUS_LABEL[input.status]}`, { entityType: "Build", entityId: b.id });
    return { ok: true };
  });
}

/** Custos ao vivo de uma montagem (o que já está reservado + despesas). */
export async function buildCosting(orgId: string, buildId: string) {
  const b = await prisma.build.findFirst({
    where: { id: buildId, orgId },
    include: { parts: { where: { status: "ACTIVE" } }, expenses: true },
  });
  if (!b) throw new NotFoundError("Montagem");
  const items = await prisma.item.findMany({
    where: { orgId, id: { in: b.parts.map((p) => p.itemId) } },
    include: { product: { include: { category: true } } },
  });
  const parts = b.parts.map((p) => {
    const it = items.find((i) => i.id === p.itemId)!;
    const own = it.ownership === "OWNED";
    const cost = b.status === "COMPLETED" && p.costCents !== null ? p.costCents : own ? (it.unitCostCents !== null ? it.unitCostCents * p.quantity : null) : 0;
    return { part: p, item: it, own, costCents: cost, costStatus: own ? it.costStatus : ("KNOWN" as const) };
  });
  const partsCost = parts.reduce((a, p) => a + (p.costCents ?? 0), 0);
  const expensesCost = b.expenses.reduce((a, e) => a + e.amountCents, 0);
  const totalCost = partsCost + expensesCost;
  const costStatus = combineCostStatus(parts.map((p) => p.costStatus));
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const margin = Number((org.settings as { targetMarginPct?: number })?.targetMarginPct ?? 25) / 100;
  const suggested = Math.ceil(((totalCost + b.ownLaborCents) / (1 - Math.min(0.9, margin))) / 1000) * 1000;
  const price = b.targetPriceCents ?? null;
  const compat = checkCompatibility(
    parts.map((p) => ({
      code: p.item.code,
      title: p.item.title,
      kind: p.item.product.category.kind,
      quantity: p.part.quantity,
      specs: { ...(p.item.product.specs as object), ...(p.item.specs as object) } as Record<string, unknown>,
    })),
  );
  return {
    build: b,
    parts,
    partsCostCents: partsCost,
    expensesCostCents: expensesCost,
    totalCostCents: totalCost,
    costStatus,
    ownLaborCents: b.ownLaborCents,
    suggestedPriceCents: suggested,
    targetMarginPct: margin * 100,
    expectedMarginCents: price !== null ? price - totalCost : null,
    expectedMarginPct: price ? ((price - totalCost) / price) * 100 : null,
    compat,
  };
}

function specsSummary(parts: Awaited<ReturnType<typeof buildCosting>>["parts"]) {
  const pick = (kind: string) =>
    parts
      .filter((p) => p.item.product.category.kind === kind)
      .map((p) => `${p.part.quantity > 1 ? `${p.part.quantity}× ` : ""}${p.item.title}`)
      .join(" + ") || undefined;
  return {
    cpu: pick("CPU"),
    gpu: pick("GPU"),
    motherboard: pick("MOTHERBOARD"),
    ram: pick("RAM"),
    storage: pick("STORAGE"),
    psu: pick("PSU"),
    case: pick("CASE"),
    cooler: pick("COOLER"),
  };
}

/**
 * Conclui a montagem: cria UM ativo vendável (o PC), com custo = peças próprias +
 * despesas. As peças viram "Instaladas" dentro do PC (não contam mais como estoque
 * avulso, sem duplicar valor). Lotes (pasta térmica etc.) são consumidos.
 */
export async function completeBuild(
  ctx: Ctx,
  input: { buildId: string; title?: string | null; locationId?: string | null; expectedPriceCents?: number | null; idempotencyKey?: string },
) {
  requirePerm(ctx, "builds.manage");
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const costing = await buildCosting(ctx.orgId, input.buildId);
    const b = costing.build;
    assert(costing.parts.length > 0, "Adicione as peças antes de concluir a montagem.");
    const lock = await tx.build.updateMany({
      where: { id: b.id, orgId: ctx.orgId, status: { in: OPEN_STATUSES } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (lock.count !== 1) throw new ConflictError("Esta montagem já foi concluída ou cancelada.");
    if (input.locationId) {
      const loc = await tx.location.findFirst({ where: { id: input.locationId, orgId: ctx.orgId } });
      if (!loc) throw new NotFoundError("Local");
    }
    const pcCategory = await tx.category.findFirst({ where: { orgId: ctx.orgId, kind: "PC", archived: false } });
    assert(pcCategory, "Crie uma categoria do tipo 'Computador' para registrar PCs montados.");
    const product = await ensureProduct(tx, ctx, { categoryId: pcCategory.id, name: input.title || b.name, tracking: "UNIT" });
    const summary = specsSummary(costing.parts);
    const breakdown = [
      { kind: "BUILD_ROLLUP", amountCents: costing.partsCostCents, description: `Componentes próprios da montagem ${b.code}` },
      ...b.expenses.map((e) => ({ kind: e.kind, amountCents: e.amountCents, description: `${e.description} (montagem ${b.code})` })),
    ];
    const anyLocation = input.locationId ?? costing.parts.find((p) => p.item.locationId)?.item.locationId ?? null;
    const pc = await insertItem(tx, ctx, {
      product,
      title: input.title || b.name,
      status: "AVAILABLE",
      condition: "LIKE_NEW",
      specs: Object.fromEntries(Object.entries(summary).filter(([, v]) => v)),
      unitCostCents: costing.totalCostCents,
      costStatus: costing.costStatus,
      costBreakdown: breakdown,
      expectedPriceCents: input.expectedPriceCents ?? b.targetPriceCents,
      warrantyNotes: b.warrantyDays ? `Garantia de montagem: ${b.warrantyDays} dias` : null,
      locationId: anyLocation,
      acquisitionType: "BUILD",
      sourceBuildId: b.id,
      notes: b.description,
      eventMessage: `PC criado pela conclusão da montagem ${b.code} (${costing.parts.length} peças)`,
      refType: "BUILD",
      refId: b.id,
    });
    for (const p of costing.parts) {
      await tx.buildPart.update({ where: { id: p.part.id }, data: { costCents: p.costCents } });
      if (p.item.tracking === "UNIT") {
        await transitionUnits(tx, ctx, [p.item.id], ["IN_BUILD"], "INSTALLED", {
          holdType: null,
          holdId: null,
          requireHold: { type: "BUILD", id: b.id },
          parentItemId: pc.id,
        });
        await tx.item.update({ where: { id: p.item.id }, data: { locationId: anyLocation } });
        await itemEvent(tx, ctx, {
          itemId: p.item.id,
          type: "INSTALLED",
          message: `Instalado no PC ${pc.code} (montagem ${b.code})`,
          fromStatus: "IN_BUILD",
          toStatus: "INSTALLED",
          refType: "BUILD",
          refId: b.id,
          data: { parentItemId: pc.id },
        });
      } else {
        await adjustLotQty(tx, ctx, p.item.id, { onHand: -p.part.quantity, reserved: -p.part.quantity });
        await itemEvent(tx, ctx, {
          itemId: p.item.id,
          type: "CONSUMED",
          message: `${p.part.quantity} un. consumidas na montagem ${b.code} (PC ${pc.code})`,
          qtyDelta: -p.part.quantity,
          refType: "BUILD",
          refId: b.id,
        });
      }
    }
    await tx.build.update({ where: { id: b.id }, data: { resultItemId: pc.id } });
    await audit(tx, ctx, "build.complete", `Montagem ${b.code} concluída → PC ${pc.code}`, {
      entityType: "Build",
      entityId: b.id,
      data: { totalCostCents: costing.totalCostCents },
    });
    return { pcItemId: pc.id, pcCode: pc.code, totalCostCents: costing.totalCostCents };
  });
}

/** Cancela montagem não concluída: peças voltam ao estoque; despesas já feitas viram perda. */
export async function cancelBuild(ctx: Ctx, input: { buildId: string; reason: string }) {
  requirePerm(ctx, "builds.manage");
  assert(input.reason?.trim().length >= 3, "Informe o motivo.");
  return withTx(async (tx) => {
    const b = await openBuild(tx, ctx, input.buildId);
    const parts = await tx.buildPart.findMany({ where: { buildId: b.id, status: "ACTIVE" } });
    for (const p of parts) {
      const it = await tx.item.findUniqueOrThrow({ where: { id: p.itemId } });
      if (it.tracking === "UNIT") {
        await transitionUnits(tx, ctx, [it.id], ["IN_BUILD"], "AVAILABLE", { holdType: null, holdId: null, requireHold: { type: "BUILD", id: b.id } });
      } else {
        await adjustLotQty(tx, ctx, it.id, { reserved: -p.quantity });
      }
      await tx.buildPart.update({ where: { id: p.id }, data: { status: "REMOVED", removedAt: new Date(), removedReason: "Montagem cancelada" } });
      await itemEvent(tx, ctx, { itemId: it.id, type: "REMOVED_FROM_BUILD", message: `Montagem ${b.code} cancelada — peça liberada`, fromStatus: it.status, toStatus: it.tracking === "UNIT" ? "AVAILABLE" : undefined, reason: input.reason, refType: "BUILD", refId: b.id });
    }
    const expenses = await tx.buildExpense.findMany({ where: { buildId: b.id } });
    for (const e of expenses) {
      await resultEntry(tx, ctx, {
        date: new Date(),
        kind: "OTHER_EXPENSE",
        amountCents: e.amountCents,
        description: `Despesa de montagem cancelada ${b.code}: ${e.description}`,
        refType: "BUILD",
        refId: b.id,
        buildId: b.id,
        categoryId: await systemCategoryId(tx, ctx.orgId, "ADJUSTMENT"),
      });
    }
    await tx.build.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason } });
    await audit(tx, ctx, "build.cancel", `Montagem ${b.code} cancelada`, { entityType: "Build", entityId: b.id, data: { reason: input.reason } });
    return { ok: true };
  });
}

// ─────────────────────────── Desmontagem ───────────────────────────

export const disassemblySchema = z.object({
  itemId: z.string(),
  method: z.enum(["ORIGINAL_COST", "BY_VALUE"]),
  /** O que fazer com a diferença entre o custo do PC e o custo original das peças (só ORIGINAL_COST). */
  remainder: z.enum(["ALLOCATE", "WRITE_OFF"]).default("ALLOCATE"),
  children: z
    .array(
      z.object({
        itemId: z.string(),
        outcome: z.enum(["AVAILABLE", "DEFECTIVE", "SCRAP"]),
        estimatedValueCents: z.number().int().min(0).optional().nullable(),
        locationId: z.string().optional().nullable(),
      }),
    )
    .default([]),
  newComponents: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        title: z.string().trim().min(2).max(160),
        brand: z.string().trim().max(60).optional().nullable(),
        model: z.string().trim().max(120).optional().nullable(),
        serial: z.string().trim().max(120).optional().nullable(),
        condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).default("GOOD"),
        outcome: z.enum(["AVAILABLE", "DEFECTIVE", "SCRAP"]).default("AVAILABLE"),
        estimatedValueCents: z.number().int().min(0),
        specs: z.record(z.string(), z.unknown()).optional(),
        locationId: z.string().optional().nullable(),
      }),
    )
    .default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotencyKey: z.string().optional(),
});

export { planDisassembly };

function safePlan(...args: Parameters<typeof planDisassembly>) {
  try {
    return planDisassembly(...args);
  } catch (e) {
    throw new DomainError((e as Error).message);
  }
}

/**
 * Desmonta um PC (montado aqui ou recebido pronto). O custo do PC é redistribuído
 * entre os componentes que voltam ao estoque — com prévia transparente:
 *  - ORIGINAL_COST: cada peça instalada recupera seu custo original; a diferença
 *    (despesas de montagem) é rateada ou lançada como perda, à escolha.
 *  - BY_VALUE: o custo é rateado pelo valor estimado de cada componente.
 * Componentes descartados (SCRAP) levam sua parcela para perda.
 */
export async function disassemble(ctx: Ctx, raw: z.input<typeof disassemblySchema>) {
  requirePerm(ctx, "builds.manage");
  const input = disassemblySchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const pc = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId }, include: { children: true, product: { include: { category: true } } } });
    if (!pc) throw new NotFoundError("Item");
    assert(pc.ownership === "OWNED", "Só PCs próprios podem ser desmontados pelo estoque.");
    assert(pc.tracking === "UNIT", "Lotes não podem ser desmontados.");
    const installed = pc.children.filter((c) => c.status === "INSTALLED");
    const childIds = new Set(input.children.map((c) => c.itemId));
    for (const c of installed) {
      if (!childIds.has(c.id)) throw new DomainError(`Informe o destino da peça instalada ${c.code} (${c.title}).`);
    }
    for (const c of input.children) {
      if (!installed.find((i) => i.id === c.itemId)) throw new DomainError("Peça informada não está instalada neste PC.");
    }
    assert(installed.length + input.newComponents.length > 0, "Informe os componentes que saem do PC.");
    if (input.method === "ORIGINAL_COST") assert(input.newComponents.length === 0, "Rateio por custo original só vale para peças que foram instaladas aqui. Use rateio por valor estimado.");
    const pcFrom: ItemStatus[] = ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED"];
    if (!pcFrom.includes(pc.status)) throw new ConflictError(`O PC está ${STATUS_LABEL[pc.status].toLowerCase()} e não pode ser desmontado agora.`);
    const pcCost = pc.unitCostCents ?? 0;
    const plan = safePlan(pcCost, input.method, input.remainder, [
      ...input.children.map((c) => {
        const it = installed.find((i) => i.id === c.itemId)!;
        return { key: c.itemId, originalCostCents: it.unitCostCents, estimatedValueCents: c.estimatedValueCents ?? it.estimatedValueCents ?? null, scrap: c.outcome === "SCRAP" };
      }),
      ...input.newComponents.map((n, i) => ({ key: `new-${i}`, originalCostCents: null, estimatedValueCents: n.estimatedValueCents, scrap: n.outcome === "SCRAP" })),
    ]);
    const code = await nextCode(tx, ctx.orgId, "disassembly");
    const dis = await tx.disassembly.create({
      data: {
        orgId: ctx.orgId,
        code,
        sourceItemId: pc.id,
        method: input.method,
        sourceCostCents: pc.unitCostCents,
        writeOffCents: plan.writeOffCents,
        allocation: JSON.parse(JSON.stringify(plan.rows)),
        notes: input.notes ?? null,
        createdById: ctx.userId,
      },
    });
    const date = new Date();
    // PC sai do estoque como "Desmontado" (custo transferido para as peças).
    await transitionUnits(tx, ctx, [pc.id], pcFrom, "DISASSEMBLED", { exitedAt: date, qtyOnHand: 0, holdType: null, holdId: null });
    await itemEvent(tx, ctx, {
      itemId: pc.id,
      type: "DISASSEMBLED",
      message: `Desmontado (${code}); custo redistribuído entre ${plan.rows.length} componente(s)`,
      fromStatus: pc.status,
      toStatus: "DISASSEMBLED",
      refType: "DISASSEMBLY",
      refId: dis.id,
      data: { allocation: plan.rows, writeOffCents: plan.writeOffCents },
    });
    for (const c of input.children) {
      const it = installed.find((i) => i.id === c.itemId)!;
      const row = plan.rows.find((r) => r.key === c.itemId)!;
      const status: ItemStatus = c.outcome === "SCRAP" ? "DISPOSED" : c.outcome;
      await transitionUnits(tx, ctx, [it.id], ["INSTALLED"], status, { parentItemId: null, exitedAt: c.outcome === "SCRAP" ? date : null, qtyOnHand: c.outcome === "SCRAP" ? 0 : 1 });
      const delta = (c.outcome === "SCRAP" ? 0 : row.allocatedCents) - (it.unitCostCents ?? 0);
      if (delta !== 0) {
        await tx.item.update({ where: { id: it.id }, data: { unitCostCents: (it.unitCostCents ?? 0) + delta } });
        await tx.costEntry.create({
          data: { orgId: ctx.orgId, itemId: it.id, kind: "DISASSEMBLY_ALLOCATION", amountCents: delta, description: `Rateio da desmontagem ${code} do PC ${pc.code}`, refType: "DISASSEMBLY", refId: dis.id, userId: ctx.userId },
        });
      }
      await tx.item.update({ where: { id: it.id }, data: { costStatus: pc.costStatus, locationId: c.locationId ?? pc.locationId } });
      await itemEvent(tx, ctx, {
        itemId: it.id,
        type: "EXTRACTED",
        message: `Retirado do PC ${pc.code} na desmontagem ${code}${c.outcome === "SCRAP" ? " e descartado" : ""}`,
        fromStatus: "INSTALLED",
        toStatus: status,
        refType: "DISASSEMBLY",
        refId: dis.id,
        data: { allocatedCents: row.allocatedCents },
      });
    }
    for (let i = 0; i < input.newComponents.length; i++) {
      const n = input.newComponents[i];
      const row = plan.rows.find((r) => r.key === `new-${i}`)!;
      if (n.outcome === "SCRAP") continue;
      const product = await ensureProduct(tx, ctx, { categoryId: n.categoryId, brand: n.brand, model: n.model, name: n.brand || n.model ? null : n.title, specs: n.specs });
      await insertItem(tx, ctx, {
        product,
        title: n.title,
        serial: n.serial,
        status: n.outcome,
        condition: n.condition,
        specs: n.specs,
        unitCostCents: row.allocatedCents,
        costStatus: pc.costStatus,
        costBreakdown: [{ kind: "DISASSEMBLY_ALLOCATION", amountCents: row.allocatedCents, description: `Rateio da desmontagem ${code} do PC ${pc.code}` }],
        estimatedValueCents: n.estimatedValueCents,
        estimatedValueNote: `Estimativa da desmontagem ${code}`,
        locationId: n.locationId ?? pc.locationId,
        acquisitionType: "DISASSEMBLY",
        sourceDisassemblyId: dis.id,
        eventMessage: `Retirado do PC ${pc.code} na desmontagem ${code}`,
        refType: "DISASSEMBLY",
        refId: dis.id,
      });
    }
    if (plan.writeOffCents > 0) {
      await resultEntry(tx, ctx, {
        date,
        kind: "OTHER_EXPENSE",
        amountCents: plan.writeOffCents,
        description: `Perda na desmontagem ${code} do PC ${pc.code}`,
        refType: "DISASSEMBLY",
        refId: dis.id,
        itemId: pc.id,
        categoryId: await systemCategoryId(tx, ctx.orgId, "ADJUSTMENT"),
        costStatus: pc.costStatus,
      });
    }
    await audit(tx, ctx, "item.disassemble", `PC ${pc.code} desmontado (${code})`, { entityType: "Item", entityId: pc.id, data: { method: input.method, writeOffCents: plan.writeOffCents } });
    return { id: dis.id, code };
  });
}

export function canSeeCosts(ctx: Ctx) {
  return hasPerm(ctx, "inventory.cost");
}
