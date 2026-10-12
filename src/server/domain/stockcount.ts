import { z } from "zod";
import { requirePerm, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, assert } from "../errors";
import { audit, nextCode } from "./shared";
import { moveItemsTx, disposeItemTx, adjustLotQuantityTx } from "./items";
import type { ItemStatus } from "@/generated/prisma/client";

/** Itens que devem estar fisicamente no local (instalados são contados dentro do PC). */
const COUNTABLE: ItemStatus[] = ["AVAILABLE", "RESERVED", "INSPECTION", "DEFECTIVE", "IN_BUILD", "IN_NEGOTIATION", "SOLD", "RETURNED"];

async function descendantLocationIds(orgId: string, rootId: string, tx: Parameters<Parameters<typeof withTx>[0]>[0]) {
  const all = await tx.location.findMany({ where: { orgId }, select: { id: true, parentId: true } });
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of all) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); grew = true; }
  }
  return [...ids];
}

export async function startCount(ctx: Ctx, input: { name: string; locationId?: string | null; notes?: string | null }) {
  requirePerm(ctx, "inventory.adjust");
  assert(input.name?.trim().length >= 2, "Dê um nome à contagem.");
  return withTx(async (tx) => {
    let scope: string[] | null = null;
    if (input.locationId) {
      const loc = await tx.location.findFirst({ where: { id: input.locationId, orgId: ctx.orgId } });
      if (!loc) throw new NotFoundError("Local");
      scope = await descendantLocationIds(ctx.orgId, loc.id, tx);
    }
    const code = await nextCode(tx, ctx.orgId, "count");
    const count = await tx.stockCount.create({
      data: { orgId: ctx.orgId, code, name: input.name.trim(), locationId: input.locationId ?? null, notes: input.notes ?? null, createdById: ctx.userId },
    });
    const items = await tx.item.findMany({
      where: { orgId: ctx.orgId, status: { in: COUNTABLE }, ...(scope ? { locationId: { in: scope } } : {}) },
      select: { id: true, locationId: true, qtyOnHand: true },
    });
    if (items.length) {
      await tx.stockCountLine.createMany({
        data: items.map((i) => ({ orgId: ctx.orgId, countId: count.id, itemId: i.id, expectedLocationId: i.locationId, expectedQty: i.qtyOnHand })),
      });
    }
    await audit(tx, ctx, "count.start", `Inventário ${code} iniciado (${items.length} itens esperados)`, { entityType: "StockCount", entityId: count.id });
    return { id: count.id, code, expected: items.length };
  });
}

/**
 * Registra um item encontrado (por código, QR ou número de série) em determinado local.
 * Item de outro local → "Lugar errado"; item fora do escopo → "Inesperado".
 */
export async function scanCountItem(ctx: Ctx, input: { countId: string; code: string; foundLocationId?: string | null; countedQty?: number | null }) {
  requirePerm(ctx, "inventory.adjust");
  return withTx(async (tx) => {
    const count = await tx.stockCount.findFirst({ where: { id: input.countId, orgId: ctx.orgId } });
    if (!count) throw new NotFoundError("Contagem");
    if (count.status !== "OPEN") throw new DomainError("Esta contagem já foi encerrada.");
    const raw = input.code.trim();
    const code = raw.includes("/") ? raw.split("/").pop()!.trim() : raw;
    const item =
      (await tx.item.findFirst({ where: { orgId: ctx.orgId, code: { equals: code, mode: "insensitive" } } })) ??
      (await tx.item.findFirst({ where: { orgId: ctx.orgId, serial: { equals: code, mode: "insensitive" } }, orderBy: { createdAt: "desc" } }));
    if (!item) {
      return { result: "NOT_FOUND" as const, message: `Nenhum item com código ou série "${code}".` };
    }
    const found = input.foundLocationId ?? count.locationId ?? null;
    const counted = item.tracking === "LOT" ? input.countedQty ?? item.qtyOnHand : 1;
    const existing = await tx.stockCountLine.findUnique({ where: { countId_itemId: { countId: count.id, itemId: item.id } } });
    let result: string;
    if (existing) {
      result =
        found && existing.expectedLocationId !== found
          ? "WRONG_LOCATION"
          : item.tracking === "LOT" && counted !== existing.expectedQty
            ? "QTY_DIFF"
            : "FOUND";
      await tx.stockCountLine.update({ where: { id: existing.id }, data: { foundLocationId: found, countedQty: counted, result, scannedCode: raw } });
    } else {
      result = item.locationId !== found ? "WRONG_LOCATION" : "UNEXPECTED";
      if (!COUNTABLE.includes(item.status)) result = "UNEXPECTED";
      await tx.stockCountLine.create({
        data: {
          orgId: ctx.orgId,
          countId: count.id,
          itemId: item.id,
          scannedCode: raw,
          expectedLocationId: item.locationId,
          foundLocationId: found,
          expectedQty: COUNTABLE.includes(item.status) ? item.qtyOnHand : 0,
          countedQty: counted,
          result,
        },
      });
    }
    return { result, itemId: item.id, code: item.code, title: item.title, status: item.status };
  });
}

