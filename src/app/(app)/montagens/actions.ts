"use server";

import type { z } from "zod";
import { act } from "@/server/action";
import {
  saveBuild,
  buildSchema,
  addBuildPart,
  removeBuildPart,
  addBuildExpense,
  buildExpenseSchema,
  removeBuildExpense,
  setBuildStage,
  completeBuild,
  cancelBuild,
  disassemble,
  disassemblySchema,
} from "@/server/domain/builds";
import { addNote } from "@/server/domain/items";

export async function saveBuildAction(input: z.input<typeof buildSchema>) {
  return act(({ ctx }) => saveBuild(ctx, input), "Montagem salva");
}

export async function addPartAction(input: { buildId: string; itemId: string; quantity?: number; role?: string | null }) {
  return act(({ ctx }) => addBuildPart(ctx, input), "Peça reservada para a montagem");
}

export async function removePartAction(input: { buildId: string; partId: string; reason: string; outcome: "AVAILABLE" | "DEFECTIVE" }) {
  return act(({ ctx }) => removeBuildPart(ctx, input), "Peça retirada");
}

export async function addExpenseAction(input: z.input<typeof buildExpenseSchema>) {
  return act(({ ctx }) => addBuildExpense(ctx, input), "Despesa registrada");
}

export async function removeExpenseAction(input: { buildId: string; expenseId: string; reason: string; refundAccountId?: string | null }) {
  return act(({ ctx }) => removeBuildExpense(ctx, input), "Despesa removida");
}

export async function setStageAction(input: { buildId: string; status: "PLANNING" | "ASSEMBLING" | "TESTING" }) {
  return act(({ ctx }) => setBuildStage(ctx, input), "Etapa atualizada");
}

export async function completeBuildAction(input: { buildId: string; title?: string | null; locationId?: string | null; expectedPriceCents?: number | null; idempotencyKey?: string }) {
  return act(({ ctx }) => completeBuild(ctx, input), "Montagem concluída — PC disponível no estoque");
}

export async function cancelBuildAction(input: { buildId: string; reason: string }) {
  return act(({ ctx }) => cancelBuild(ctx, input), "Montagem cancelada");
}

export async function disassembleAction(input: z.input<typeof disassemblySchema>) {
  return act(({ ctx }) => disassemble(ctx, input), "PC desmontado — peças no estoque");
}

export async function buildNoteAction(buildId: string, body: string) {
  return act(({ ctx }) => addNote(ctx, { entityType: "Build", entityId: buildId, body }), "Anotação salva");
}
