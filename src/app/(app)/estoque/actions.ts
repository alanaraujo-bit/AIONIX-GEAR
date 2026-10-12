"use server";

import type { z } from "zod";
import { act } from "@/server/action";
import { prisma } from "@/server/db";
import { withTx, requirePerm } from "@/server/context";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/domain/shared";
import {
  createItem,
  createItemSchema,
  updateItem,
  updateItemSchema,
  moveItems,
  changeStatus,
  addItemCost,
  addCostSchema,
  defineItemCost,
  disposeItem,
  disposeSchema,
  adjustLotQuantity,
  bulkSetPrice,
  addNote,
} from "@/server/domain/items";
import { savePurchase, type PurchaseInput } from "@/server/domain/purchases";
import type { ItemStatus } from "@/generated/prisma/client";
import { parseDateInput } from "@/lib/dates";

export async function createItemAction(input: z.input<typeof createItemSchema>) {
  return act(({ ctx }) => createItem(ctx, input), "Item cadastrado");
}

/** "Comprei agora": registra a compra (com pagamento) e cria o item em uma única operação. */
export async function quickPurchaseAction(input: Omit<PurchaseInput, "date"> & { dateInput: string }) {
  return act(async ({ ctx, tz }) => {
    const { dateInput, ...rest } = input;
    const r = await savePurchase(ctx, { ...rest, date: parseDateInput(dateInput, tz) ?? new Date(), confirm: true });
    return { purchaseId: r.id, code: r.code, itemId: r.items[0]?.id ?? null, items: r.items };
  }, "Compra registrada");
}

export async function updateItemAction(input: z.input<typeof updateItemSchema>) {
  return act(({ ctx }) => updateItem(ctx, input), "Alterações salvas");
}

export async function moveItemsAction(input: { itemIds: string[]; locationId: string | null; reason?: string | null }) {
  return act(({ ctx }) => moveItems(ctx, input), "Local atualizado");
}

export async function changeStatusAction(input: { itemId: string; to: ItemStatus; reason?: string | null; holderContactId?: string | null }) {
  return act(({ ctx }) => changeStatus(ctx, input), "Situação atualizada");
}

export async function addCostAction(input: z.input<typeof addCostSchema> & { dateInput?: string }) {
  return act(({ ctx, tz }) => addItemCost(ctx, { ...input, date: input.dateInput ? parseDateInput(input.dateInput, tz) ?? undefined : undefined }), "Custo adicionado");
}

export async function defineCostAction(input: { itemId: string; unitCostCents: number; reason: string }) {
  return act(({ ctx }) => defineItemCost(ctx, input), "Custo definido");
}

export async function disposeAction(input: z.input<typeof disposeSchema>) {
  return act(({ ctx }) => disposeItem(ctx, input), "Baixa registrada");
}

export async function adjustLotAction(input: { itemId: string; delta: number; reason: string }) {
  return act(({ ctx }) => adjustLotQuantity(ctx, input), "Quantidade ajustada");
}

export async function bulkPriceAction(input: { itemIds: string[]; mode: "SET" | "MARGIN"; valueCents?: number; marginPct?: number }) {
  return act(({ ctx }) => bulkSetPrice(ctx, input), "Preços atualizados");
}

export async function itemNoteAction(itemId: string, body: string) {
  return act(({ ctx }) => addNote(ctx, { entityType: "Item", entityId: itemId, body }), "Anotação salva");
}

export async function saveViewAction(input: { name: string; query: string }) {
  return act(async ({ ctx }) => {
    const name = input.name.trim().slice(0, 60);
    if (name.length < 2) throw new DomainError("Dê um nome à visão.");
    const v = await prisma.savedView.create({ data: { orgId: ctx.orgId, userId: ctx.userId, module: "items", name, query: input.query.slice(0, 1000) } });
    return { id: v.id };
  }, "Visão salva");
}

export async function deleteViewAction(id: string) {
  return act(async ({ ctx }) => {
    const n = await prisma.savedView.deleteMany({ where: { id, orgId: ctx.orgId } });
    if (!n.count) throw new NotFoundError("Visão");
    return null;
  }, "Visão removida");
}

// ─────────────── Locais ───────────────

export async function saveLocationAction(input: { id?: string | null; name: string; kind: string; parentId?: string | null; code?: string | null; description?: string | null }) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "inventory.edit");
    const name = input.name.trim();
    if (name.length < 1) throw new DomainError("Dê um nome ao local.");
    return withTx(async (tx) => {
      if (input.parentId) {
        const p = await tx.location.findFirst({ where: { id: input.parentId, orgId: ctx.orgId } });
        if (!p) throw new NotFoundError("Local");
        // Impede ciclo (um local dentro dele mesmo)
        let cur: string | null = p.id;
        for (let i = 0; cur && i < 20; i++) {
          if (cur === input.id) throw new DomainError("Um local não pode ficar dentro dele mesmo.");
          cur = (await tx.location.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
        }
      }
      const data = { name, kind: input.kind as never, parentId: input.parentId || null, code: input.code || null, description: input.description || null };
      if (input.id) {
        const n = await tx.location.updateMany({ where: { id: input.id, orgId: ctx.orgId }, data });
        if (!n.count) throw new NotFoundError("Local");
        await audit(tx, ctx, "location.update", `Local atualizado: ${name}`, { entityType: "Location", entityId: input.id });
        return { id: input.id };
      }
      const l = await tx.location.create({ data: { ...data, orgId: ctx.orgId } });
      await audit(tx, ctx, "location.create", `Local criado: ${name}`, { entityType: "Location", entityId: l.id });
      return { id: l.id };
    });
  }, "Local salvo");
}

export async function archiveLocationAction(id: string, archived: boolean) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "inventory.edit");
    if (archived) {
      const inUse = await prisma.item.count({ where: { orgId: ctx.orgId, locationId: id, status: { notIn: ["DELIVERED", "EXCHANGED", "DISASSEMBLED", "DISPOSED", "VOID"] } } });
      if (inUse) throw new DomainError(`Há ${inUse} item(ns) neste local. Mova-os antes de arquivar.`);
    }
    const n = await prisma.location.updateMany({ where: { id, orgId: ctx.orgId }, data: { archived } });
    if (!n.count) throw new NotFoundError("Local");
    return null;
  }, archived ? "Local arquivado" : "Local reativado");
}
