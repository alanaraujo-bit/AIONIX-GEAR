import type { Tx } from "../db";
import type { Ctx } from "../context";
import type { ItemStatus, CostStatus } from "@/generated/prisma/client";
import { ConflictError, NotFoundError } from "../errors";

/** Prefixos de numeração legível. */
export const CODE_PREFIX = {
  item: "GX",
  purchase: "C",
  sale: "V",
  trade: "T",
  build: "M",
  disassembly: "D",
  count: "INV",
} as const;

export async function nextCode(tx: Tx, orgId: string, key: keyof typeof CODE_PREFIX, pad = 4): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("orgId", "key", "value") VALUES (${orgId}, ${key}, 1)
    ON CONFLICT ("orgId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${CODE_PREFIX[key]}-${String(rows[0].value).padStart(pad, "0")}`;
}

export async function audit(
  tx: Tx,
  ctx: Ctx,
  action: string,
  summary: string,
  extra?: { entityType?: string; entityId?: string; data?: unknown },
) {
  await tx.auditLog.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action,
      summary,
      entityType: extra?.entityType,
      entityId: extra?.entityId,
      data: extra?.data === undefined ? undefined : JSON.parse(JSON.stringify(extra.data)),
      ip: ctx.ip ?? undefined,
    },
  });
}

export type EventInput = {
  itemId: string;
  type: string;
  message: string;
  fromStatus?: ItemStatus | null;
  toStatus?: ItemStatus | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  qtyDelta?: number | null;
  refType?: string | null;
  refId?: string | null;
  reason?: string | null;
  data?: unknown;
};

export async function itemEvent(tx: Tx, ctx: Ctx, e: EventInput) {
  await tx.itemEvent.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      itemId: e.itemId,
      type: e.type,
      message: e.message,
      fromStatus: e.fromStatus ?? undefined,
      toStatus: e.toStatus ?? undefined,
      fromLocationId: e.fromLocationId ?? undefined,
      toLocationId: e.toLocationId ?? undefined,
      qtyDelta: e.qtyDelta ?? undefined,
      refType: e.refType ?? undefined,
      refId: e.refId ?? undefined,
      reason: e.reason ?? undefined,
      data: e.data === undefined ? undefined : JSON.parse(JSON.stringify(e.data)),
    },
  });
}

/**
 * Transição de status condicional e atômica para unidades. Só altera itens que
 * estão em um dos status de origem; se algum não estiver, nada é alterado e um
 * ConflictError explica qual item ficou indisponível. É isso que impede venda
 * dupla e uso simultâneo do mesmo item em venda/montagem/catira.
 */
export async function transitionUnits(
  tx: Tx,
  ctx: Ctx,
  itemIds: string[],
  from: ItemStatus[],
  to: ItemStatus,
  data: {
    holdType?: string | null;
    holdId?: string | null;
    holdUntil?: Date | null;
    requireHold?: { type: string; id: string } | null;
    exitedAt?: Date | null;
    parentItemId?: string | null;
    qtyOnHand?: number;
  } = {},
) {
  if (itemIds.length === 0) return;
  const unique = [...new Set(itemIds)];
  const where = {
    orgId: ctx.orgId,
    id: { in: unique },
    status: { in: from },
    tracking: "UNIT" as const,
    ...(data.requireHold ? { holdType: data.requireHold.type, holdId: data.requireHold.id } : {}),
  };
  const res = await tx.item.updateMany({
    where,
    data: {
      status: to,
      holdType: data.holdType === undefined ? undefined : data.holdType,
      holdId: data.holdId === undefined ? undefined : data.holdId,
      holdUntil: data.holdUntil === undefined ? undefined : data.holdUntil,
      exitedAt: data.exitedAt === undefined ? undefined : data.exitedAt,
      parentItemId: data.parentItemId === undefined ? undefined : data.parentItemId,
      qtyOnHand: data.qtyOnHand,
      version: { increment: 1 },
    },
  });
  if (res.count !== unique.length) {
    const current = await tx.item.findMany({
      where: { orgId: ctx.orgId, id: { in: unique } },
      select: { id: true, code: true, title: true, status: true },
    });
    const bad = current.filter((i) => !from.includes(i.status));
    const missing = unique.filter((id) => !current.find((c) => c.id === id));
    if (missing.length) throw new NotFoundError("Item");
    const names = bad.map((i) => `${i.code} (${STATUS_LABEL[i.status]})`).join(", ");
    throw new ConflictError(
      names
        ? `Item indisponível para esta operação: ${names}. Ele pode ter sido vendido, reservado ou usado em outra operação.`
        : "Um dos itens mudou de situação durante a operação. Recarregue e tente novamente.",
    );
  }
}

