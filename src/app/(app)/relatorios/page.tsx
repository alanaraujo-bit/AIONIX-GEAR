import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleAlert, Download } from "lucide-react";
import { requirePage } from "@/server/session";
import { profitAndLoss, inventorySummary, cashFlow, integrityChecks } from "@/server/domain/reports";
import { monthlyResult, profitBy, inventoryAging, inventoryByCategory, turnover, type ProfitDim } from "@/server/queries/reports";
import { PageHeader, Section, Money, Table, Th, Td, Callout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { PeriodSelect } from "@/components/app/period-select";
import { TX_KIND_LABEL } from "@/lib/labels";
import { formatPct, formatBRL } from "@/lib/money";
import { resolvePeriod, PERIOD_LABEL, formatDate, type PeriodKey } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Relatórios" };

const TABS = [
  { key: "resultado", label: "Resultado" },
  { key: "lucro", label: "Lucro por…" },
  { key: "estoque", label: "Estoque" },
  { key: "caixa", label: "Fluxo de caixa" },
  { key: "verificacao", label: "Verificação" },
];

const DIMS: { key: ProfitDim; label: string }[] = [
  { key: "item", label: "Item" },
  { key: "categoria", label: "Categoria" },
  { key: "cliente", label: "Cliente" },
  { key: "canal", label: "Canal" },
  { key: "compra", label: "Compra de origem" },
  { key: "catira", label: "Catira de origem" },
  { key: "montagem", label: "Montagem" },
];

function Row({ label, cents, strong, sub, indent, hint }: { label: string; cents: number; strong?: boolean; sub?: React.ReactNode; indent?: boolean; hint?: string }) {
  return (
    <tr className={cn("border-b border-line last:border-0", strong && "bg-surface-2/50")}>
      <td className={cn("py-2.5 pl-4 pr-3 text-sm sm:pl-5", indent && "pl-8 text-ink-2 sm:pl-9", strong && "font-semibold")}>
        {label}
        {hint && <span className="block text-[0.75rem] font-normal text-ink-3">{hint}</span>}
      </td>
      <td className={cn("py-2.5 pr-4 text-right sm:pr-5", strong && "font-semibold")}>
        <Money cents={cents} tone={strong ? "auto" : "none"} />
        {sub && <span className="block text-[0.75rem] text-ink-3">{sub}</span>}
      </td>
    </tr>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ aba?: string; periodo?: string; por?: string }> }) {
  const app = await requirePage("reports.view");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.aba) ? sp.aba! : "resultado";
  const period = (Object.keys(PERIOD_LABEL).includes(sp.periodo ?? "") ? sp.periodo : "month") as PeriodKey;
  const p = resolvePeriod(period, app.tz);
  const dim = (DIMS.some((d) => d.key === sp.por) ? sp.por : "categoria") as ProfitDim;

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Relatórios gerenciais, calculados a partir dos lançamentos registrados. Não substituem contabilidade nem documentos fiscais oficiais."
        actions={tab !== "verificacao" && tab !== "estoque" ? <PeriodSelect value={period} /> : undefined}
      />
      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Relatórios">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/relatorios?aba=${t.key}&periodo=${period}`}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium no-underline", tab === t.key ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "resultado" && <ResultTab app={app} p={p} period={period} />}
      {tab === "lucro" && <ProfitTab app={app} p={p} period={period} dim={dim} />}
      {tab === "estoque" && <StockTab app={app} />}
      {tab === "caixa" && <CashTab app={app} p={p} period={period} />}
      {tab === "verificacao" && <CheckTab app={app} />}
    </>
  );
}

type App = Awaited<ReturnType<typeof requirePage>>;

