"use server";

import type { z } from "zod";
import { act } from "@/server/action";
import { saveTrade, previewTrade, confirmTrade, cancelTrade, confirmTradeSchema, type TradeInput } from "@/server/domain/trades";
import { addNote } from "@/server/domain/items";
import { parseDateInput } from "@/lib/dates";

export async function saveTradeAction(input: Omit<TradeInput, "date"> & { dateInput: string }) {
  const { dateInput, ...rest } = input;
  return act(({ ctx, tz }) => saveTrade(ctx, { ...rest, date: parseDateInput(dateInput, tz) ?? new Date() }), input.status === "NEGOTIATING" ? "Proposta salva — itens bloqueados na negociação" : "Rascunho salvo");
}

export async function previewTradeAction(input: Omit<TradeInput, "date">) {
  return act(({ ctx }) => previewTrade(ctx, { ...input, date: new Date() }));
}

export async function confirmTradeAction(input: z.input<typeof confirmTradeSchema>) {
  return act(({ ctx }) => confirmTrade(ctx, input), "Catira confirmada");
}

export async function cancelTradeAction(input: { tradeId: string; reason: string; refundAccountId?: string | null }) {
  return act(({ ctx }) => cancelTrade(ctx, input), "Catira cancelada");
}

export async function tradeNoteAction(tradeId: string, body: string) {
  return act(({ ctx }) => addNote(ctx, { entityType: "Trade", entityId: tradeId, body }), "Anotação salva");
}
