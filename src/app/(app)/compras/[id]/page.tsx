import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { getPurchaseDetail } from "@/server/queries/commerce";
import { accountOptions } from "@/server/queries/common";
import { PageHeader, Section, Money, KeyValue, Table, Th, Td, Callout } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { ItemStatusBadge } from "@/components/app/status";
import { TitleList } from "@/components/app/titles";
import { Gallery } from "@/components/app/photos";
import { COST_KIND_LABEL, CONDITION_LABEL } from "@/lib/labels";
import { formatDate, formatDateTime, todayInput } from "@/lib/dates";
import { PurchaseActions } from "./purchase-actions";

export const metadata: Metadata = { title: "Compra" };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("purchases.manage");
  const { id } = await params;
  const p = await getPurchaseDetail(app.ctx, id);
  if (!p) notFound();
  const accounts = await accountOptions(app.ctx);
  const openCents = p.finance.reduce((a, t) => a + t.openCents, 0);
  const paidCents = p.finance.reduce((a, t) => a + t.settlements.filter((s) => s.kind === "PAYMENT").reduce((x, s) => x + s.amountCents, 0), 0);
  return (
    <>
      <PageHeader
        back={{ href: "/compras", label: "Compras" }}
        title={`Compra ${p.code}`}
        meta={
          <>
            <Badge tone={p.status === "CONFIRMED" ? "positive" : p.status === "DRAFT" ? "neutral" : "muted"}>{p.status === "CONFIRMED" ? "Confirmada" : p.status === "DRAFT" ? "Rascunho" : "Cancelada"}</Badge>
            <span className="text-[0.8125rem] text-ink-3">
              {formatDate(p.date, app.tz)}
              {p.contact ? ` · ${p.contact.name}` : ""}
              {p.channel ? ` · ${p.channel}` : ""}
            </span>
          </>
        }
        actions={<PurchaseActions id={p.id} code={p.code} status={p.status} totalCents={p.totalCents} accounts={accounts} today={todayInput(app.tz)} paidCents={paidCents} />}
      />
      {p.status === "CANCELLED" && (
        <Callout tone="neutral" className="mb-5">
          Cancelada em {formatDateTime(p.cancelledAt, app.tz)}: {p.cancelReason}. Itens anulados e pagamentos estornados — tudo continua no histórico.
        </Callout>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Peças" flush>
            <Table>
              <thead>
                <tr>
                  <Th>Peça</Th>
                  <Th align="right">Qtd.</Th>
                  <Th align="right">Preço unit.</Th>
                  <Th align="right">Custo total rateado</Th>
                </tr>
              </thead>
              <tbody>
                {p.lines.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <span className="text-sm text-ink">{l.description}</span>
                      <span className="block text-[0.75rem] text-ink-3">{CONDITION_LABEL[l.condition]}</span>
                    </Td>
                    <Td align="right" className="num">
                      {l.quantity}
                    </Td>
                    <Td align="right">
                      <Money cents={l.unitPriceCents} />
                    </Td>
                    <Td align="right">{l.allocatedCents !== null ? <Money cents={l.allocatedCents} className="font-medium" /> : <span className="text-ink-3">ao confirmar</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          {p.items.length > 0 && (
            <Section title="Itens que entraram no estoque" description="Cada unidade com código próprio. Clique para ver o que aconteceu com ela depois." flush>
              <ul className="divide-y divide-line">
                {p.items.map((it) => (
                  <li key={it.id}>
                    <Link href={`/estoque/${it.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 text-ink-3">{it.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {it.title}
                        {it.serial && <span className="code ml-2 text-ink-3">S/N {it.serial}</span>}
                        {it.tracking === "LOT" && <span className="ml-2 text-ink-3">lote de {it.qtyInitial}</span>}
                      </span>
                      <ItemStatusBadge status={it.status} />
                      <Money cents={it.unitCostCents} className="w-24 text-right text-sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Comprovantes e fotos">
            <Gallery entityType="Purchase" entityId={p.id} items={p.attachments} canEdit={p.status !== "CANCELLED"} compact />
          </Section>
        </div>

        <aside className="flex flex-col gap-5">
          <Section title="Valores">
            <dl className="divide-y divide-line">
              <KeyValue label="Peças">
                <Money cents={p.subtotalCents} />
              </KeyValue>
              {p.extras.map((e) => (
                <KeyValue key={e.id} label={COST_KIND_LABEL[e.kind] ?? e.kind} hint={e.description}>
                  <Money cents={e.amountCents} />
                </KeyValue>
              ))}
              {p.discountCents > 0 && (
                <KeyValue label="Desconto">
                  <Money cents={-p.discountCents} />
                </KeyValue>
              )}
              <KeyValue label="Total">
                <Money cents={p.totalCents} className="font-semibold" />
              </KeyValue>
              {p.status === "CONFIRMED" && (
                <>
                  <KeyValue label="Pago">
                    <Money cents={paidCents} />
                  </KeyValue>
                  <KeyValue label="Falta pagar">
                    <Money cents={openCents} className={openCents ? "font-medium text-warning-text" : ""} />
                  </KeyValue>
                </>
              )}
            </dl>
          </Section>
          {p.status !== "DRAFT" && (
            <Section title="Pagamentos">
              <TitleList titles={p.finance} accounts={accounts} canSettle={app.can("finance.manage")} canWriteOff={app.can("finance.manage")} tz={app.tz} />
            </Section>
          )}
          {p.notes && (
            <Section title="Observações">
              <p className="whitespace-pre-line text-sm text-ink-2">{p.notes}</p>
            </Section>
          )}
          <Section title="Registro">
            <ul className="space-y-2 text-[0.8125rem]">
              {p.history.map((h) => (
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
