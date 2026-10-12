import { z } from "zod";
import type { Tx } from "../db";
import { requirePerm, hasPerm, withIdempotency, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, ConflictError, assert } from "../errors";
import {
  audit,
  itemEvent,
  nextCode,
  resultEntry,
  STATUS_LABEL,
  adjustLotQty,
  transitionUnits,
  syncInstalledChildren,
} from "./shared";
import { applyPaymentPlan, PAYMENT_METHODS } from "./finance";
import { systemCategoryId } from "./org";
import type { ItemStatus, Ownership, ItemCondition, CostStatus, TrackingMode } from "@/generated/prisma/client";

export const CONDITION_LABEL: Record<ItemCondition, string> = {
  NEW: "Novo",
  LIKE_NEW: "Seminovo (como novo)",
  GOOD: "Usado — bom estado",
  FAIR: "Usado — com marcas de uso",
  FOR_PARTS: "Para peças / retirada",
};

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  OWNED: "Próprio",
  CONSIGNED_IN: "Consignado (de terceiro)",
  CLIENT: "Equipamento de cliente",
  THIRD_PARTY: "Terceiro sob guarda",
};

const productRef = z.object({
  productId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brand: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  name: z.string().trim().max(160).optional().nullable(),
  specs: z.record(z.string(), z.unknown()).optional(),
  tracking: z.enum(["UNIT", "LOT"]).optional(),
});

export type ProductRef = z.infer<typeof productRef>;

/** Usa um produto existente ou cria um novo modelo no catálogo (marca + modelo). */
export async function ensureProduct(tx: Tx, ctx: Ctx, ref: ProductRef): Promise<{ id: string; name: string; tracking: TrackingMode }> {
  if (ref.productId) {
    const p = await tx.product.findFirst({ where: { id: ref.productId, orgId: ctx.orgId } });
    if (!p) throw new NotFoundError("Produto");
    return p;
  }
  assert(ref.categoryId, "Escolha a categoria do item.");
  const cat = await tx.category.findFirst({ where: { id: ref.categoryId, orgId: ctx.orgId } });
  if (!cat) throw new NotFoundError("Categoria");
  const name = (ref.name || [ref.brand, ref.model].filter(Boolean).join(" ")).trim();
  assert(name.length >= 2, "Informe o nome, ou a marca e o modelo do item.");
  const existing = await tx.product.findFirst({
    where: { orgId: ctx.orgId, categoryId: cat.id, name: { equals: name, mode: "insensitive" }, archived: false },
  });
  if (existing) {
    if (ref.specs && Object.keys(ref.specs).length) {
      await tx.product.update({
        where: { id: existing.id },
        data: { specs: { ...(existing.specs as object), ...ref.specs } as object },
      });
    }
    return existing;
  }
  return tx.product.create({
    data: {
      orgId: ctx.orgId,
      categoryId: cat.id,
      brand: ref.brand || null,
      model: ref.model || null,
      name,
      specs: (ref.specs ?? {}) as object,
      tracking: ref.tracking ?? (cat.kind === "CONSUMABLE" ? "LOT" : "UNIT"),
    },
  });
}

async function assertLocation(tx: Tx, ctx: Ctx, locationId?: string | null) {
  if (!locationId) return null;
  const loc = await tx.location.findFirst({ where: { id: locationId, orgId: ctx.orgId } });
  if (!loc) throw new NotFoundError("Local");
  return loc;
}

async function assertContact(tx: Tx, ctx: Ctx, contactId?: string | null) {
  if (!contactId) return null;
  const c = await tx.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId } });
  if (!c) throw new NotFoundError("Contato");
  return c;
}

export type NewItemData = {
  product: { id: string; name: string; tracking: TrackingMode };
  title?: string | null;
  serial?: string | null;
  status?: ItemStatus;
  ownership?: Ownership;
  ownerContactId?: string | null;
  condition?: ItemCondition;
  defects?: string | null;
  completeness?: Record<string, boolean>;
  accessories?: string | null;
  specs?: Record<string, unknown>;
  quantity?: number;
  /** Custo unitário em centavos; null = desconhecido */
  unitCostCents: number | null;
  costStatus: CostStatus;
  costBreakdown?: { kind: string; amountCents: number; description: string }[];
  expectedPriceCents?: number | null;
  minPriceCents?: number | null;
  estimatedValueCents?: number | null;
  estimatedValueNote?: string | null;
  warrantyUntil?: Date | null;
  warrantyNotes?: string | null;
  locationId?: string | null;
  acquisitionType: Item["acquisitionType"];
  acquiredAt?: Date;
  sourcePurchaseLineId?: string | null;
  sourceTradeId?: string | null;
  sourceSaleId?: string | null;
  sourceBuildId?: string | null;
  sourceDisassemblyId?: string | null;
  importBatchId?: string | null;
  tags?: string[];
  notes?: string | null;
  eventMessage: string;
  refType?: string;
  refId?: string;
};

