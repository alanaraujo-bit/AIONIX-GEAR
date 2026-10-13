import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleAlert, CircleDot, Clock, Info, TriangleAlert } from "lucide-react";
import { requireApp } from "@/server/session";
import { dashboard } from "@/server/queries/dashboard";
import { expireStaleReservations } from "@/server/domain/sales";
import { onboardingStatus } from "@/server/queries/onboarding";
import { Section, Money, EmptyState } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { RevenueChart } from "@/components/app/revenue-chart";
import { PeriodSelect } from "@/components/app/period-select";
import { Onboarding } from "./onboarding";
import { formatBRL, formatPct } from "@/lib/money";
import { formatRelative, daysBetween, PERIOD_LABEL, type PeriodKey } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Início" };

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Delta({ now, prev, invert }: { now: number; prev: number | null | undefined; invert?: boolean }) {
  if (prev === null || prev === undefined) return null;
  if (prev === 0 && now === 0) return <span className="text-[0.75rem] text-ink-3">sem movimento</span>;
  if (prev === 0) return <span className="text-[0.75rem] text-ink-3">sem base anterior</span>;
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={cn("num text-[0.75rem]", Math.abs(pct) < 0.5 ? "text-ink-3" : good ? "text-positive" : "text-negative")}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : ""} {formatPct(Math.abs(pct), 0)} vs. anterior
    </span>
  );
}

