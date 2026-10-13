import { formatBRL } from "@/lib/money";

/** Texto de orçamento/resumo de venda pronto para WhatsApp. */
export function saleMessage(s: {
  orgName: string;
  code: string;
  isQuote: boolean;
  contactName: string | null;
  lines: { description: string; quantity: number; priceCents: number }[];
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  validUntil: string | null;
  warrantyDays: number | null;
  link: string | null;
}) {
  const first = s.contactName?.split(" ")[0];
  return [
    `${first ? `Olá, ${first}! ` : ""}${s.isQuote ? `Segue o orçamento ${s.code}:` : `Resumo da sua compra ${s.code}:`}`,
    "",
    ...s.lines.map((l) => `• ${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.description} — ${formatBRL(l.priceCents * l.quantity)}`),
    ...(s.discountCents ? [`Desconto: −${formatBRL(s.discountCents)}`] : []),
    ...(s.shippingCents ? [`Frete: ${formatBRL(s.shippingCents)}`] : []),
    `*Total: ${formatBRL(s.totalCents)}*`,
    ...(s.warrantyDays ? [`Garantia: ${s.warrantyDays} dias`] : []),
    ...(s.isQuote && s.validUntil ? [`Válido até ${s.validUntil}.`] : []),
    ...(s.link ? ["", `Detalhes: ${s.link}`] : []),
    "",
    s.orgName,
  ].join("\n");
}
