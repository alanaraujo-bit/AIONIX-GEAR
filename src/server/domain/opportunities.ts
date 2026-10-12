import { z } from "zod";
import { hasPerm, withTx, type Ctx } from "../context";
import { ForbiddenError, NotFoundError } from "../errors";
import { audit } from "./shared";

export const STAGES = ["NEW", "NEGOTIATING", "PROPOSAL", "WON", "LOST"] as const;
export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  NEW: "Novo contato",
  NEGOTIATING: "Negociando",
  PROPOSAL: "Proposta enviada",
  WON: "Fechado",
  LOST: "Perdido",
};
export const OPP_TYPE_LABEL: Record<string, string> = {
  SELL: "Venda",
  BUY: "Compra",
  TRADE: "Catira",
  BUILD: "Montagem",
};

function assertCan(ctx: Ctx) {
  if (!(hasPerm(ctx, "sales.manage") || hasPerm(ctx, "trades.manage") || hasPerm(ctx, "purchases.manage"))) throw new ForbiddenError();
}

export const opportunitySchema = z.object({
  id: z.string().optional().nullable(),
  title: z.string().trim().min(2).max(160),
  type: z.enum(["SELL", "BUY", "TRADE", "BUILD"]).default("SELL"),
  stage: z.enum(STAGES).default("NEW"),
  contactId: z.string().optional().nullable(),
  valueCents: z.number().int().min(0).optional().nullable(),
  itemIds: z.array(z.string()).max(50).default([]),
  source: z.string().trim().max(60).optional().nullable(),
  nextAction: z.string().trim().max(200).optional().nullable(),
  nextActionAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  lostReason: z.string().trim().max(300).optional().nullable(),
});

export async function saveOpportunity(ctx: Ctx, raw: z.input<typeof opportunitySchema>) {
  assertCan(ctx);
  const input = opportunitySchema.parse(raw);
  return withTx(async (tx) => {
    if (input.contactId) {
      const c = await tx.contact.findFirst({ where: { id: input.contactId, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Contato");
    }
    if (input.itemIds.length) {
      const n = await tx.item.count({ where: { orgId: ctx.orgId, id: { in: input.itemIds } } });
      if (n !== input.itemIds.length) throw new NotFoundError("Item");
    }
    const closed = input.stage === "WON" || input.stage === "LOST";
    const data = {
      title: input.title,
      type: input.type,
      stage: input.stage,
      contactId: input.contactId ?? null,
      valueCents: input.valueCents ?? null,
      itemIds: input.itemIds,
      source: input.source ?? null,
      nextAction: closed ? null : input.nextAction ?? null,
      nextActionAt: closed ? null : input.nextActionAt ?? null,
      notes: input.notes ?? null,
      lostReason: input.stage === "LOST" ? input.lostReason ?? null : null,
    };
    if (input.id) {
      const o = await tx.opportunity.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
      if (!o) throw new NotFoundError("Negociação");
      await tx.opportunity.update({ where: { id: o.id }, data: { ...data, closedAt: closed ? o.closedAt ?? new Date() : null } });
      await audit(tx, ctx, "opportunity.update", `Negociação atualizada: ${input.title}`, { entityType: "Opportunity", entityId: o.id });
      return { id: o.id };
    }
    const o = await tx.opportunity.create({ data: { ...data, orgId: ctx.orgId, createdById: ctx.userId, closedAt: closed ? new Date() : null } });
    await audit(tx, ctx, "opportunity.create", `Negociação criada: ${input.title}`, { entityType: "Opportunity", entityId: o.id });
    return { id: o.id };
  });
}

export async function moveOpportunity(ctx: Ctx, input: { id: string; stage: (typeof STAGES)[number]; lostReason?: string | null }) {
  assertCan(ctx);
  return withTx(async (tx) => {
    const o = await tx.opportunity.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
    if (!o) throw new NotFoundError("Negociação");
    const closed = input.stage === "WON" || input.stage === "LOST";
    await tx.opportunity.update({
      where: { id: o.id },
      data: {
        stage: input.stage,
        closedAt: closed ? new Date() : null,
        lostReason: input.stage === "LOST" ? input.lostReason ?? o.lostReason : null,
        nextActionAt: closed ? null : o.nextActionAt,
      },
    });
    await audit(tx, ctx, "opportunity.move", `Negociação "${o.title}" → ${STAGE_LABEL[input.stage]}`, { entityType: "Opportunity", entityId: o.id });
    return { ok: true };
  });
}