async function ResultTab({ app, p, period }: { app: App; p: ReturnType<typeof resolvePeriod>; period: PeriodKey }) {
  const [pl, prev, months] = await Promise.all([profitAndLoss(app.ctx.orgId, p), p.previous ? profitAndLoss(app.ctx.orgId, p.previous) : null, monthlyResult(app.ctx, app.tz, 12)]);
  const delta = (a: number, b?: number | null) => (b === null || b === undefined || b === 0 ? null : `${a >= b ? "▲" : "▼"} ${formatPct(Math.abs(((a - b) / Math.abs(b)) * 100), 0)} vs. anterior`);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Section title={`Resultado — ${PERIOD_LABEL[period].toLowerCase()}`} description={`${formatDate(p.from, app.tz)} a ${formatDate(p.to, app.tz)}`} actions={<Button asChild size="sm" variant="ghost"><a href={`/api/export/resultado?periodo=${period}`}><Download /> CSV</a></Button>} flush>
        <table className="w-full">
          <tbody>
            <Row label="Receita de vendas" cents={pl.revenueCents} sub={delta(pl.revenueCents, prev?.revenueCents)} hint="Vendas fechadas (devoluções já descontadas)" />
            <Row label="(−) Custo das mercadorias vendidas" cents={-pl.cogsCents} indent hint="Custo real de cada item vendido" />
            <Row label="Lucro bruto" cents={pl.grossProfitCents} strong sub={`margem ${formatPct(pl.grossMarginPct, 1)}`} />
            <Row label="(−) Despesas de venda" cents={-pl.salesExpenseCents} indent hint="Taxas de cartão/plataforma, frete pago" />
            <Row label="Margem de contribuição" cents={pl.contributionCents} strong sub={`${formatPct(pl.contributionMarginPct, 1)}`} />
            <Row label="(−) Despesas operacionais" cents={-pl.operatingExpenseCents} indent hint="Aluguel, internet, anúncios, ferramentas…" />
            <Row label="(+/−) Outras receitas e perdas" cents={pl.otherIncomeCents - pl.otherExpenseCents} indent hint="Ganho em dinheiro de catiras, baixas de estoque, ajustes" />
            <Row label="Resultado líquido" cents={pl.netResultCents} strong sub={delta(pl.netResultCents, prev?.netResultCents) ?? `margem ${formatPct(pl.netMarginPct, 1)}`} />
          </tbody>
        </table>
        {(pl.revenueWithUnknownCostCents > 0 || pl.revenueWithEstimatedCostCents > 0) && (
          <div className="border-t border-line p-4 sm:p-5">
            <Callout tone="warning">
              {pl.revenueWithUnknownCostCents > 0 && (
                <>
                  {formatBRL(pl.revenueWithUnknownCostCents)} da receita vem de itens com <strong>custo desconhecido</strong> — o lucro está superestimado nessa parte.{" "}
                </>
              )}
              {pl.revenueWithEstimatedCostCents > 0 && <>{formatBRL(pl.revenueWithEstimatedCostCents)} vem de itens com custo estimado.</>}
            </Callout>
          </div>
        )}
      </Section>
      <Section title="Mês a mês" description="Últimos 12 meses" flush>
        <Table>
          <thead>
            <tr>
              <Th>Mês</Th>
              <Th align="right">Receita</Th>
              <Th align="right">Lucro bruto</Th>
              <Th align="right" className="hidden sm:table-cell">Despesas</Th>
              <Th align="right">Resultado</Th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.ym}>
                <Td className="text-sm">{new Date(`${m.ym}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "")}</Td>
                <Td align="right">
                  <Money cents={m.revenue} className={m.revenue ? "" : "text-ink-3"} />
                </Td>
                <Td align="right">
                  <Money cents={m.gross} className={m.gross ? "" : "text-ink-3"} />
                </Td>
                <Td align="right" className="hidden sm:table-cell">
                  <Money cents={-(m.salesExp + m.opex)} className="text-ink-2" />
                </Td>
                <Td align="right">
                  <Money cents={m.net} tone="auto" className="font-medium" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
      <Section title="Como os números são calculados" className="xl:col-span-2">
        <ul className="grid gap-x-8 gap-y-2 text-sm text-ink-2 md:grid-cols-2">
          <li>Receita e custo são reconhecidos quando a venda é fechada (não no orçamento, nem quando o dinheiro entra).</li>
          <li>O custo de cada item inclui preço pago, frete, taxas e reparos registrados.</li>
          <li>Catira não gera receita: o custo do que saiu passa para o que entrou; o lucro aparece na revenda.</li>
          <li>Valor de mercado estimado nunca entra no resultado.</li>
          <li>Cancelamentos e devoluções aparecem como lançamentos de estorno na data em que ocorreram.</li>
          <li>Aportes e retiradas do dono mexem no caixa, não no resultado.</li>
        </ul>
      </Section>
    </div>
  );
}

async function ProfitTab({ app, p, period, dim }: { app: App; p: ReturnType<typeof resolvePeriod>; period: PeriodKey; dim: ProfitDim }) {
  const rows = await profitBy(app.ctx, dim, p);
  const tot = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, net: a.net + r.net }), { revenue: 0, net: 0 });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {DIMS.map((d) => (
          <Link key={d.key} href={`/relatorios?aba=lucro&periodo=${period}&por=${d.key}`} className={cn("h-8 rounded-full px-3.5 text-[0.8125rem] font-medium leading-8 no-underline", dim === d.key ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2")}>
            {d.label}
          </Link>
        ))}
      </div>
      <Section title={`Lucro por ${DIMS.find((d) => d.key === dim)!.label.toLowerCase()} — ${PERIOD_LABEL[period].toLowerCase()}`} description="Lucro = receita − custo das mercadorias − taxas e fretes da venda (rateados pela receita)." flush>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-3">Nenhuma venda no período.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{DIMS.find((d) => d.key === dim)!.label}</Th>
                <Th align="right">Receita</Th>
                <Th align="right" className="hidden md:table-cell">Custo</Th>
                <Th align="right" className="hidden md:table-cell">Taxas/frete</Th>
                <Th align="right">Lucro</Th>
                <Th align="right">Margem</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <Td className="max-w-[360px]">
                    {r.href ? (
                      <Link href={r.href} className="text-sm text-ink no-underline hover:text-accent-text">
                        {r.label}
                      </Link>
                    ) : (
                      <span className="text-sm">{r.label}</span>
                    )}
                    {r.unknownRevenue > 0 && <span className="block text-[0.75rem] text-warning-text">inclui itens com custo desconhecido</span>}
                  </Td>
                  <Td align="right">
                    <Money cents={r.revenue} />
                  </Td>
                  <Td align="right" className="hidden md:table-cell">
                    <Money cents={r.cogs} className="text-ink-2" />
                  </Td>
                  <Td align="right" className="hidden md:table-cell">
                    <Money cents={r.salesExpense} className="text-ink-2" />
                  </Td>
                  <Td align="right">
                    <Money cents={r.net} tone="auto" className="font-medium" />
                  </Td>
                  <Td align="right" className={cn("num text-sm", r.marginPct !== null && r.marginPct < 0 ? "text-negative" : "text-ink-2")}>
                    {formatPct(r.marginPct, 0)}
                  </Td>
                </tr>
              ))}
              <tr className="bg-surface-2/60">
                <Td className="font-semibold">Total</Td>
                <Td align="right" className="font-semibold">
                  <Money cents={tot.revenue} />
                </Td>
                <Td className="hidden md:table-cell" />
                <Td className="hidden md:table-cell" />
                <Td align="right" className="font-semibold">
                  <Money cents={tot.net} tone="auto" />
                </Td>
                <Td align="right" className="num text-sm">
                  {formatPct(tot.revenue ? (tot.net / tot.revenue) * 100 : null, 0)}
                </Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}

async function StockTab({ app }: { app: App }) {
  const [inv, aging, cats] = await Promise.all([inventorySummary(app.ctx.orgId), inventoryAging(app.ctx), inventoryByCategory(app.ctx)]);
  const t = await turnover(app.ctx, resolvePeriod("quarter", app.tz), inv.ownedCostCents);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Patrimônio em estoque" actions={<Button asChild size="sm" variant="ghost"><a href="/api/export/estoque"><Download /> CSV</a></Button>}>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-3">Custo investido (próprio)</dt>
            <dd>
              <Money cents={inv.ownedCostCents} className="font-semibold" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Preço pretendido</dt>
            <dd>
              <Money cents={inv.ownedAskingCents} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Valor de mercado estimado (não é lucro)</dt>
            <dd>
              <Money cents={inv.ownedMarketValueCents} /> <span className="text-[0.75rem] text-ink-3">({inv.marketCoverageItems}/{inv.ownedItems} itens com estimativa)</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Itens com custo desconhecido</dt>
            <dd className={inv.unknownCostItems ? "text-warning-text" : ""}>{inv.unknownCostItems}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="text-ink-3">Custo vendido nos últimos 3 meses</dt>
            <dd>
              <Money cents={t.cogsCents} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Cobertura (dias para vender o estoque atual no ritmo atual)</dt>
            <dd className="num">{t.coverageDays ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">De terceiros sob sua guarda</dt>
            <dd className="num">
              {inv.consignedInUnits} consignados · {inv.clientUnits} de clientes
            </dd>
          </div>
        </dl>
      </Section>
      <Section title="Idade do estoque" description="Há quanto tempo o dinheiro está parado em cada faixa." flush>
        <Table>
          <thead>
            <tr>
              <Th>Dias em estoque</Th>
              <Th align="right">Itens</Th>
              <Th align="right">Custo</Th>
              <Th align="right">Preço pretendido</Th>
            </tr>
          </thead>
          <tbody>
            {aging.map((a) => (
              <tr key={a.bucket}>
                <Td className="text-sm">
                  <Link href={a.bucket === "0-30" ? "/estoque?sort=recent" : `/estoque?stale=${a.bucket.split("-")[0].replace("+", "")}&sort=oldest`}>{a.bucket} dias</Link>
                </Td>
                <Td align="right" className="num">
                  {a.items}
                </Td>
                <Td align="right">
                  <Money cents={a.costCents} className={a.bucket === "180+" && a.costCents ? "text-negative" : ""} />
                </Td>
                <Td align="right">
                  <Money cents={a.askingCents} className="text-ink-2" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
      <Section title="Por categoria" className="xl:col-span-2" flush>
        <Table>
          <thead>
            <tr>
              <Th>Categoria</Th>
              <Th align="right">Itens</Th>
              <Th align="right">Unidades</Th>
              <Th align="right">Custo</Th>
              <Th align="right" className="hidden md:table-cell">Preço pretendido</Th>
              <Th align="right" className="hidden md:table-cell">Mercado (estim.)</Th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.name}>
                <Td className="text-sm">
                  {c.name}
                  {c.unknownCost > 0 && <span className="block text-[0.75rem] text-warning-text">{c.unknownCost} sem custo</span>}
                </Td>
                <Td align="right" className="num">
                  {c.items}
                </Td>
                <Td align="right" className="num">
                  {c.units}
                </Td>
                <Td align="right">
                  <Money cents={c.costCents} className="font-medium" />
                </Td>
                <Td align="right" className="hidden md:table-cell">
                  <Money cents={c.askingCents} />
                </Td>
                <Td align="right" className="hidden md:table-cell">
                  <Money cents={c.marketCents} className="text-ink-2" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  );
}

async function CashTab({ app, p, period }: { app: App; p: ReturnType<typeof resolvePeriod>; period: PeriodKey }) {
  const [cf, pl] = await Promise.all([cashFlow(app.ctx.orgId, p), profitAndLoss(app.ctx.orgId, p)]);
  const byKind = Object.entries(
    cf.byKind.reduce<Record<string, { in: number; out: number }>>((a, r) => {
      a[r.kind] ??= { in: 0, out: 0 };
      if (r.direction === "IN") a[r.kind].in += r.amountCents;
      else a[r.kind].out += r.amountCents;
      return a;
    }, {}),
  ).sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out));
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Section title={`Entradas e saídas — ${PERIOD_LABEL[period].toLowerCase()}`} actions={<Button asChild size="sm" variant="ghost"><a href={`/api/export/movimentos?periodo=${period}`}><Download /> CSV</a></Button>} flush>
        <Table>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th align="right">Entradas</Th>
              <Th align="right">Saídas</Th>
            </tr>
          </thead>
          <tbody>
            {byKind.map(([k, v]) => (
              <tr key={k}>
                <Td className="text-sm">{TX_KIND_LABEL[k] ?? k}</Td>
                <Td align="right">{v.in ? <Money cents={v.in} /> : <span className="text-ink-3">—</span>}</Td>
                <Td align="right">{v.out ? <Money cents={v.out} /> : <span className="text-ink-3">—</span>}</Td>
              </tr>
            ))}
            <tr className="bg-surface-2/60 font-semibold">
              <Td>Total</Td>
              <Td align="right">
                <Money cents={cf.inflowCents} />
              </Td>
              <Td align="right">
                <Money cents={cf.outflowCents} />
              </Td>
            </tr>
          </tbody>
        </Table>
      </Section>
      <Section title="Caixa × lucro">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-3">Variação do caixa no período</dt>
            <dd>
              <Money cents={cf.netCents} tone="auto" className="font-semibold" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Resultado (lucro) no período</dt>
            <dd>
              <Money cents={pl.netResultCents} tone="auto" className="font-semibold" />
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          Os dois raramente batem: comprar estoque gasta caixa sem gerar prejuízo; vender a prazo gera lucro antes do dinheiro entrar; aportes e retiradas mexem só no caixa. Por isso o sistema mostra os dois separados.
        </p>
      </Section>
    </div>
  );
}

async function CheckTab({ app }: { app: App }) {
  const res = await integrityChecks(app.ctx.orgId);
  return (
    <Section title="Verificação independente dos números" description="Cada verificação recalcula um valor a partir dos registros originais e compara com o que o sistema mantém. Use para ter certeza de que nada foi corrompido.">
      <ul className="divide-y divide-line">
        {res.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3 py-3">
            {c.ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-positive" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-negative" />}
            <div>
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-[0.8125rem] text-ink-3">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <Callout tone={res.ok ? "positive" : "negative"} className="mt-4">
        {res.ok ? "Tudo confere." : "Há divergências. Exporte o backup e fale com o suporte da plataforma antes de corrigir manualmente."}
      </Callout>
    </Section>
  );
}