type Item = { acquisitionType: "PURCHASE" | "TRADE" | "TRADE_IN" | "BUILD" | "DISASSEMBLY" | "MIGRATION" | "IMPORT" | "CONSIGNMENT" | "CLIENT" | "OTHER" };

/** Cria uma unidade (ou lote) com custo rastreável e evento de origem. Uso interno do domínio. */
export async function insertItem(tx: Tx, ctx: Ctx, d: NewItemData) {
  const tracking = d.product.tracking;
  const qty = tracking === "UNIT" ? 1 : Math.max(1, d.quantity ?? 1);
  if (d.costStatus !== "UNKNOWN") assert(d.unitCostCents !== null && d.unitCostCents >= 0, "Custo inválido.");
  const code = await nextCode(tx, ctx.orgId, "item");
  const item = await tx.item.create({
    data: {
      orgId: ctx.orgId,
      code,
      productId: d.product.id,
      title: (d.title || d.product.name).trim(),
      serial: d.serial?.trim() || null,
      status: d.status ?? "AVAILABLE",
      ownership: d.ownership ?? "OWNED",
      ownerContactId: d.ownerContactId ?? null,
      condition: d.condition ?? "GOOD",
      defects: d.defects || null,
      completeness: (d.completeness ?? {}) as object,
      accessories: d.accessories || null,
      specs: (d.specs ?? {}) as object,
      tracking,
      qtyInitial: qty,
      qtyOnHand: qty,
      unitCostCents: d.unitCostCents,
      costStatus: d.costStatus,
      expectedPriceCents: d.expectedPriceCents ?? null,
      minPriceCents: d.minPriceCents ?? null,
      estimatedValueCents: d.estimatedValueCents ?? null,
      estimatedValueNote: d.estimatedValueNote ?? null,
      estimatedValueAt: d.estimatedValueCents ? new Date() : null,
      warrantyUntil: d.warrantyUntil ?? null,
      warrantyNotes: d.warrantyNotes ?? null,
      locationId: d.locationId ?? null,
      acquisitionType: d.acquisitionType,
      acquiredAt: d.acquiredAt ?? new Date(),
      sourcePurchaseLineId: d.sourcePurchaseLineId ?? null,
      sourceTradeId: d.sourceTradeId ?? null,
      sourceSaleId: d.sourceSaleId ?? null,
      sourceBuildId: d.sourceBuildId ?? null,
      sourceDisassemblyId: d.sourceDisassemblyId ?? null,
      importBatchId: d.importBatchId ?? null,
      tags: d.tags ?? [],
      notes: d.notes || null,
    },
  });
  const breakdown =
    d.costBreakdown ??
    (d.unitCostCents !== null && d.unitCostCents > 0
      ? [{ kind: "ACQUISITION", amountCents: d.unitCostCents * qty, description: "Custo de aquisição" }]
      : []);
  for (const c of breakdown) {
    if (c.amountCents === 0) continue;
    await tx.costEntry.create({
      data: {
        orgId: ctx.orgId,
        itemId: item.id,
        kind: c.kind,
        amountCents: c.amountCents,
        description: c.description,
        refType: d.refType,
        refId: d.refId,
        userId: ctx.userId,
      },
    });
  }
  await itemEvent(tx, ctx, {
    itemId: item.id,
    type: "CREATED",
    message: d.eventMessage,
    toStatus: item.status,
    toLocationId: item.locationId,
    qtyDelta: qty,
    refType: d.refType,
    refId: d.refId,
  });
  return item;
}

// ─────────────────────────── Cadastro direto ───────────────────────────

export const createItemSchema = z.object({
  product: productRef,
  title: z.string().trim().max(160).optional().nullable(),
  serial: z.string().trim().max(120).optional().nullable(),
  origin: z.enum(["MIGRATION", "CONSIGNMENT", "CLIENT", "OTHER"]),
  ownerContactId: z.string().optional().nullable(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]).default("GOOD"),
  initialStatus: z.enum(["AVAILABLE", "INSPECTION", "DEFECTIVE"]).default("AVAILABLE"),
  defects: z.string().trim().max(2000).optional().nullable(),
  completeness: z.record(z.string(), z.boolean()).optional(),
  accessories: z.string().trim().max(500).optional().nullable(),
  specs: z.record(z.string(), z.unknown()).optional(),
  quantity: z.number().int().min(1).max(100000).optional(),
  costMode: z.enum(["KNOWN", "ESTIMATED", "UNKNOWN"]),
  unitCostCents: z.number().int().min(0).optional().nullable(),
  expectedPriceCents: z.number().int().min(0).optional().nullable(),
  minPriceCents: z.number().int().min(0).optional().nullable(),
  estimatedValueCents: z.number().int().min(0).optional().nullable(),
  estimatedValueNote: z.string().trim().max(200).optional().nullable(),
  warrantyUntil: z.coerce.date().optional().nullable(),
  warrantyNotes: z.string().trim().max(300).optional().nullable(),
  locationId: z.string().optional().nullable(),
  acquiredAt: z.coerce.date().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  idempotencyKey: z.string().optional(),
});

