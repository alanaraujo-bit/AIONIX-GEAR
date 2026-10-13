import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { getSaleDetail } from "@/server/queries/commerce";
import { accountOptions } from "@/server/queries/common";
import { appOrigin } from "@/server/qr";
import { PageHeader, Section, Money, KeyValue, Table, Th, Td, Callout } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { ItemStatusBadge } from "@/components/app/status";
import { TitleList } from "@/components/app/titles";
import { Gallery } from "@/components/app/photos";
import { formatDate, formatDateTime, todayInput } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { SaleActions } from "./sale-actions";
import { AfterSales } from "./after-sales";
import { saleMessage } from "./message";

export const metadata: Metadata = { title: "Venda" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("sales.manage");
  const { id } = await params;
  const s = await getSaleDetail(app.ctx, id);
  if (!s) notFound();
  const accounts = await accountOptions(app.ctx);
  const origin = await appOrigin();
  const receivables = s.finance.filter((t) => t.direction === "RECEIVABLE");
  const received = receivables.reduce((a, t) => a + t.settlements.filter((x) => x.kind === "PAYMENT").reduce((b, x) => b + x.amountCents, 0), 0);
  const open = receivables.reduce((a, t) => a + t.openCents, 0);
  const isQuote = s.status === "QUOTE";
  const expired = isQuote && s.quoteValidUntil && new Date(s.quoteValidUntil) < new Date();
  const message = saleMessage({
    orgName: app.org.name,
    code: s.code,
    isQuote,
    contactName: s.contact?.name ?? null,
    lines: s.lines.map((l) => ({ description: l.description, quantity: l.quantity, priceCents: l.unitPriceCents })),
    discountCents: s.discountCents,
    shippingCents: s.shippingChargedCents,
    totalCents: s.totalCents,
    validUntil: s.quoteValidUntil ? formatDate(s.quoteValidUntil, app.tz) : null,
    warrantyDays: s.warrantyDays,
    link: s.shareToken ? `${origin}/p/${s.shareToken}` : null,
  });
  return (
    <>
      <PageHeader
        back={{ href: "/vendas", label: "Vendas" }}
        title={`${isQuote ? "Orçamento" : "Venda"} ${s.code}`}
        meta={
          <>
            {isQuote && <Badge tone={expired ? "muted" : "info"}>{expired ? "Orçamento vencido" : "Orçamento"}</Badge>}
            {s.status === "CONFIRMED" && <Badge tone="positive">Venda fechada</Badge>}
            {s.status === "CANCELLED" && <Badge tone="muted">Cancelada</Badge>}
            {s.status === "CONFIRMED" && <Badge tone={s.deliveryStatus === "DELIVERED" ? "neutral" : "warning"}>{s.deliveryStatus === "DELIVERED" ? `Entregue ${formatDate(s.deliveredAt, app.tz)}` : "A entregar"}</Badge>}
            {s.status === "CONFIRMED" && <Badge tone={open > 0 ? "warning" : "positive"}>{open > 0 ? `Falta receber ${formatBRL(open)}` : "Recebido"}</Badge>}
            <span className="text-[0.8125rem] text-ink-3">
              {formatDate(s.date, app.tz)}
              {s.channel ? ` · ${s.channel}` : ""}
            </span>
          </>
        }
        actions={
          <SaleActions
            sale={{ id: s.id, code: s.code, status: s.status, deliveryStatus: s.deliveryStatus, shareToken: s.shareToken, totalCents: s.totalCents, tradeInCents: s.tradeInCents, feeCents: s.feeCents, receivedCents: received }}
            lines={s.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, returnedQty: l.returnedQty, unitPriceCents: l.unitPriceCents }))}
            accounts={accounts}
            today={todayInput(app.tz)}
            message={message}
            phone={s.contact?.whatsapp ?? s.contact?.phone ?? null}
          />
        }
      />
      {s.status === "CANCELLED" && (
        <Callout tone="neutral" className="mb-5">
          Cancelada em {formatDateTime(s.cancelledAt, app.tz)}: {s.cancelReason}. Receita e custo foram estornados e os itens voltaram ao estoque.
        </Callout>
      )}
      {isQuote && s.reserveItems && !expired && (
        <Callout tone="info" className="mb-5">
          Itens reservados até {formatDate(s.quoteValidUntil, app.tz)}. Um orçamento não gera receita nem tira itens do estoque.
        </Callout>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Itens" flush>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Qtd.</Th>
                  <Th align="right">Preço</Th>
                  {s.profit && <Th align="right">Custo</Th>}
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <Link href={`/estoque/${l.itemId}`} className="text-sm text-ink no-underline hover:text-accent-text">
                        {l.description}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="code text-ink-3">
                          {l.item?.code}
                          {l.item?.serial ? ` · S/N ${l.item.serial}` : ""}
                        </span>
                        {l.item && <ItemStatusBadge status={l.item.status} />}
                        {l.returnedQty > 0 && <Badge tone="warning">devolvido {l.returnedQty}</Badge>}
                      </span>
                    </Td>
                    <Td align="right" className="num">
                      {l.quantity}
                    </Td>
                    <Td align="right">
                      <Money cents={l.unitPriceCents * l.quantity} />
                    </Td>
                    {s.profit && (
                      <Td align="right">
                        <Money cents={l.costCents} unknown={s.status === "CONFIRMED" ? "desconhecido" : "—"} className="text-ink-2" />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          {s.tradeIns.length > 0 && (
            <Section title="Recebido como parte do pagamento" flush>
              <ul className="divide-y divide-line">
                {s.tradeIns.map((t) => (
                  <li key={t.id}>
                    <Link href={`/estoque/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 text-ink-3">{t.code}</span>
                      <span className="flex-1 truncate text-sm text-ink">{t.title}</span>
                      <ItemStatusBadge status={t.status} />
                      {t.unitCostCents !== null && <Money cents={t.unitCostCents} className="text-sm" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {s.returns.length > 0 && (
            <Section title="Devoluções">
              <ul className="space-y-2 text-sm">
                {s.returns.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>
                      {formatDate(r.date, app.tz)} — {r.reason}
                    </span>
                    <span>
                      reembolso <Money cents={r.refundCents} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {s.status === "CONFIRMED" && (
            <Section title="Pós-venda e garantia">
              <AfterSales saleId={s.id} initial={s.afterSalesNotes ?? ""} />
              {s.warrantyDays ? (
                <p className="mt-3 text-[0.8125rem] text-ink-3">
                  Garantia de {s.warrantyDays} dias — até {formatDate(new Date(new Date(s.deliveredAt ?? s.date).getTime() + s.warrantyDays * 86_400_000), app.tz)}.
                </p>
              ) : null}
            </Section>
          )}

          <Section title="Comprovantes e fotos">
            <Gallery entityType="Sale" entityId={s.id} items={s.attachments} canEdit compact />
          </Section>
        </div>

        <aside className="flex flex-col gap-5">
          <Section title="Valores">
            <dl className="divide-y divide-line">
              <KeyValue label="Itens">
                <Money cents={s.subtotalCents} />
              </KeyValue>
              {s.discountCents > 0 && (
                <KeyValue label="Desconto">
                  <Money cents={-s.discountCents} />
                </KeyValue>
              )}
              {s.shippingChargedCents > 0 && (
                <KeyValue label="Frete cobrado">
                  <Money cents={s.shippingChargedCents} />
                </KeyValue>
              )}
              <KeyValue label="Total">
                <Money cents={s.totalCents} className="font-semibold" />
              </KeyValue>
              {s.tradeInCents > 0 && (
                <KeyValue label="Pago com itens">
                  <Money cents={s.tradeInCents} />
                </KeyValue>
              )}
              {s.status === "CONFIRMED" && (
                <>
                  <KeyValue label="Recebido em dinheiro">
                    <Money cents={received} />
                  </KeyValue>
                  <KeyValue label="Falta receber">
                    <Money cents={open} className={open ? "font-medium text-warning-text" : ""} />
                  </KeyValue>
                </>
              )}
            </dl>
          </Section>

          {s.profit && s.status !== "QUOTE" && (
            <Section title="Resultado da venda">
              <dl className="divide-y divide-line">
                <KeyValue label="Receita">
                  <Money cents={s.profit.revenueCents} />
                </KeyValue>
                <KeyValue label="Custo das mercadorias">
                  <Money cents={-s.profit.cogsCents} />
                </KeyValue>
                <KeyValue label="Lucro bruto">
                  <Money cents={s.profit.grossCents} tone="auto" />
                </KeyValue>
                {s.profit.salesExpenseCents !== 0 && (
                  <KeyValue label="Taxas e frete pagos">
                    <Money cents={-s.profit.salesExpenseCents} />
                  </KeyValue>
                )}
                <KeyValue label="Lucro da venda">
                  <Money cents={s.profit.netCents} tone="auto" className="font-semibold" />
                </KeyValue>
              </dl>
              {s.profit.unknownCost && <p className="mt-2 text-[0.8125rem] text-warning-text">Há item com custo desconhecido: lucro superestimado.</p>}
            </Section>
          )}

          {s.status !== "QUOTE" && (
            <Section title="Recebimentos e pagamentos">
              <TitleList titles={s.finance} accounts={accounts} canSettle canWriteOff={app.can("finance.manage")} tz={app.tz} />
            </Section>
          )}

          <Section title="Cliente">
            {s.contact ? (
              <div className="text-sm">
                <Link href={`/contatos/${s.contact.id}`} className="font-medium">
                  {s.contact.name}
                </Link>
                {s.contact.whatsapp && <p className="text-ink-3">WhatsApp {s.contact.whatsapp}</p>}
                {s.contact.city && <p className="text-ink-3">{s.contact.city}</p>}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Venda sem cliente identificado.</p>
            )}
          </Section>

          {s.notes && (
            <Section title="Observações">
              <p className="whitespace-pre-line text-sm text-ink-2">{s.notes}</p>
            </Section>
          )}

          <Section title="Registro">
            <ul className="space-y-2 text-[0.8125rem]">
              {s.history.map((h) => (
                <li key={h.id}>
                  <span className="text-ink">{h.summary}</span>
                  <span className="block text-ink-3">
                    {h.user ?? "—"} · {formatDateTime(h.at, app.tz)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}
