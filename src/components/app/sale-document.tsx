import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { CONDITION_LABEL } from "@/lib/labels";

export type SaleDoc = {
  org: { name: string; legalName: string | null; document: string | null; phone: string | null; email: string | null; city: string | null; state: string | null; footer: string };
  code: string;
  status: string;
  date: Date;
  validUntil: Date | null;
  contact: { name: string; document?: string | null; phone?: string | null; city?: string | null } | null;
  lines: { description: string; code?: string | null; serial?: string | null; condition?: string | null; quantity: number; unitPriceCents: number }[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  tradeInCents: number;
  payments: { label: string; amountCents: number; date?: Date | null }[];
  openCents: number;
  warrantyDays: number | null;
  notes: string | null;
  tz: string;
};

/** Documento gerencial de orçamento/recibo — deliberadamente NÃO é documento fiscal. */
export function SaleDocument({ d }: { d: SaleDoc }) {
  const isQuote = d.status === "QUOTE";
  const title = isQuote ? "Orçamento" : d.status === "CANCELLED" ? "Venda cancelada" : "Recibo de venda";
  return (
    <article className="mx-auto max-w-[780px] bg-white p-8 text-[13px] leading-relaxed text-neutral-900 print:p-0">
      <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-5">
        <div>
          <p className="text-lg font-semibold">{d.org.legalName || d.org.name}</p>
          <p className="text-neutral-600">
            {[d.org.document && `CPF/CNPJ ${d.org.document}`, d.org.phone, d.org.email].filter(Boolean).join(" · ")}
          </p>
          {d.org.city && (
            <p className="text-neutral-600">
              {d.org.city}
              {d.org.state ? `/${d.org.state}` : ""}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tracking-tight">{title}</p>
          <p className="font-mono">{d.code}</p>
          <p className="text-neutral-600">{formatDate(d.date, d.tz)}</p>
          {isQuote && d.validUntil && <p className="text-neutral-600">Válido até {formatDate(d.validUntil, d.tz)}</p>}
        </div>
      </header>
      {d.contact && (
        <section className="mt-5">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Cliente</p>
          <p className="font-medium">{d.contact.name}</p>
          <p className="text-neutral-600">{[d.contact.document && `Doc. ${d.contact.document}`, d.contact.phone, d.contact.city].filter(Boolean).join(" · ")}</p>
        </section>
      )}
      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qtd.</th>
            <th className="py-2 text-right font-medium">Unitário</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="py-2 pr-4">
                <p className="font-medium">{l.description}</p>
                <p className="text-[11px] text-neutral-500">
                  {[l.code, l.serial && `S/N ${l.serial}`, l.condition && CONDITION_LABEL[l.condition]].filter(Boolean).join(" · ")}
                </p>
              </td>
              <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2 text-right tabular-nums">{formatBRL(l.unitPriceCents)}</td>
              <td className="py-2 text-right tabular-nums">{formatBRL(l.unitPriceCents * l.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-72 space-y-1">
        <Row label="Subtotal" value={d.subtotalCents} />
        {d.discountCents > 0 && <Row label="Desconto" value={-d.discountCents} />}
        {d.shippingCents > 0 && <Row label="Frete" value={d.shippingCents} />}
        <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatBRL(d.totalCents)}</span>
        </div>
        {!isQuote && d.tradeInCents > 0 && <Row label="Pago com itens (troca)" value={d.tradeInCents} />}
        {!isQuote &&
          d.payments.map((p, i) => <Row key={i} label={`${p.label}${p.date ? ` (${formatDate(p.date, d.tz)})` : ""}`} value={p.amountCents} />)}
        {!isQuote && d.openCents > 0 && (
          <div className="flex justify-between font-medium">
            <span>Saldo a pagar</span>
            <span className="tabular-nums">{formatBRL(d.openCents)}</span>
          </div>
        )}
      </div>
      {(d.warrantyDays || d.notes) && (
        <section className="mt-6 space-y-2">
          {d.warrantyDays ? <p>Garantia de {d.warrantyDays} dias a partir da entrega, cobrindo defeitos de funcionamento. Não cobre mau uso, danos físicos ou violação.</p> : null}
          {d.notes && <p className="whitespace-pre-line">{d.notes}</p>}
        </section>
      )}
      {d.org.footer && <p className="mt-6 whitespace-pre-line text-neutral-600">{d.org.footer}</p>}
      <footer className="mt-10 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">
        Documento gerencial emitido por {d.org.name}. Não substitui nota fiscal ou documento fiscal oficial.
      </footer>
    </article>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-neutral-700">
      <span>{label}</span>
      <span className="tabular-nums">{formatBRL(value)}</span>
    </div>
  );
}