/**
 * Cadastro de item que NÃO é uma compra agora: estoque inicial (migração),
 * consignação recebida, equipamento de cliente. Compras passam por purchases.ts.
 */
export async function createItem(ctx: Ctx, raw: z.input<typeof createItemSchema>) {
  requirePerm(ctx, "inventory.edit");
  const input = createItemSchema.parse(raw);
  if (input.costMode !== "UNKNOWN") {
    assert(input.unitCostCents !== null && input.unitCostCents !== undefined, "Informe o custo ou marque como desconhecido.");
  }
  if (input.origin === "CONSIGNMENT" || input.origin === "CLIENT") {
    assert(input.ownerContactId, "Informe o dono do item (contato).");
  }
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const product = await ensureProduct(tx, ctx, input.product);
    await assertLocation(tx, ctx, input.locationId);
    await assertContact(tx, ctx, input.ownerContactId);
    const ownership: Ownership =
      input.origin === "CONSIGNMENT" ? "CONSIGNED_IN" : input.origin === "CLIENT" ? "CLIENT" : "OWNED";
    const isClient = ownership === "CLIENT";
    const item = await insertItem(tx, ctx, {
      product,
      title: input.title,
      serial: input.serial,
      status: input.initialStatus,
      ownership,
      ownerContactId: input.ownerContactId,
      condition: input.condition,
      defects: input.defects,
      completeness: input.completeness,
      accessories: input.accessories,
      specs: input.specs,
      quantity: input.quantity,
      // Equipamento de cliente não é nosso: custo zero conhecido (não entra no valor de estoque próprio).
      unitCostCents: isClient ? 0 : input.costMode === "UNKNOWN" ? null : input.unitCostCents!,
      costStatus: isClient ? "KNOWN" : input.costMode,
      costBreakdown:
        isClient || input.costMode === "UNKNOWN" || !input.unitCostCents
          ? []
          : [
              {
                kind: input.origin === "CONSIGNMENT" ? "CONSIGNMENT_PAYOUT" : "ACQUISITION",
                amountCents: input.unitCostCents * (product.tracking === "LOT" ? (input.quantity ?? 1) : 1),
                description:
                  input.origin === "CONSIGNMENT"
                    ? "Valor de repasse ao consignante"
                    : input.costMode === "ESTIMATED"
                      ? "Custo estimado (cadastro inicial)"
                      : "Custo informado no cadastro inicial",
              },
            ],
      expectedPriceCents: input.expectedPriceCents,
      minPriceCents: input.minPriceCents,
      estimatedValueCents: input.estimatedValueCents,
      estimatedValueNote: input.estimatedValueNote,
      warrantyUntil: input.warrantyUntil,
      warrantyNotes: input.warrantyNotes,
      locationId: input.locationId,
      acquisitionType: input.origin === "OTHER" ? "OTHER" : input.origin,
      acquiredAt: input.acquiredAt,
      tags: input.tags,
      notes: input.notes,
      eventMessage:
        input.origin === "MIGRATION"
          ? `Cadastrado no estoque inicial${input.costMode === "UNKNOWN" ? " com custo desconhecido" : input.costMode === "ESTIMATED" ? " com custo estimado" : ""}`
          : input.origin === "CONSIGNMENT"
            ? "Recebido em consignação"
            : input.origin === "CLIENT"
              ? "Equipamento do cliente recebido"
              : "Cadastrado",
    });
    await audit(tx, ctx, "item.create", `Item ${item.code} cadastrado: ${item.title}`, { entityType: "Item", entityId: item.id });
    return { id: item.id, code: item.code };
  });
}

// ─────────────────────────── Edição ───────────────────────────

