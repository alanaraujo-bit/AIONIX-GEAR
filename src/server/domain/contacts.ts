import { z } from "zod";
import { prisma } from "../db";
import { requirePerm, hasPerm, withTx, type Ctx } from "../context";
import { NotFoundError, DomainError, assert } from "../errors";
import { audit } from "./shared";

export const contactSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  isCustomer: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  phone: z.string().trim().max(30).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email("E-mail inválido").max(120).optional().nullable().or(z.literal("")),
  document: z.string().trim().max(20).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(2).optional().nullable(),
  instagram: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});

function canManageContacts(ctx: Ctx) {
  return hasPerm(ctx, "contacts.manage") || hasPerm(ctx, "purchases.manage") || hasPerm(ctx, "trades.manage");
}

export async function saveContact(ctx: Ctx, raw: z.input<typeof contactSchema>) {
  if (!canManageContacts(ctx)) requirePerm(ctx, "contacts.manage");
  const input = contactSchema.parse(raw);
  const digits = (s?: string | null) => (s ? s.replace(/\D/g, "") || null : null);
  const data = {
    name: input.name,
    isCustomer: input.isCustomer,
    isSupplier: input.isSupplier,
    phone: digits(input.phone),
    whatsapp: digits(input.whatsapp),
    email: input.email ? input.email.toLowerCase() : null,
    document: digits(input.document),
    city: input.city || null,
    state: input.state ? input.state.toUpperCase() : null,
    instagram: input.instagram?.replace(/^@/, "") || null,
    notes: input.notes || null,
    tags: input.tags ?? [],
  };
  return withTx(async (tx) => {
    if (input.id) {
      const c = await tx.contact.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Contato");
      if (c.anonymizedAt) throw new DomainError("Contato anonimizado não pode ser editado.");
      await tx.contact.update({ where: { id: c.id }, data });
      await audit(tx, ctx, "contact.update", `Contato atualizado: ${input.name}`, { entityType: "Contact", entityId: c.id });
      return { id: c.id };
    }
    const c = await tx.contact.create({ data: { ...data, orgId: ctx.orgId } });
    await audit(tx, ctx, "contact.create", `Contato criado: ${input.name}`, { entityType: "Contact", entityId: c.id });
    return { id: c.id };
  });
}

/** Possíveis duplicados por telefone/WhatsApp/documento/nome. */
export async function findDuplicateContacts(ctx: Ctx, input: { name?: string; phone?: string | null; document?: string | null; excludeId?: string }) {
  if (!canManageContacts(ctx)) requirePerm(ctx, "contacts.manage");
  const phone = input.phone?.replace(/\D/g, "");
  const doc = input.document?.replace(/\D/g, "");
  const or = [];
  if (phone && phone.length >= 8) or.push({ phone: { endsWith: phone.slice(-8) } }, { whatsapp: { endsWith: phone.slice(-8) } });
  if (doc && doc.length >= 11) or.push({ document: doc });
  if (input.name && input.name.trim().length >= 4) or.push({ name: { equals: input.name.trim(), mode: "insensitive" as const } });
  if (!or.length) return [];
  return prisma.contact.findMany({
    where: { orgId: ctx.orgId, archived: false, anonymizedAt: null, OR: or, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    take: 5,
    select: { id: true, name: true, phone: true, whatsapp: true, city: true },
  });
}

export async function archiveContact(ctx: Ctx, id: string, archived: boolean) {
  if (!canManageContacts(ctx)) requirePerm(ctx, "contacts.manage");
  return withTx(async (tx) => {
    const n = await tx.contact.updateMany({ where: { id, orgId: ctx.orgId }, data: { archived } });
    if (n.count !== 1) throw new NotFoundError("Contato");
    await audit(tx, ctx, archived ? "contact.archive" : "contact.unarchive", archived ? "Contato arquivado" : "Contato reativado", { entityType: "Contact", entityId: id });
    return { ok: true };
  });
}

/**
 * Anonimização (minimização de dados pessoais a pedido do titular). Mantém os
 * registros comerciais (vendas, compras) para integridade financeira, mas remove
 * nome, telefone, e-mail, documento e observações.
 */
export async function anonymizeContact(ctx: Ctx, input: { id: string; confirm: string }) {
  requirePerm(ctx, "settings.manage");
  assert(input.confirm === "ANONIMIZAR", 'Digite "ANONIMIZAR" para confirmar.');
  return withTx(async (tx) => {
    const c = await tx.contact.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
    if (!c) throw new NotFoundError("Contato");
    if (c.anonymizedAt) throw new DomainError("Contato já anonimizado.");
    await tx.contact.update({
      where: { id: c.id },
      data: {
        name: `Contato anonimizado #${c.id.slice(-6)}`,
        phone: null,
        whatsapp: null,
        email: null,
        document: null,
        instagram: null,
        notes: null,
        city: null,
        state: null,
        tags: [],
        anonymizedAt: new Date(),
        archived: true,
      },
    });
    await tx.note.deleteMany({ where: { orgId: ctx.orgId, entityType: "Contact", entityId: c.id } });
    await audit(tx, ctx, "contact.anonymize", "Contato anonimizado a pedido do titular", { entityType: "Contact", entityId: c.id });
    return { ok: true };
  });
}

/** Saldo do contato: quanto ele nos deve e quanto devemos a ele. */
export async function contactBalances(orgId: string, contactId: string) {
  const titles = await prisma.title.findMany({
    where: { orgId, contactId, status: { in: ["OPEN", "PARTIAL"] } },
    select: { direction: true, amountCents: true, settledCents: true },
  });
  const receivable = titles.filter((t) => t.direction === "RECEIVABLE").reduce((a, t) => a + t.amountCents - t.settledCents, 0);
  const payable = titles.filter((t) => t.direction === "PAYABLE").reduce((a, t) => a + t.amountCents - t.settledCents, 0);
  return { receivableCents: receivable, payableCents: payable };
}
