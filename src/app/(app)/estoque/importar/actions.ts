"use server";

import { act } from "@/server/action";
import { previewImport, applyImport, revertImport, guessMapping, IMPORT_FIELDS, type ImportMapping } from "@/server/domain/imports";

export async function previewImportAction(input: { headers: string[]; rows: Record<string, string>[]; mapping?: ImportMapping | null }) {
  return act(async ({ ctx }) => {
    const mapping = input.mapping ?? guessMapping(input.headers);
    const preview = await previewImport(ctx, { rows: input.rows, mapping });
    return { mapping, preview, fields: IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label, required: "required" in f && !!f.required })) };
  });
}

export async function applyImportAction(input: { fileName: string; rows: Record<string, string>[]; mapping: ImportMapping; skipDuplicates: boolean }) {
  return act(({ ctx }) => applyImport(ctx, input), "Importação concluída");
}

export async function revertImportAction(batchId: string) {
  return act(({ ctx }) => revertImport(ctx, batchId), "Importação desfeita");
}