export const updateItemSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  title: z.string().trim().min(2).max(160),
  serial: z.string().trim().max(120).optional().nullable(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"]),
  defects: z.string().trim().max(2000).optional().nullable(),
  completeness: z.record(z.string(), z.boolean()).optional(),
  accessories: z.string().trim().max(500).optional().nullable(),
  specs: z.record(z.string(), z.unknown()).optional(),
  expectedPriceCents: z.number().int().min(0).optional().nullable(),
  minPriceCents: z.number().int().min(0).optional().nullable(),
  estimatedValueCents: z.number().int().min(0).optional().nullable(),
  estimatedValueNote: z.string().trim().max(200).optional().nullable(),
  warrantyUntil: z.coerce.date().optional().nullable(),
  warrantyNotes: z.string().trim().max(300).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

/** Edição com trava otimista: se outra pessoa salvou antes, nada é sobrescrito. */
export async function updateItem(ctx: Ctx, raw: z.input<typeof updateItemSchema>) {
  requirePerm(ctx, "inventory.edit");
  const input = updateItemSchema.parse(raw);
  return withTx(async (tx) => {
    const before = await tx.item.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
    if (!before) throw new NotFoundError("Item");
    const res = await tx.item.updateMany({
      where: { id: input.id, orgId: ctx.orgId, version: input.version },
      data: {
        title: input.title,
        serial: input.serial || null,
        condition: input.condition,
        defects: input.defects || null,
        completeness: (input.completeness ?? before.completeness) as object,
        accessories: input.accessories || null,
        specs: (input.specs ?? before.specs) as object,
        expectedPriceCents: input.expectedPriceCents ?? null,
        minPriceCents: input.minPriceCents ?? null,
        estimatedValueCents: input.estimatedValueCents ?? null,
        estimatedValueNote: input.estimatedValueNote ?? null,
        estimatedValueAt:
          input.estimatedValueCents !== before.estimatedValueCents ? (input.estimatedValueCents ? new Date() : null) : undefined,
        warrantyUntil: input.warrantyUntil ?? null,
        warrantyNotes: input.warrantyNotes ?? null,
        tags: input.tags ?? before.tags,
        notes: input.notes || null,
        version: { increment: 1 },
      },
    });
    if (res.count !== 1) {
      throw new ConflictError("Este item foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.");
    }
    const changed: string[] = [];
    if (before.title !== input.title) changed.push("título");
    if ((before.serial ?? "") !== (input.serial ?? "")) changed.push("número de série");
    if (before.condition !== input.condition) changed.push("condição");
    if ((before.expectedPriceCents ?? null) !== (input.expectedPriceCents ?? null)) changed.push("preço pretendido");
    if ((before.estimatedValueCents ?? null) !== (input.estimatedValueCents ?? null)) changed.push("valor de mercado estimado");
    if ((before.defects ?? "") !== (input.defects ?? "")) changed.push("defeitos");
    await itemEvent(tx, ctx, {
      itemId: before.id,
      type: "UPDATED",
      message: changed.length ? `Dados atualizados: ${changed.join(", ")}` : "Dados atualizados",
      data: {
        before: { title: before.title, serial: before.serial, condition: before.condition, expectedPriceCents: before.expectedPriceCents },
        after: { title: input.title, serial: input.serial, condition: input.condition, expectedPriceCents: input.expectedPriceCents },
      },
    });
    await audit(tx, ctx, "item.update", `Item ${before.code} atualizado`, { entityType: "Item", entityId: before.id });
    return { ok: true };
  });
}

// ─────────────────────────── Movimentação física ───────────────────────────

export async function moveItems(ctx: Ctx, input: { itemIds: string[]; locationId: string | null; reason?: string | null; refType?: string; refId?: string }) {
  requirePerm(ctx, "inventory.edit");
  assert(input.itemIds.length > 0, "Selecione ao menos um item.");
  return withTx(async (tx) => moveItemsTx(tx, ctx, input));
}

export async function moveItemsTx(
  tx: Tx,
  ctx: Ctx,
  input: { itemIds: string[]; locationId: string | null; reason?: string | null; refType?: string; refId?: string },
) {
  const loc = await assertLocation(tx, ctx, input.locationId);
  const items = await tx.item.findMany({ where: { orgId: ctx.orgId, id: { in: input.itemIds } } });
  if (items.length !== new Set(input.itemIds).size) throw new NotFoundError("Item");
  let moved = 0;
  for (const it of items) {
    if (it.locationId === (input.locationId ?? null)) continue;
    if (it.status === "INSTALLED") {
      throw new DomainError(`${it.code} está instalado dentro de um PC; mova o PC, não o componente.`);
    }
    const n = await tx.item.updateMany({
      where: { id: it.id, orgId: ctx.orgId, locationId: it.locationId },
      data: { locationId: input.locationId, version: { increment: 1 } },
    });
    if (n.count !== 1) throw new ConflictError(`${it.code} foi movido por outra pessoa. Recarregue e tente novamente.`);
    // Componentes instalados acompanham o PC.
    await tx.item.updateMany({ where: { orgId: ctx.orgId, parentItemId: it.id }, data: { locationId: input.locationId } });
    await itemEvent(tx, ctx, {
      itemId: it.id,
      type: "MOVED",
      message: `Movido para ${loc ? loc.name : "sem local definido"}`,
      fromLocationId: it.locationId,
      toLocationId: input.locationId,
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
    });
    moved++;
  }
  await audit(tx, ctx, "item.move", `${moved} item(ns) movido(s) para ${loc?.name ?? "sem local"}`, {
    data: { itemIds: input.itemIds, locationId: input.locationId, reason: input.reason },
  });
  return { moved };
}

// ─────────────────────────── Mudança manual de situação ───────────────────────────

/** Transições que o operador pode fazer manualmente (as demais vêm de vendas, montagens, catiras…). */
export const MANUAL_TRANSITIONS: Partial<Record<ItemStatus, ItemStatus[]>> = {
  AVAILABLE: ["INSPECTION", "DEFECTIVE", "CONSIGNED_OUT"],
  INSPECTION: ["AVAILABLE", "DEFECTIVE"],
  DEFECTIVE: ["AVAILABLE", "INSPECTION"],
  RETURNED: ["AVAILABLE", "INSPECTION", "DEFECTIVE"],
  CONSIGNED_OUT: ["AVAILABLE"],
};

export async function changeStatus(
  ctx: Ctx,
  input: { itemId: string; to: ItemStatus; reason?: string | null; holderContactId?: string | null },
) {
  requirePerm(ctx, "inventory.edit");
  return withTx(async (tx) => {
    const it = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId } });
    if (!it) throw new NotFoundError("Item");
    const allowed = MANUAL_TRANSITIONS[it.status] ?? [];
    if (!allowed.includes(input.to)) {
      throw new DomainError(`Não é possível mudar de "${STATUS_LABEL[it.status]}" para "${STATUS_LABEL[input.to]}" manualmente.`);
    }
    if (input.to === "DEFECTIVE") assert(input.reason?.trim(), "Descreva o defeito encontrado.");
    if (input.to === "CONSIGNED_OUT") assert(input.holderContactId, "Informe com quem o item ficou consignado.");
    await assertContact(tx, ctx, input.holderContactId);
    const n = await tx.item.updateMany({
      where: { id: it.id, orgId: ctx.orgId, status: it.status },
      data: {
        status: input.to,
        defects: input.to === "DEFECTIVE" ? [it.defects, input.reason].filter(Boolean).join("\n") : undefined,
        holdType: input.to === "CONSIGNED_OUT" ? "CONSIGNMENT" : null,
        holdId: input.to === "CONSIGNED_OUT" ? input.holderContactId : null,
        version: { increment: 1 },
      },
    });
    if (n.count !== 1) throw new ConflictError("A situação do item mudou enquanto você operava. Recarregue e tente novamente.");
    await itemEvent(tx, ctx, {
      itemId: it.id,
      type: "STATUS_CHANGED",
      message: `Situação: ${STATUS_LABEL[it.status]} → ${STATUS_LABEL[input.to]}`,
      fromStatus: it.status,
      toStatus: input.to,
      reason: input.reason,
      data: input.holderContactId ? { holderContactId: input.holderContactId } : undefined,
    });
    await audit(tx, ctx, "item.status", `${it.code}: ${STATUS_LABEL[it.status]} → ${STATUS_LABEL[input.to]}`, {
      entityType: "Item",
      entityId: it.id,
      data: { reason: input.reason },
    });
    return { ok: true };
  });
}

