import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, TriangleAlert, Sparkles, Info, ArrowRight, Lightbulb } from "lucide-react";
import { requirePage } from "@/server/session";
import { computeInsights, type Insight } from "@/server/domain/insights";
import { PageHeader, EmptyState } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Inteligência" };

const SEV = {
  risk: { icon: CircleAlert, label: "Risco", tone: "negative" as const, cls: "text-negative" },
  warn: { icon: TriangleAlert, label: "Atenção", tone: "warning" as const, cls: "text-warning-text" },
  opportunity: { icon: Sparkles, label: "Oportunidade", tone: "positive" as const, cls: "text-positive" },
  info: { icon: Info, label: "Informação", tone: "info" as const, cls: "text-info" },
};
const AREA: Record<Insight["area"], string> = { estoque: "Estoque", preco: "Preço", vendas: "Vendas", financeiro: "Financeiro", catiras: "Catiras", compras: "Compras" };

export default async function InsightsPage() {
  const app = await requirePage("reports.view");
  const insights = await computeInsights(app.ctx, app.settings);
  return (
    <>
      <PageHeader
        title="Inteligência"
        description="Sugestões calculadas a partir dos seus registros, com os números usados à vista. Nenhum preço de mercado é inventado: só usamos as estimativas que você informou."
      />
      {insights.length === 0 ? (
        <div className="surface">
          <EmptyState icon={Lightbulb} title="Nada a apontar por enquanto">
            Conforme você registra compras, vendas e catiras, aparecem aqui alertas de capital parado, margens fracas, vendas com prejuízo, liquidez e oportunidades.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {insights.map((i) => {
            const s = SEV[i.severity];
            return (
              <article key={i.key} className="surface flex flex-col p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <s.icon className={cn("mt-0.5 size-5 shrink-0", s.cls)} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <Badge>{AREA[i.area]}</Badge>
                    </div>
                    <h2 className="text-[0.9375rem] font-semibold leading-snug">{i.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{i.why}</p>
                  </div>
                </div>
                {i.numbers.length > 0 && (
                  <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-[8px] bg-surface-2/70 px-3 py-2 text-[0.8125rem] sm:grid-cols-2">
                    {i.numbers.map((n) => (
                      <div key={n.label} className="flex justify-between gap-3">
                        <dt className="text-ink-3">{n.label}</dt>
                        <dd className="num text-right text-ink">{n.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {i.items && i.items.length > 0 && (
                  <ul className="mt-3 divide-y divide-line text-[0.8125rem]">
                    {i.items.map((it) => (
                      <li key={it.id} className="py-1.5">
                        <Link href={it.href} className="text-ink no-underline hover:text-accent-text">
                          {it.label}
                        </Link>
                        <span className="block text-ink-3">{it.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {i.action && (
                  <Link href={i.action.href} className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium">
                    {i.action.label} <ArrowRight className="size-4" />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
