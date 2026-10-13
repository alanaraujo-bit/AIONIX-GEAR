import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { requirePage } from "@/server/session";
import { financeOverview, listTransactions } from "@/server/queries/finance";
import { PageHeader, Section, Money, Table, Th, Td, EmptyState } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PeriodSelect } from "@/components/app/period-select";
import { TX_KIND_LABEL, METHOD_LABEL } from "@/lib/labels";
import { formatDate, resolvePeriod, PERIOD_LABEL, type PeriodKey } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { MoneyActions } from "./money-actions";
import { TxFilters } from "./tx-filters";

export const metadata: Metadata = { title: "Financeiro" };

const REF_HREF: Record<string, string> = { SALE: "/vendas/", PURCHASE: "/compras/", TRADE: "/catiras/" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ periodo?: string; conta?: string; tipo?: string; q?: string; page?: string }> }) {
  const app = await requirePage("finance.view");
  const sp = await searchParams;
  const period = (Object.keys(PERIOD_LABEL).includes(sp.periodo ?? "") ? sp.periodo : "month") as PeriodKey;
  const p = resolvePeriod(period, app.tz);
  const [ov, tx] = await Promise.all([
    financeOverview(app.ctx),
    listTransactions(app.ctx, { accountId: sp.conta, kind: sp.tipo, from: period === "all" ? undefined : p.from, to: period === "all" ? undefined : p.to, q: sp.q, page: Number(sp.page ?? 1) }),
  ]);
  const activeAccounts = ov.balances.filter((b) => !b.archived);
  const total = activeAccounts.reduce((a, b) => a + b.balanceCents, 0);
  const canManage = app.can("finance.manage");
  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Dinheiro de verdade: o que entrou, saiu e está em cada conta. Lucro fica nos Relatórios — caixa e lucro são coisas diferentes."
        actions={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/financeiro/receber">A receber</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/financeiro/pagar">A pagar</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/financeiro/contas">Contas e categorias</Link>
            </Button>
            {canManage && (
              <Button asChild size="sm" variant="primary">
                <Link href="/financeiro/lancar">Lançar despesa ou receita</Link>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Saldo por conta" actions={canManage ? <MoneyActions accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, balanceCents: a.balanceCents }))} /> : undefined} flush>
          <ul className="divide-y divide-line">
            {activeAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-[8px] bg-surface-2 text-ink-3">
                    <Wallet className="size-4" />
                  </span>
                  <span>
                    <Link href={`/financeiro?conta=${a.id}&periodo=${period}`} className="text-sm font-medium text-ink no-underline hover:text-accent-text">
                      {a.name}
                    </Link>
                    <span className="block text-[0.75rem] text-ink-3">{a.kind === "CASH" ? "Dinheiro em espécie" : a.kind === "BANK" ? "Banco / PIX" : a.kind === "DIGITAL" ? "Carteira digital" : "Outra"}</span>
                  </span>
                </span>
                <Money cents={a.balanceCents} className={cn("text-base font-semibold", a.balanceCents < 0 && "text-negative")} />
              </li>
            ))}
            <li className="flex items-center justify-between bg-surface-2/60 px-4 py-3 sm:px-5">
              <span className="text-sm font-medium">Total disponível</span>
              <Money cents={total} className="text-lg font-semibold" />
            </li>
          </ul>
        </Section>
        <Section title="Compromissos">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>
                <Link href="/financeiro/receber">A receber</Link>
              </dt>
              <dd>
                <Money cents={ov.summary.receivableCents} />
              </dd>
            </div>
            {ov.summary.receivableOverdueCents > 0 && (
              <div className="flex justify-between text-negative">
                <dt>
                  <Link href="/financeiro/receber?situacao=atrasados" className="text-negative">
                    atrasado
                  </Link>
                </dt>
                <dd>
                  <Money cents={ov.summary.receivableOverdueCents} />
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>
                <Link href="/financeiro/pagar">A pagar</Link>
              </dt>
              <dd>
                <Money cents={ov.summary.payableCents} />
              </dd>
            </div>
            {ov.summary.payableOverdueCents > 0 && (
              <div className="flex justify-between text-negative">
                <dt>vencido</dt>
                <dd>
                  <Money cents={ov.summary.payableOverdueCents} />
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 font-medium">
              <dt>Posição (caixa + receber − pagar)</dt>
              <dd>
                <Money cents={total + ov.summary.receivableCents - ov.summary.payableCents} tone="auto" />
              </dd>
            </div>
          </dl>
        </Section>
      </div>

      <Section
        title="Movimentos"
        description={PERIOD_LABEL[period]}
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelect value={period} />
            <Button asChild size="sm" variant="ghost">
              <a href={`/api/export/movimentos?periodo=${period}${sp.conta ? `&conta=${sp.conta}` : ""}`}>Exportar CSV</a>
            </Button>
          </div>
        }
        flush
      >
        <TxFilters accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name }))} />
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-4 py-2.5 text-sm sm:px-5">
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownLeft className="size-4 text-positive" /> Entradas <Money cents={tx.inCents} className="font-medium" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRight className="size-4 text-negative" /> Saídas <Money cents={tx.outCents} className="font-medium" />
          </span>
          <span>
            Saldo do período <Money cents={tx.inCents - tx.outCents} tone="auto" className="font-medium" />
          </span>
        </div>
        {tx.rows.length === 0 ? (
          <EmptyState icon={Wallet} title="Nenhum movimento no período" compact>
            Vendas recebidas, compras pagas, despesas e aportes aparecem aqui automaticamente.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th className="hidden md:table-cell">Conta</Th>
                <Th align="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {tx.rows.map((r) => (
                <tr key={r.id} className={cn(r.reversal && "text-ink-3")}>
                  <Td className="whitespace-nowrap text-[0.8125rem] text-ink-3">{formatDate(r.date, app.tz)}</Td>
                  <Td>
                    <span className="block text-sm">
                      {r.refType && r.refId && REF_HREF[r.refType] ? (
                        <Link href={`${REF_HREF[r.refType]}${r.refId}`} className="text-ink no-underline hover:text-accent-text">
                          {r.description}
                        </Link>
                      ) : (
                        r.description
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5 text-[0.75rem] text-ink-3">
                      <Badge tone="neutral" className="h-5">
                        {TX_KIND_LABEL[r.kind] ?? r.kind}
                      </Badge>
                      {r.method && <span>{METHOD_LABEL[r.method] ?? r.method}</span>}
                      {r.contact && <span>· {r.contact}</span>}
                      {r.reversal && <Badge tone="muted">estorno</Badge>}
                    </span>
                  </Td>
                  <Td className="hidden text-sm text-ink-2 md:table-cell">{r.account}</Td>
                  <Td align="right">
                    <Money cents={r.direction === "IN" ? r.amountCents : -r.amountCents} tone="auto" signed className="font-medium" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