// ─────────────────────────── Custos ───────────────────────────

export const addCostSchema = z.object({
  itemId: z.string(),
  kind: z.enum(["FREIGHT", "FEE", "COMMISSION", "REPAIR", "TESTING", "PARTS", "OTHER"]),
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(2).max(200),
  payment: z.enum(["PAID", "PAYABLE", "NONE"]),
  accountId: z.string().optional().nullable(),
  method: z.enum(PAYMENT_METHODS).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  contactId: z.string().optional().nullable(),
  date: z.coerce.date().optional(),
  idempotencyKey: z.string().optional(),
});

export const COST_KIND_LABEL: Record<string, string> = {
  ACQUISITION: "Aquisição",
  FREIGHT: "Frete",
  FEE: "Taxa",
  COMMISSION: "Comissão",
  REPAIR: "Reparo",
  TESTING: "Teste",
  PARTS: "Peças",
  TRADE_ALLOCATION: "Custo vindo de catira",
  BUILD_ROLLUP: "Soma da montagem",
  DISASSEMBLY_ALLOCATION: "Rateio de desmontagem",
  CONSIGNMENT_PAYOUT: "Repasse de consignação",
  ADJUSTMENT: "Correção de custo",
  LABOR: "Mão de obra",
  CONSUMABLE: "Insumos",
  OTHER: "Outros",
};

