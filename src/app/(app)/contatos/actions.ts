"use server";

import { act } from "@/server/action";
import { saveContact, archiveContact, anonymizeContact, findDuplicateContacts, contactSchema } from "@/server/domain/contacts";
import { addNote } from "@/server/domain/items";
import type { z } from "zod";

export async function saveContactAction(input: z.input<typeof contactSchema>) {
  return act(({ ctx }) => saveContact(ctx, input), "Contato salvo");
}

export async function quickContactAction(input: { name: string; whatsapp?: string; role?: "customer" | "supplier" }) {
  return act(async ({ ctx }) => {
    const r = await saveContact(ctx, {
      name: input.name,
      whatsapp: input.whatsapp,
      isCustomer: input.role === "customer",
      isSupplier: input.role === "supplier",
    });
    return { id: r.id, name: input.name.trim() };
  });
}

export async function duplicateContactsAction(input: { name?: string; phone?: string; document?: string; excludeId?: string }) {
  return act(({ ctx }) => findDuplicateContacts(ctx, input));
}

export async function archiveContactAction(id: string, archived: boolean) {
  return act(({ ctx }) => archiveContact(ctx, id, archived), archived ? "Contato arquivado" : "Contato reativado");
}

export async function anonymizeContactAction(id: string, confirm: string) {
  return act(({ ctx }) => anonymizeContact(ctx, { id, confirm }), "Dados pessoais removidos");
}

export async function contactNoteAction(contactId: string, body: string) {
  return act(({ ctx }) => addNote(ctx, { entityType: "Contact", entityId: contactId, body }), "Anotação salva");
}
