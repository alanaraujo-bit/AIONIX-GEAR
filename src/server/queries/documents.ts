import "server-only";
import { prisma } from "../db";
import { readSettings } from "../domain/org";
import type { SaleDoc } from "@/components/app/sale-document";
import { METHOD_LABEL } from "@/lib/labels";

/** Monta o documento de venda/orçamento (sem custos). Usado na impressão e no link público. */
export async function saleDocument(orgId: string, saleId: string, tz: string): Promise<SaleDoc | null> {
  const s = await prisma.sale.findFirst({ where: { id: saleId, orgId }, include: { lines: true } });
  if (!s) return null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const [contact, items, titles] = await Promise.all([
    s.contactId ? prisma.contact.findFirst({ where: { id: s.contactId, orgId } }) : null,
    prisma.item.findMany({ where: { orgId, id: { in: s.lines.map((l) => l.itemId) } }, select: { id: true, code: true, serial: true, condition: true } }),
    prisma.title.findMany({ where: { orgId, sourceType: "SALE", sourceId: s.id, direction: "RECEIVABLE", status: { not: "CANCELLED" } }, include: { settlements: true } }),
  ]);
  const txIds = titles.flatMap((t) => t.settlements.map((x) => x.transactionId)).filter(Boolean) as string[];
  const txs = await prisma.moneyTransaction.findMany({ where: { orgId, id: { in: txIds } } });
  const payments = titles.flatMap((t) =>
    t.settlements
      .filter((x) => x.kind === "PAYMENT" && !x.reversalOfId)
      .map((x) => {
        const tx = txs.find((y) => y.id === x.transactionId);
        return { label: `Pago${tx?.method ? ` — ${METHOD_LABEL[tx.method] ?? tx.method}` : ""}`, amountCents: x.amountCents, date: x.date };
      }),
  );
  const settings = readSettings(org.settings);
  return {
    org: { name: org.name, legalName: org.legalName, document: org.document, phone: org.phone, email: org.email, city: org.city, state: org.state, footer: settings.documentFooter },
    code: s.code,
    status: s.status,
    date: s.date,
    validUntil: s.quoteValidUntil,
    contact: contact ? { name: contact.anonymizedAt ? "Cliente" : contact.name, document: contact.document, phone: contact.whatsapp ?? contact.phone, city: contact.city } : null,
    lines: s.lines.map((l) => {
      const it = items.find((i) => i.id === l.itemId);
      return { description: l.description, code: it?.code, serial: it?.serial, condition: it?.condition, quantity: l.quantity, unitPriceCents: l.unitPriceCents };
    }),
    subtotalCents: s.subtotalCents,
    discountCents: s.discountCents,
    shippingCents: s.shippingChargedCents,
    totalCents: s.totalCents,
    tradeInCents: s.tradeInCents,
    payments,
    openCents: titles.filter((t) => t.status === "OPEN" || t.status === "PARTIAL").reduce((a, t) => a + t.amountCents - t.settledCents, 0),
    warrantyDays: s.warrantyDays,
    notes: s.notes,
    tz,
  };
}