/** Adiciona custo a um item (frete, reparo, teste…). Capitalizado no custo; o dinheiro sai do caixa ou vira conta a pagar. */
export async function addItemCost(ctx: Ctx, raw: z.input<typeof addCostSchema>) {
  requirePerm(ctx, "inventory.cost");
  const input = addCostSchema.parse(raw);
  if (input.payment === "PAID") assert(input.accountId, "Escolha a conta usada no pagamento.");
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const it = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId } });
    if (!it) throw new NotFoundError("Item");
    assert(it.ownership === "OWNED", "Custos só podem ser adicionados a itens próprios.");
    assert(
      !["SOLD", "DELIVERED", "EXCHANGED", "DISPOSED", "VOID", "DISASSEMBLED", "INSTALLED"].includes(it.status),
      `Item ${STATUS_LABEL[it.status].toLowerCase()} não recebe novos custos. Lance como despesa no financeiro.`,
    );
    await applyCostDelta(tx, ctx, it.id, input.amountCents, {
      kind: input.kind,
      description: input.description,
      refType: "ITEM_COST",
    });
    if (input.payment !== "NONE") {
      await applyPaymentPlan(tx, ctx, {
        direction: "PAYABLE",
        totalCents: input.amountCents,
        contactId: input.contactId,
        sourceType: "ITEM_COST",
        sourceId: it.id,
        description: `${COST_KIND_LABEL[input.kind]} — ${it.code} ${it.title}: ${input.description}`,
        categoryId: await systemCategoryId(tx, ctx.orgId, "ITEM_COST"),
        date: input.date,
        now: input.payment === "PAID" ? [{ amountCents: input.amountCents, accountId: input.accountId!, method: input.method ?? "PIX", date: input.date }] : [],
        remainder: input.payment === "PAYABLE" ? { installments: 1, firstDueDate: input.dueDate ?? new Date() } : null,
      });
    }
    await audit(tx, ctx, "item.cost", `Custo adicionado a ${it.code}: ${input.description}`, {
      entityType: "Item",
      entityId: it.id,
      data: { amountCents: input.amountCents, payment: input.payment },
    });
    return { ok: true };
  });
}

/**
 * Soma um valor ao custo total do item (unidade) ou do saldo do lote, recalculando o
 * custo unitário. Cria CostEntry (append-only) e evento.
 */
export async function applyCostDelta(
  tx: Tx,
  ctx: Ctx,
  itemId: string,
  amountCents: number,
  meta: { kind: string; description: string; refType?: string; refId?: string; resolveUnknown?: boolean },
) {
  const it = await tx.item.findFirstOrThrow({ where: { id: itemId, orgId: ctx.orgId } });
  const qty = it.tracking === "UNIT" ? 1 : Math.max(1, it.qtyOnHand);
  const currentTotal = (it.unitCostCents ?? 0) * qty;
  const newTotal = currentTotal + amountCents;
  assert(newTotal >= 0, "O custo resultante não pode ser negativo.");
  const newUnit = Math.round(newTotal / qty);
  await tx.item.update({
    where: { id: it.id },
    data: {
      unitCostCents: newUnit,
      costStatus: meta.resolveUnknown ? "KNOWN" : it.costStatus,
      version: { increment: 1 },
    },
  });
  await tx.costEntry.create({
    data: {
      orgId: ctx.orgId,
      itemId: it.id,
      kind: meta.kind,
      amountCents,
      description: meta.description,
      refType: meta.refType,
      refId: meta.refId,
      userId: ctx.userId,
    },
  });
  await itemEvent(tx, ctx, {
    itemId: it.id,
    type: "COST_ADDED",
    message: `${COST_KIND_LABEL[meta.kind] ?? meta.kind}: ${meta.description}`,
    refType: meta.refType,
    refId: meta.refId,
    data: { amountCents, unitCostBefore: it.unitCostCents, unitCostAfter: newUnit },
  });
}

/**
 * Define o custo de um item com custo desconhecido/estimado (ex.: estoque inicial
 * migrado sem nota). Gera correção explícita no histórico — não altera o passado.
 */
export async function defineItemCost(ctx: Ctx, input: { itemId: string; unitCostCents: number; reason: string }) {
  requirePerm(ctx, "inventory.cost");
  assert(Number.isInteger(input.unitCostCents) && input.unitCostCents >= 0, "Custo inválido.");
  assert(input.reason?.trim().length >= 3, "Explique de onde veio este custo.");
  return withTx(async (tx) => {
    const it = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId } });
    if (!it) throw new NotFoundError("Item");
    assert(it.costStatus !== "KNOWN", "Este item já tem custo conhecido. Use 'Adicionar custo' para custos extras.");
    assert(
      !["SOLD", "DELIVERED", "EXCHANGED", "DISPOSED", "VOID", "DISASSEMBLED", "INSTALLED"].includes(it.status),
      "O custo de itens que já saíram do estoque é corrigido nos relatórios, não no item.",
    );
    const qty = it.tracking === "UNIT" ? 1 : Math.max(1, it.qtyOnHand);
    const delta = (input.unitCostCents - (it.unitCostCents ?? 0)) * qty;
    if (delta !== 0) {
      await applyCostDelta(tx, ctx, it.id, delta, {
        kind: "ADJUSTMENT",
        description: `Custo definido: ${input.reason}`,
        refType: "COST_DEFINITION",
        resolveUnknown: true,
      });
    } else {
      await tx.item.update({ where: { id: it.id }, data: { costStatus: "KNOWN", version: { increment: 1 } } });
      await itemEvent(tx, ctx, { itemId: it.id, type: "COST_ADDED", message: `Custo confirmado: ${input.reason}` });
    }
    await audit(tx, ctx, "item.cost.define", `Custo de ${it.code} definido`, {
      entityType: "Item",
      entityId: it.id,
      data: { before: it.unitCostCents, beforeStatus: it.costStatus, after: input.unitCostCents, reason: input.reason },
    });
    return { ok: true };
  });
}