function Ledger({ label, children, sub, href }: { label: string; children: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[0.8125rem] text-ink-3">
        {label}
        {href && <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </span>
      <span className="mt-1.5 block text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] text-ink">{children}</span>
      {sub && <span className="mt-1 block">{sub}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="group block px-4 py-4 no-underline transition-colors hover:bg-surface-2/60 sm:px-5">
      {body}
    </Link>
  ) : (
    <div className="px-4 py-4 sm:px-5">{body}</div>
  );
}

const TONE_ICON = { negative: CircleAlert, warning: TriangleAlert, info: Info, neutral: CircleDot };
const TONE_CLASS = { negative: "text-negative", warning: "text-warning-text", info: "text-info", neutral: "text-ink-3" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const app = await requireApp();
  const sp = await searchParams;
  const period = (Object.keys(PERIOD_LABEL).includes(sp.periodo ?? "") ? sp.periodo : "month") as PeriodKey;
  if (app.can("sales.manage")) await expireStaleReservations(app.ctx).catch(() => undefined);
  const [d, onboarding] = await Promise.all([dashboard(app.ctx, period, app.tz, app.settings), onboardingStatus(app.ctx)]);
  const firstName = app.session.user.name.split(" ")[0];
  const cashTotal = d.balances?.reduce((a, b) => a + b.balanceCents, 0) ?? null;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.015em]">
            {greeting(app.tz)}, {firstName}
          </h1>
          <p className="mt-1 text-ink-2">{app.org.name} — o que importa agora.</p>
        </div>
        {d.pl && <PeriodSelect value={period} />}
      </div>

      {!onboarding.done && <Onboarding status={onboarding} />}

      {/* Faixa de números do negócio: cada um leva ao registro que o explica */}
      <section className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-box)] border border-line bg-line lg:grid-cols-6 [&>*]:bg-surface">
        {d.pl && (
          <Ledger label={`Receita · ${PERIOD_LABEL[period].toLowerCase()}`} href="/relatorios" sub={<Delta now={d.pl.revenueCents} prev={d.plPrev?.revenueCents} />}>
            <Money cents={d.pl.revenueCents} />
          </Ledger>
        )}
        {d.pl && (
          <Ledger label="Lucro bruto" href="/relatorios" sub={<span className="text-[0.75rem] text-ink-3">margem {formatPct(d.pl.grossMarginPct, 0)}</span>}>
            <Money cents={d.pl.grossProfitCents} tone="auto" />
          </Ledger>
        )}
        {d.pl && (
          <Ledger label="Resultado líquido" href="/relatorios" sub={<Delta now={d.pl.netResultCents} prev={d.plPrev?.netResultCents} />}>
            <Money cents={d.pl.netResultCents} tone="auto" />
          </Ledger>
        )}
        {cashTotal !== null && (
          <Ledger label="Caixa disponível" href="/financeiro" sub={<span className="text-[0.75rem] text-ink-3">em {d.balances!.length} conta{d.balances!.length === 1 ? "" : "s"}</span>}>
            <Money cents={cashTotal} />
          </Ledger>
        )}
        {d.cash && (
          <Ledger
            label="A receber"
            href="/financeiro/receber"
            sub={d.cash.receivableOverdueCents > 0 ? <span className="num text-[0.75rem] text-negative">{formatBRL(d.cash.receivableOverdueCents)} atrasado</span> : <span className="text-[0.75rem] text-ink-3">nada atrasado</span>}
          >
            <Money cents={d.cash.receivableCents} />
          </Ledger>
        )}
        {d.inv && (
          <Ledger
            label={d.inv.ownedCostCents !== null ? "Estoque a custo" : "Itens em estoque"}
            href="/estoque"
            sub={
              <span className="text-[0.75rem] text-ink-3">
                {d.inv.ownedUnits} un. próprias
                {d.inv.unknownCostItems > 0 && d.inv.ownedCostCents !== null ? ` · ${d.inv.unknownCostItems} sem custo` : ""}
              </span>
            }
          >
            {d.inv.ownedCostCents !== null ? <Money cents={d.inv.ownedCostCents} /> : <span className="num">{d.inv.ownedItems}</span>}
          </Ledger>
        )}
        {!d.pl && d.salesCount !== null && (
          <Ledger label={`Vendas · ${PERIOD_LABEL[period].toLowerCase()}`} href="/vendas">
            <span className="num">{d.salesCount}</span>
          </Ledger>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Próximas ações" description="O que destrava dinheiro ou evita problema, em ordem de urgência." flush>
            {d.actions.length === 0 ? (
              <EmptyState icon={Clock} title="Tudo em dia" compact>
                Nenhuma cobrança atrasada, conta vencendo ou item esperando avaliação.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {d.actions.map((a) => {
                  const Icon = TONE_ICON[a.tone];
                  return (
                    <li key={a.key}>
                      <Link href={a.href} className="group flex items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-2/60 sm:px-5">
                        <Icon className={cn("size-[18px] shrink-0", TONE_CLASS[a.tone])} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{a.title}</span>
                          <span className="block text-[0.8125rem] text-ink-3">{a.detail}</span>
                        </span>
                        {a.amountCents !== undefined && <Money cents={a.amountCents} className="text-sm font-medium" />}
                        <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {d.pl && (
            <Section
              title="Receita e lucro bruto"
              description={d.pl.revenueWithUnknownCostCents > 0 ? `Atenção: ${formatBRL(d.pl.revenueWithUnknownCostCents)} da receita vem de itens com custo desconhecido — o lucro está superestimado.` : `${d.salesCount ?? 0} venda(s) fechada(s) no período.`}
            >
              <RevenueChart data={d.series} weekly={d.series.length > 0 && d.series.length < Math.ceil((d.period.to.getTime() - d.period.from.getTime()) / 86_400_000) - 7} />
            </Section>
          )}

          {d.stale.length > 0 && (
            <Section title={`Parados há mais de ${app.settings.staleDays} dias`} description="Capital que não está girando." actions={<Link href={`/estoque?stale=${app.settings.staleDays}&sort=oldest`} className="text-[0.8125rem]">Ver todos</Link>} flush>
              <ul className="divide-y divide-line">
                {d.stale.map((s) => (
                  <li key={s.id}>
                    <Link href={`/estoque/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 shrink-0 text-ink-3">{s.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.title}</span>
                      <Badge tone="warning">
                        <span className="num">{daysBetween(s.acquiredAt)} dias</span>
                      </Badge>
                      {s.unitCostCents !== null && <Money cents={s.unitCostCents * s.qtyOnHand} className="w-24 text-right text-sm text-ink-2" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          {d.balances && (
            <Section title="Saldo por conta" actions={<Link href="/financeiro" className="text-[0.8125rem]">Financeiro</Link>}>
              <ul className="space-y-2">
                {d.balances.map((b) => (
                  <li key={b.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ink-2">{b.name}</span>
                    <Money cents={b.balanceCents} className={b.balanceCents < 0 ? "text-negative" : "text-ink"} />
                  </li>
                ))}
              </ul>
              {d.cash && (
                <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-3">A pagar</dt>
                    <dd>
                      <Money cents={d.cash.payableCents} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Caixa + receber − pagar</dt>
                    <dd className="font-medium">
                      <Money cents={(cashTotal ?? 0) + d.cash.receivableCents - d.cash.payableCents} />
                    </dd>
                  </div>
                </dl>
              )}
            </Section>
          )}

          {d.inv && d.inv.ownedCostCents !== null && (
            <Section title="Estoque próprio">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-3">Custo investido</dt>
                  <dd>
                    <Money cents={d.inv.ownedCostCents} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-3">Preço pretendido</dt>
                  <dd>
                    <Money cents={d.inv.ownedAskingCents} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-3" title="Estimativas informadas por você; não é dinheiro nem lucro">
                    Valor de mercado (estimado)
                  </dt>
                  <dd>
                    <Money cents={d.inv.ownedMarketValueCents} />
                  </dd>
                </div>
                <p className="pt-1 text-[0.75rem] leading-snug text-ink-3">
                  Estimativa cobre {d.inv.marketCoverageItems} de {d.inv.ownedItems} itens. Valor estimado nunca entra no lucro.
                </p>
              </dl>
              {d.categoryMix.length > 0 && (
                <div className="mt-4 space-y-2.5 border-t border-line pt-4">
                  {d.categoryMix.map((c) => {
                    const pct = d.inv!.ownedCostCents ? (c.costCents / d.inv!.ownedCostCents) * 100 : 0;
                    return (
                      <div key={c.name}>
                        <div className="flex justify-between text-[0.8125rem]">
                          <span className="text-ink-2">{c.name}</span>
                          <span className="num text-ink-3">{formatPct(pct, 0)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {(d.inv.consignedInUnits > 0 || d.inv.clientUnits > 0) && (
                <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] text-ink-3">
                  Fora do seu patrimônio: {d.inv.consignedInUnits} consignado(s) de terceiros e {d.inv.clientUnits} de clientes.
                </p>
              )}
            </Section>
          )}

          {d.recent.length > 0 && (
            <Section title="Atividade recente">
              <ul className="space-y-3">
                {d.recent.map((r) => (
                  <li key={r.id} className="text-sm">
                    <p className="text-ink">{r.summary}</p>
                    <p className="text-[0.75rem] text-ink-3">
                      {r.user ?? "—"} · {formatRelative(r.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
