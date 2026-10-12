"use server";

import type { z } from "zod";
import { act } from "@/server/action";
import { startCount, scanCountItem, setCountLine, closeCount, closeCountSchema, cancelCount } from "@/server/domain/stockcount";

export async function startCountAction(input: { name: string; locationId?: string | null; notes?: string | null }) {
  return act(({ ctx }) => startCount(ctx, input), "Contagem iniciada");
}
export async function scanCountAction(input: { countId: string; code: string; foundLocationId?: string | null; countedQty?: number | null }) {
  return act(({ ctx }) => scanCountItem(ctx, input));
}
export async function setCountLineAction(input: { lineId: string; countedQty: number | null; foundLocationId?: string | null }) {
  return act(({ ctx }) => setCountLine(ctx, input));
}
export async function closeCountAction(input: z.input<typeof closeCountSchema>) {
  return act(({ ctx }) => closeCount(ctx, input), "Inventário encerrado e ajustes aplicados");
}
export async function cancelCountAction(countId: string) {
  return act(({ ctx }) => cancelCount(ctx, countId), "Contagem cancelada");
}