// ─────────────────────────── Baixa e ajustes de quantidade ───────────────────────────

export const DISPOSAL_REASONS = {
  LOSS: "Perda / extravio",
  DAMAGE: "Dano irrecuperável",
  SCRAP: "Descarte / sucata",
  OWN_USE: "Uso próprio",
  DONATION: "Doação",
  THEFT: "Furto / roubo",
  RETURN_SUPPLIER: "Devolvido ao fornecedor sem reembolso",
  RETURN_OWNER: "Devolvido ao dono (consignação/cliente)",
  OTHER: "Outro motivo",
} as const;

export const disposeSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive().optional(),
  reasonKind: z.enum(Object.keys(DISPOSAL_REASONS) as [keyof typeof DISPOSAL_REASONS, ...(keyof typeof DISPOSAL_REASONS)[]]),
  reason: z.string().trim().min(3).max(500),
  date: z.coerce.date().optional(),
});

/** Baixa de estoque com motivo. Item próprio com custo vira perda no resultado (custo, não valor de venda). */
export async function disposeItem(ctx: Ctx, raw: z.input<typeof disposeSchema>) {
  requirePerm(ctx, "inventory.adjust");
  const input = disposeSchema.parse(raw);
  return withTx(async (tx) => disposeItemTx(tx, ctx, input));
}

export async function disposeItemTx(tx: Tx, ctx: Ctx, input: z.infer<typeof disposeSchema> & { refType?: string; refId?: string }) {
  const it = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId } });
  if (!it) throw new NotFoundError("Item");
  const date = input.date ?? new Date();
  const allowedFrom: ItemStatus[] = ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED", "CONSIGNED_OUT"];
  if (!allowedFrom.includes(it.status)) {
    throw new DomainError(`Item ${STATUS_LABEL[it.status].toLowerCase()} não pode ser baixado. Libere-o da operação primeiro.`);
  }
  if ((it.ownership === "CLIENT" || it.ownership === "CONSIGNED_IN") && input.reasonKind !== "RETURN_OWNER") {
    // Perder item de terceiro é um problema sério; a baixa registra, mas o reembolso ao dono é tratado no financeiro.
  }
  let qty = 1;
  if (it.tracking === "LOT") {
    qty = input.quantity ?? it.qtyOnHand - it.qtyReserved;
    assert(qty > 0, "Informe a quantidade a baixar.");
    await adjustLotQty(tx, ctx, it.id, { onHand: -qty });
  } else {
    await transitionUnits(tx, ctx, [it.id], allowedFrom, "DISPOSED", { exitedAt: date, holdType: null, holdId: null, qtyOnHand: 0 });
    await syncInstalledChildren(tx, ctx, [it.id], date);
  }
  const label = DISPOSAL_REASONS[input.reasonKind];
  const lossCents = it.ownership === "OWNED" && it.unitCostCents !== null ? it.unitCostCents * qty : 0;
  if (it.ownership === "OWNED" && input.reasonKind !== "RETURN_OWNER") {
    await resultEntry(tx, ctx, {
      date,
      kind: "OTHER_EXPENSE",
      amountCents: lossCents,
      description: `Baixa de estoque (${label}): ${it.code} ${it.title}${qty > 1 ? ` × ${qty}` : ""}`,
      refType: input.refType ?? "DISPOSAL",
      refId: input.refId ?? it.id,
      itemId: it.id,
      categoryId: await systemCategoryId(tx, ctx.orgId, "ADJUSTMENT"),
      costStatus: it.costStatus,
    });
  }
  await itemEvent(tx, ctx, {
    itemId: it.id,
    type: "DISPOSED",
    message: `Baixa: ${label}${qty > 1 || it.tracking === "LOT" ? ` (${qty} un.)` : ""}`,
    fromStatus: it.status,
    toStatus: it.tracking === "UNIT" ? "DISPOSED" : undefined,
    qtyDelta: -qty,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId,
    data: { lossCents },
  });
  await audit(tx, ctx, "item.dispose", `Baixa de ${it.code} (${label})`, {
    entityType: "Item",
    entityId: it.id,
    data: { reason: input.reason, qty, lossCents },
  });
  return { lossCents };
}

/** Ajuste de quantidade de lote (contagem). Sobra entra ao custo unitário atual; falta é perda. */
export async function adjustLotQuantity(ctx: Ctx, input: { itemId: string; delta: number; reason: string; refType?: string; refId?: string }) {
  requirePerm(ctx, "inventory.adjust");
  assert(Number.isInteger(input.delta) && input.delta !== 0, "Informe a diferença de quantidade.");
  assert(input.reason?.trim().length >= 3, "Informe o motivo do ajuste.");
  return withTx(async (tx) => adjustLotQuantityTx(tx, ctx, input));
}

