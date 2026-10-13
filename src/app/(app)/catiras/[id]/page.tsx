import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { requirePage } from "@/server/session";
import { getTradeDetail } from "@/server/queries/trades";
import { accountOptions } from "@/server/queries/common";
import { PageHeader, Section, Money, Callout } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { ItemStatusBadge } from "@/components/app/status";
import { TitleList } from "@/components/app/titles";
import { Gallery } from "@/components/app/photos";
import { TradeAnalysisPanel } from "@/components/app/trade-analysis";
import { CONDITION_LABEL, TRADE_STATUS_LABEL, TRADE_STATUS_TONE } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate, formatDateTime, todayInput } from "@/lib/dates";
import { TradeActions } from "./trade-actions";

export const metadata: Metadata = { title: "Catira" };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("trades.manage");
  const { id } = await params;
  const t = await getTradeDetail(app.ctx, id);
  if (!t) notFound();
  const accounts = await accountOptions(app.ctx);
  const open = t.status === "DRAFT" || t.status === "NEGOTIATING";
  return (
    <>
      <PageHeader
        back={{ href: "/catiras", label: "Catiras" }}
        title={t.title}
        meta={
          <>
            <span className="code text-ink-3">{t.code}</span>
            <Badge tone={TRADE_STATUS_TONE[t.status]}>{TRADE_STATUS_LABEL[t.status]}</Badge>
            <span className="text-[0.8125rem] text-ink-3">
              {formatDate(t.date, app.tz)}
              {t.contact ? ` · com ${t.contact.name}` : ""}
            </span>
          </>
        }
        actions={<TradeActions trade={{ id: t.id, code: t.code, status: t.status, cashInCents: t.cashInCents, cashOutCents: t.cashOutCents, feesCents: t.feesCents, outCount: t.outLines.length, inCount: t.inLines.length }} accounts={accounts} today={todayInput(app.tz)} />}
      />
      {t.status === "NEGOTIATING" && (
        <Callout tone="info" className="mb-5">
          Seus itens estão bloqueados enquanto a negociação está aberta — não aparecem como disponíveis para venda ou montagem.
        </Callout>
      )}
      {t.status === "CANCELLED" && (
        <Callout tone="neutral" className="mb-5">
          Cancelada em {formatDateTime(t.cancelledAt, app.tz)}: {t.cancelReason}.
        </Callout>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title={
                <span className="inline-flex items-center gap-2">
                  <ArrowUpRight className="size-4 text-negative" /> Você entrega
                </span>
              }
              flush
            >
              <ul className="divide-y divide-line">
                {t.outLines.map((l) => (
                  <li key={l.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/estoque/${l.itemId}`} className="min-w-0 text-sm font-medium text-ink no-underline hover:text-accent-text">
                        {l.item?.title}
                        <span className="code block font-normal text-ink-3">
                          {l.item?.code} · {l.item?.category}
                        </span>
                      </Link>
                      {l.item && <ItemStatusBadge status={l.item.status} />}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 text-[0.8125rem] text-ink-3">
                      <span>
                        combinado <Money cents={l.agreedValueCents} className="text-ink" />
                      </span>
                      <span>
                        custo <Money cents={t.status === "CONFIRMED" ? l.costCents : l.item?.unitCostCents ?? null} unknown="desconhecido" className="text-ink-2" />
                      </span>
                      {l.estimatedValueCents ? (
                        <span>
                          mercado <Money cents={l.estimatedValueCents} />
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
                {t.outLines.length === 0 && <li className="px-5 py-4 text-sm text-ink-3">Nenhum item.</li>}
              </ul>
            </Section>
            <Section
              title={
                <span className="inline-flex items-center gap-2">
                  <ArrowDownLeft className="size-4 text-positive" /> Você recebe
                </span>
              }
              flush
            >
              <ul className="divide-y divide-line">
                {t.inLines.map((l) => {
                  const created = t.receivedItems.find((r) => r.id === l.createdItemId);
                  return (
                    <li key={l.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-medium">
                          {created ? (
                            <Link href={`/estoque/${created.id}`} className="text-ink no-underline hover:text-accent-text">
                              {l.title}
                            </Link>
                          ) : (
                            l.title
                          )}
                          <span className="block text-[0.8125rem] font-normal text-ink-3">
                            {l.category} · {CONDITION_LABEL[l.condition]}
                            {l.quantity > 1 ? ` · ${l.quantity} un.` : ""}
                            {created ? ` · ${created.code}` : ""}
                          </span>
                        </span>
                        {created && <ItemStatusBadge status={created.status} />}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 text-[0.8125rem] text-ink-3">
                        <span>
                          combinado <Money cents={l.agreedValueCents} className="text-ink" />
                        </span>
                        {l.estimatedValueCents ? (
                          <span>
                            mercado <Money cents={l.estimatedValueCents} />
                          </span>
                        ) : null}
                        {l.allocatedCostCents !== null && (
                          <span>
                            custo atribuído <Money cents={l.allocatedCostCents} className="text-ink-2" />
                          </span>
                        )}
                      </div>
                      {l.conditionReport && <p className="mt-1.5 text-[0.8125rem] text-ink-2">Laudo: {l.conditionReport}</p>}
                    </li>
                  );
                })}
                {t.inLines.length === 0 && <li className="px-5 py-4 text-sm text-ink-3">Nenhum item.</li>}
              </ul>
            </Section>
          </div>

          {(t.cashInCents > 0 || t.cashOutCents > 0 || t.feesCents > 0) && (
            <Section title="Dinheiro na troca">
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                {t.cashInCents > 0 && (
                  <span>
                    Volta recebida <Money cents={t.cashInCents} className="font-medium" />
                  </span>
                )}
                {t.cashOutCents > 0 && (
                  <span>
                    Volta paga <Money cents={t.cashOutCents} className="font-medium" />
                  </span>
                )}
                {t.feesCents > 0 && (
                  <span>
                    Frete/taxas <Money cents={t.feesCents} className="font-medium" />
                  </span>
                )}
              </div>
              {t.status === "CONFIRMED" && (
                <div className="mt-4 border-t border-line pt-4">
                  <TitleList titles={t.finance} accounts={accounts} canSettle={app.can("finance.manage")} canWriteOff={app.can("finance.manage")} tz={app.tz} />
                </div>
              )}
            </Section>
          )}

          {t.revisions.length > 0 && (
            <Section title="Propostas e contrapropostas">
              <ol className="space-y-3">
                {t.revisions.map((r) => {
                  const outSum = r.snapshot.out.reduce((a, o) => a + o.agreedValueCents, 0);
                  const inSum = r.snapshot.in.reduce((a, o) => a + o.agreedValueCents, 0);
                  const net = r.snapshot.cashInCents - r.snapshot.cashOutCents;
                  return (
                    <li key={r.id} className="flex gap-3 text-sm">
                      <Badge tone={r.author === "US" ? "accent" : "info"} className="w-24 justify-center">
                        {r.author === "US" ? "Minha" : "Da outra parte"} #{r.number}
                      </Badge>
                      <div>
                        <p>
                          Entrego {formatBRL(outSum)} · recebo {formatBRL(inSum)}
                          {net ? ` · volta ${net > 0 ? "recebida" : "paga"} ${formatBRL(Math.abs(net))}` : ""}
                        </p>
                        {r.note && <p className="text-ink-2">{r.note}</p>}
                        <p className="text-[0.75rem] text-ink-3">
                          {r.user ?? "—"} · {formatDateTime(r.at, app.tz)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>
          )}

          <Section title="Evidências (fotos, prints da conversa, laudos)">
            <Gallery entityType="Trade" entityId={t.id} items={t.attachments} canEdit={t.status !== "CANCELLED"} compact />
          </Section>

          {t.notes && (
            <Section title="Anotações da negociação">
              <p className="whitespace-pre-line text-sm text-ink-2">{t.notes}</p>
            </Section>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <Section title={t.status === "CONFIRMED" ? "Análise registrada" : "Análise da troca"}>
            <TradeAnalysisPanel a={t.analysis} frozen={t.status === "CONFIRMED"} />
          </Section>
          {open && (
            <Callout tone="neutral">
              <Link href={`/catiras/${t.id}/editar`}>Editar a proposta</Link> para mudar valores ou itens. Registre como contraproposta para manter o histórico.
            </Callout>
          )}
          <Section title="Registro">
            <ul className="space-y-2 text-[0.8125rem]">
              {t.history.map((h) => (
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
