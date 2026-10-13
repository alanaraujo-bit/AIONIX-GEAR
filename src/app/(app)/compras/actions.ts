"use server";

import { act } from "@/server/action";
import { savePurchase, confirmPurchase, cancelPurchase, type PurchaseInput } from "@/server/domain/purchases";
import { addNote } from "@/server/domain/items";
import { parseDateInput } from "@/lib/dates";

export async function savePurchaseAction(input: Omit<PurchaseInput, "date"> & { dateInput: string }) {
  const { dateInput, ...rest } = input;
  return act(({ ctx, tz }) => savePurchase(ctx, { ...rest, date: parseDateInput(dateInput, tz) ?? new Date() }), input.confirm ? "Compra confirmada — itens no estoque" : "Rascunho salvo");
}

export async function confirmPurchaseAction(input: { id: string; payment: { now: { amountCents: number; accountId: string; method: string }[]; remainder?: { installments: number; firstDueDate: Date } | null }; idempotencyKey?: string }) {
  return act(({ ctx }) => confirmPurchase(ctx, input as never), "Compra confirmada — itens no estoque");
}

export async function cancelPurchaseAction(input: { id: string; reason: string; refundAccountId?: string | null }) {
  return act(({ ctx }) => cancelPurchase(ctx, input), "Compra cancelada");
}

export async function purchaseNoteAction(id: string, body: string) {
  return act(({ ctx }) => addNote(ctx, { entityType: "Purchase", entityId: id, body }), "Anotação salva");
}
