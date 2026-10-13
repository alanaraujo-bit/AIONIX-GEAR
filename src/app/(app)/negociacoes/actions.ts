"use server";

import type { z } from "zod";
import { act } from "@/server/action";
import { saveOpportunity, moveOpportunity, opportunitySchema, STAGES } from "@/server/domain/opportunities";
import { parseDateInput } from "@/lib/dates";

export async function saveOpportunityAction(input: Omit<z.input<typeof opportunitySchema>, "nextActionAt"> & { nextActionInput?: string | null }) {
  const { nextActionInput, ...rest } = input;
  return act(({ ctx, tz }) => saveOpportunity(ctx, { ...rest, nextActionAt: nextActionInput ? parseDateInput(nextActionInput, tz) : null }), "Negociação salva");
}

export async function moveOpportunityAction(input: { id: string; stage: (typeof STAGES)[number]; lostReason?: string | null }) {
  return act(({ ctx }) => moveOpportunity(ctx, input));
}