export async function setCountLine(ctx: Ctx, input: { lineId: string; countedQty: number | null; foundLocationId?: string | null }) {
  requirePerm(ctx, "inventory.adjust");
  return withTx(async (tx) => {
    const line = await tx.stockCountLine.findFirst({ where: { id: input.lineId, orgId: ctx.orgId }, include: { count: true } });
    if (!line) throw new NotFoundError("Linha");
    if (line.count.status !== "OPEN") throw new DomainError("Contagem encerrada.");
    const found = input.foundLocationId === undefined ? line.expectedLocationId : input.foundLocationId;
    let result = "PENDING";
    if (input.countedQty === 0) result = "MISSING";
    else if (input.countedQty !== null) {
      result = found !== line.expectedLocationId ? "WRONG_LOCATION" : input.countedQty !== line.expectedQty ? "QTY_DIFF" : "FOUND";
    }
    await tx.stockCountLine.update({ where: { id: line.id }, data: { countedQty: input.countedQty, foundLocationId: found, result } });
    return { result };
  });
}

export const closeCountSchema = z.object({
  countId: z.string(),
  resolutions: z.array(
    z.object({
      lineId: z.string(),
      action: z.enum(["MOVE", "ADJUST", "DISPOSE", "KEEP", "IGNORE"]),
      note: z.string().trim().max(500).optional().nullable(),
    }),
  ),
});

/**
 * Encerra a contagem aplicando as resoluções escolhidas. Nada é corrigido em silêncio:
 * cada movimentação/ajuste/baixa gera evento com referência ao inventário e motivo.
 */
export async function closeCount(ctx: Ctx, raw: z.input<typeof closeCountSchema>) {
  requirePerm(ctx, "inventory.adjust");
  const input = closeCountSchema.parse(raw);
  return withTx(
    async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id: input.countId, orgId: ctx.orgId }, include: { lines: true } });
      if (!count) throw new NotFoundError("Contagem");
      if (count.status !== "OPEN") throw new DomainError("Esta contagem já foi encerrada.");
      const ref = { refType: "STOCK_COUNT", refId: count.id };
      // Itens esperados e não encontrados viram "Faltando".
      await tx.stockCountLine.updateMany({ where: { countId: count.id, result: "PENDING" }, data: { result: "MISSING", countedQty: 0 } });
      const lines = await tx.stockCountLine.findMany({ where: { countId: count.id } });
      const summary = { moved: 0, adjusted: 0, disposed: 0, kept: 0 };
      for (const r of input.resolutions) {
        const line = lines.find((l) => l.id === r.lineId);
        if (!line || !line.itemId) continue;
        const reason = `Inventário ${count.code}${r.note ? `: ${r.note}` : ""}`;
        if (r.action === "MOVE") {
          assert(line.result === "WRONG_LOCATION" || line.result === "UNEXPECTED", "Só itens encontrados em outro local podem ser movidos.");
          await moveItemsTx(tx, ctx, { itemIds: [line.itemId], locationId: line.foundLocationId, reason, ...ref });
          summary.moved++;
        } else if (r.action === "ADJUST") {
          assert(line.result === "QTY_DIFF" && line.countedQty !== null, "Ajuste de quantidade só para lotes com diferença.");
          await adjustLotQuantityTx(tx, ctx, { itemId: line.itemId, delta: line.countedQty - line.expectedQty, reason, ...ref });
          summary.adjusted++;
        } else if (r.action === "DISPOSE") {
          assert(line.result === "MISSING", "Baixa por inventário só para itens não encontrados.");
          assert(r.note && r.note.length >= 3, "Explique a baixa do item não encontrado.");
          await disposeItemTx(tx, ctx, { itemId: line.itemId, reasonKind: "LOSS", reason, ...ref });
          summary.disposed++;
        } else if (r.action === "KEEP") {
          summary.kept++;
        }
        await tx.stockCountLine.update({ where: { id: line.id }, data: { resolution: r.action, resolutionNote: r.note ?? null, resolvedAt: new Date() } });
      }
      await tx.stockCount.update({ where: { id: count.id }, data: { status: "CLOSED", closedAt: new Date() } });
      await audit(tx, ctx, "count.close", `Inventário ${count.code} encerrado`, { entityType: "StockCount", entityId: count.id, data: summary });
      return summary;
    },
    { timeoutMs: 60_000 },
  );
}

export async function cancelCount(ctx: Ctx, countId: string) {
  requirePerm(ctx, "inventory.adjust");
  return withTx(async (tx) => {
    const n = await tx.stockCount.updateMany({ where: { id: countId, orgId: ctx.orgId, status: "OPEN" }, data: { status: "CANCELLED", closedAt: new Date() } });
    if (n.count !== 1) throw new DomainError("Contagem não está aberta.");
    await audit(tx, ctx, "count.cancel", "Contagem cancelada", { entityType: "StockCount", entityId: countId });
    return { ok: true };
  });
}