/** Movimenta quantidade de lotes com checagem no banco (CHECK item_qty_nonneg). */
export async function adjustLotQty(
  tx: Tx,
  ctx: Ctx,
  itemId: string,
  deltas: { onHand?: number; reserved?: number },
) {
  const onHand = deltas.onHand ?? 0;
  const reserved = deltas.reserved ?? 0;
  const n = await tx.$executeRaw`
    UPDATE "Item" SET "qtyOnHand" = "qtyOnHand" + ${onHand}, "qtyReserved" = "qtyReserved" + ${reserved},
      "version" = "version" + 1, "updatedAt" = now()
    WHERE "id" = ${itemId} AND "orgId" = ${ctx.orgId} AND "tracking" = 'LOT'
      AND "qtyOnHand" + ${onHand} >= 0 AND "qtyReserved" + ${reserved} >= 0
      AND "qtyReserved" + ${reserved} <= "qtyOnHand" + ${onHand}`;
  if (n !== 1) {
    throw new ConflictError("Quantidade insuficiente disponível neste lote.");
  }
  const after = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { qtyOnHand: true, status: true } });
  // Lote zerado sai do estoque disponível; lote que volta a ter saldo retorna.
  if (after.qtyOnHand === 0 && after.status === "AVAILABLE") {
    await tx.item.update({ where: { id: itemId }, data: { status: "DISPOSED", exitedAt: new Date() } });
  } else if (after.qtyOnHand > 0 && after.status === "DISPOSED") {
    await tx.item.update({ where: { id: itemId }, data: { status: "AVAILABLE", exitedAt: null } });
  }
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  INSPECTION: "Aguardando inspeção",
  DEFECTIVE: "Com defeito",
  IN_BUILD: "Em montagem",
  IN_NEGOTIATION: "Em negociação",
  CONSIGNED_OUT: "Consignado",
  INSTALLED: "Instalado em PC",
  SOLD: "Vendido",
  DELIVERED: "Entregue",
  RETURNED: "Devolvido",
  EXCHANGED: "Trocado (catira)",
  DISASSEMBLED: "Desmontado",
  DISPOSED: "Baixado",
  VOID: "Anulado",
};

/** Status em que o item ainda está fisicamente sob nossa guarda (estoque físico). */
export const PHYSICAL_STATUSES: ItemStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "INSPECTION",
  "DEFECTIVE",
  "IN_BUILD",
  "IN_NEGOTIATION",
  "SOLD",
  "RETURNED",
];

/** Status em que o item ainda é ativo do negócio (entra no valor de estoque se próprio). */
export const ON_BOOKS_STATUSES: ItemStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "INSPECTION",
  "DEFECTIVE",
  "IN_BUILD",
  "IN_NEGOTIATION",
  "CONSIGNED_OUT",
  "RETURNED",
];

export function combineCostStatus(statuses: (CostStatus | null | undefined)[]): CostStatus {
  if (statuses.some((s) => s === "UNKNOWN" || s == null)) return "UNKNOWN";
  if (statuses.some((s) => s === "ESTIMATED")) return "ESTIMATED";
  return "KNOWN";
}

export async function resultEntry(
  tx: Tx,
  ctx: Ctx,
  e: {
    date: Date;
    kind: "REVENUE" | "COGS" | "SALES_EXPENSE" | "OPERATING_EXPENSE" | "OTHER_INCOME" | "OTHER_EXPENSE";
    amountCents: number;
    description: string;
    refType?: string;
    refId?: string;
    itemId?: string | null;
    saleId?: string | null;
    tradeId?: string | null;
    buildId?: string | null;
    contactId?: string | null;
    categoryId?: string | null;
    costStatus?: CostStatus | null;
  },
) {
  if (e.amountCents === 0 && e.kind !== "COGS") return null;
  return tx.resultEntry.create({
    data: {
      orgId: ctx.orgId,
      createdById: ctx.userId,
      date: e.date,
      kind: e.kind,
      amountCents: e.amountCents,
      description: e.description,
      refType: e.refType,
      refId: e.refId,
      itemId: e.itemId ?? undefined,
      saleId: e.saleId ?? undefined,
      tradeId: e.tradeId ?? undefined,
      buildId: e.buildId ?? undefined,
      contactId: e.contactId ?? undefined,
      categoryId: e.categoryId ?? undefined,
      costStatus: e.costStatus ?? undefined,
    },
  });
}

/** Estorna (lançamento oposto) todos os lançamentos de resultado ainda não estornados de uma origem. */
export async function reverseResultEntries(
  tx: Tx,
  ctx: Ctx,
  where: { refType: string; refId: string },
  date: Date,
  reason: string,
  kinds?: string[],
) {
  const entries = await tx.resultEntry.findMany({
    where: { orgId: ctx.orgId, refType: where.refType, refId: where.refId, reversalOfId: null, ...(kinds ? { kind: { in: kinds } } : {}) },
  });
  const reversedIds = new Set(
    (
      await tx.resultEntry.findMany({
        where: { orgId: ctx.orgId, reversalOfId: { in: entries.map((e) => e.id) } },
        select: { reversalOfId: true },
      })
    ).map((r) => r.reversalOfId),
  );
  for (const e of entries) {
    if (reversedIds.has(e.id)) continue;
    await tx.resultEntry.create({
      data: {
        orgId: ctx.orgId,
        createdById: ctx.userId,
        date,
        kind: e.kind,
        amountCents: -e.amountCents,
        description: `Estorno: ${e.description} — ${reason}`,
        refType: e.refType,
        refId: e.refId,
        itemId: e.itemId,
        saleId: e.saleId,
        tradeId: e.tradeId,
        buildId: e.buildId,
        contactId: e.contactId,
        categoryId: e.categoryId,
        costStatus: e.costStatus,
        reversalOfId: e.id,
      },
    });
  }
}