export async function adjustLotQuantityTx(tx: Tx, ctx: Ctx, input: { itemId: string; delta: number; reason: string; refType?: string; refId?: string }) {
  const it = await tx.item.findFirst({ where: { id: input.itemId, orgId: ctx.orgId } });
  if (!it) throw new NotFoundError("Item");
  assert(it.tracking === "LOT", "Ajuste de quantidade só vale para itens controlados por lote.");
  await adjustLotQty(tx, ctx, it.id, { onHand: input.delta });
  const valueCents = it.unitCostCents !== null ? Math.abs(input.delta) * it.unitCostCents : 0;
  if (it.ownership === "OWNED") {
    await resultEntry(tx, ctx, {
      date: new Date(),
      kind: input.delta < 0 ? "OTHER_EXPENSE" : "OTHER_INCOME",
      amountCents: valueCents,
      description: `${input.delta < 0 ? "Falta" : "Sobra"} de estoque: ${it.code} ${it.title} (${input.delta > 0 ? "+" : ""}${input.delta} un.)`,
      refType: input.refType ?? "LOT_ADJUSTMENT",
      refId: input.refId ?? it.id,
      itemId: it.id,
      categoryId: await systemCategoryId(tx, ctx.orgId, "ADJUSTMENT"),
      costStatus: it.costStatus,
    });
  }
  await itemEvent(tx, ctx, {
    itemId: it.id,
    type: "ADJUSTED",
    message: `Quantidade ajustada (${input.delta > 0 ? "+" : ""}${input.delta})`,
    qtyDelta: input.delta,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId,
  });
  await audit(tx, ctx, "item.adjust", `Ajuste de quantidade em ${it.code}: ${input.delta}`, {
    entityType: "Item",
    entityId: it.id,
    data: { reason: input.reason },
  });
  return { ok: true };
}

export async function bulkSetPrice(ctx: Ctx, input: { itemIds: string[]; mode: "SET" | "MARGIN"; valueCents?: number; marginPct?: number }) {
  requirePerm(ctx, "inventory.edit");
  if (input.mode === "MARGIN") requirePerm(ctx, "inventory.cost");
  return withTx(async (tx) => {
    const items = await tx.item.findMany({ where: { orgId: ctx.orgId, id: { in: input.itemIds } } });
    let updated = 0;
    for (const it of items) {
      let price: number | null = null;
      if (input.mode === "SET") price = input.valueCents ?? null;
      else if (it.unitCostCents !== null && it.costStatus !== "UNKNOWN") {
        const m = (input.marginPct ?? 0) / 100;
        assert(m < 0.95, "Margem inválida.");
        // Margem sobre o preço de venda: preço = custo / (1 - margem), arredondado para cima em R$ 1.
        price = Math.ceil(it.unitCostCents / (1 - m) / 100) * 100;
      }
      if (price === null) continue;
      await tx.item.update({ where: { id: it.id }, data: { expectedPriceCents: price, version: { increment: 1 } } });
      await itemEvent(tx, ctx, {
        itemId: it.id,
        type: "PRICE_CHANGED",
        message: `Preço pretendido: ${(price / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        data: { before: it.expectedPriceCents, after: price },
      });
      updated++;
    }
    await audit(tx, ctx, "item.bulk_price", `Preço atualizado em ${updated} item(ns)`);
    return { updated };
  });
}

export async function addNote(ctx: Ctx, input: { entityType: string; entityId: string; body: string }) {
  assert(input.body?.trim().length > 0, "Escreva a anotação.");
  const NOTE_PERMS: Record<string, Parameters<typeof requirePerm>[1]> = {
    Item: "inventory.view",
    Contact: "contacts.manage",
    Sale: "sales.manage",
    Trade: "trades.manage",
    Build: "builds.manage",
    Purchase: "purchases.manage",
  };
  const perm = NOTE_PERMS[input.entityType];
  assert(perm, "Tipo de anotação inválido.");
  if (!(input.entityType === "Contact" && (hasPerm(ctx, "purchases.manage") || hasPerm(ctx, "trades.manage")))) requirePerm(ctx, perm);
  return withTx(async (tx) => {
    if (input.entityType === "Contact") {
      const c = await tx.contact.findFirst({ where: { id: input.entityId, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Contato");
    }
    const note = await tx.note.create({
      data: { orgId: ctx.orgId, entityType: input.entityType, entityId: input.entityId, body: input.body.trim().slice(0, 4000), userId: ctx.userId },
    });
    if (input.entityType === "Item") {
      const it = await tx.item.findFirst({ where: { id: input.entityId, orgId: ctx.orgId } });
      if (!it) throw new NotFoundError("Item");
      await itemEvent(tx, ctx, { itemId: it.id, type: "NOTE", message: input.body.trim().slice(0, 300) });
    }
    return { id: note.id };
  });
}
