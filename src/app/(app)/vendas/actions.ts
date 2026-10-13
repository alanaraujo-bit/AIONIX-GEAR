"use server";

import type { z } from "zod";
import { act } from "@/server/action";
import { saveSale, confirmQuote, markDelivered, cancelSale, returnSale, returnSchema, shareSale, updateAfterSales, type SaleInput } from "@/server/domain/sales";
import { addNote } from "@/server/domain/items";
import { parseDateInput } from "@/lib/dates";

export async function saveSaleAction(input: Omit<SaleInput, "date" | "quoteValidUntil"> & { dateInput: string; validUntilInput?: string | null }) {
  const { dateInput, validUntilInput, ...rest } = input;
  return act(
    ({ ctx, tz }) =>
      saveSale(ctx, {
        ...rest,
        date: parseDateInput(dateInput, tz) ?? new Date(),
        quoteValidUntil: validUntilInput ? new Date((parseDateInput(validUntilInput, tz) ?? new Date()).getTime() + 11 * 3600_000) : null,
      }),
    input.action === "QUOTE" ? "Orçamento salvo" : "Venda fechada",
  );
}

export async function confirmQuoteAction(input: { saleId: string; dateInput: string; delivered: boolean; payment?: SaleInput["payment"]; idempotencyKey?: string }) {
  return act(({ ctx, tz }) => confirmQuote(ctx, { ...input, date: parseDateInput(input.dateInput, tz) ?? new Date() }), "Orçamento convertido em venda");
}

export async function deliverAction(saleId: string) {
  return act(({ ctx }) => markDelivered(ctx, { saleId }), "Entrega registrada");
}

export async function cancelSaleAction(input: { saleId: string; reason: string; refundAccountId?: string | null }) {
  return act(({ ctx }) => cancelSale(ctx, input), "Cancelamento registrado");
}

export async function returnSaleAction(input: z.input<typeof returnSchema> & { dateInput?: string }) {
  return act(({ ctx, tz }) => returnSale(ctx, { ...input, date: input.dateInput ? parseDateInput(input.dateInput, tz) ?? undefined : undefined }), "Devolução registrada");
}

export async function shareSaleAction(saleId: string, enable: boolean) {
  return act(({ ctx }) => shareSale(ctx, saleId, enable), enable ? "Link público criado" : "Link público desativado");
}

export async function afterSalesAction(saleId: string, text: string) {
  return act(({ ctx }) => updateAfterSales(ctx, { saleId, afterSalesNotes: text }), "Pós-venda salvo");
}

export async function saleNoteAction(saleId: string, body: string) {
  return act(({ ctx }) => addNote(ctx, { entityType: "Sale", entityId: saleId, body }), "Anotação salva");
}
