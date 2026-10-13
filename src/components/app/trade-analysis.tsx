import { CircleAlert, TriangleAlert, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { Money } from "@/components/ui/layout";
import { Tooltip } from "@/components/ui/tooltip";
import type { TradeAnalysis } from "@/server/domain/trades";

function Line({ label, hint, children, strong, border }: { label: React.ReactNode; hint?: string; children: React.ReactNode; strong?: boolean; border?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", border && "mt-1 border-t border-line pt-2.5")}>
      <span className={cn("text-sm", strong ? "font-medium text-ink" : "text-ink-2")}>
        {hint ? (
          <Tooltip content={hint}>
            <span className="cursor-help underline decoration-dotted decoration-ink-3/60 underline-offset-4">{label}</span>
          </Tooltip>
        ) : (
          label
        )}
      </span>
      <span className={cn("text-right text-sm", strong && "font-semibold")}>{children}</span>
    </div>
  );
}

/**
 * Explica a economia da catira separando o que é dinheiro, o que é custo e o que é
 * só estimativa. Nada aqui soma valor estimado como se fosse receita.
 */
export function TradeAnalysisPanel({ a, frozen }: { a: TradeAnalysis; frozen?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-[0.75rem] font-medium text-ink-3">O que você entrega</p>
        <Line label="Custo histórico dos itens" hint="Quanto esses itens custaram para você (compra + extras). É esse custo que passa para o que você recebe.">
          {a.outCostStatus === "UNKNOWN" ? <span className="text-warning-text">desconhecido (parcial {Math.round(a.outCostCents / 100)})</span> : <Money cents={a.outCostCents} />}
        </Line>
        <Line label="Valor combinado na troca">
          <Money cents={a.outAgreedCents} />
        </Line>
      </div>
      <div>
        <p className="mb-1 text-[0.75rem] font-medium text-ink-3">O que você recebe</p>
        <Line label="Valor combinado na troca">
          <Money cents={a.inAgreedCents} />
        </Line>
        <Line label="Valor de mercado estimado" hint="Estimativa sua de quanto vale para revender. Nunca vira dinheiro nem receita.">
          {a.inEstimatedCents !== null ? <Money cents={a.inEstimatedCents} /> : <span className="text-ink-3">informe nos itens</span>}
        </Line>
      </div>
      <div>
        <p className="mb-1 text-[0.75rem] font-medium text-ink-3">Dinheiro</p>
        {a.cashInCents > 0 && (
          <Line label="Volta que você recebe">
            <Money cents={a.cashInCents} />
          </Line>
        )}
        {a.cashOutCents > 0 && (
          <Line label="Volta que você paga">
            <Money cents={-a.cashOutCents} />
          </Line>
        )}
        {a.feesCents > 0 && (
          <Line label="Frete / taxas da troca">
            <Money cents={-a.feesCents} />
          </Line>
        )}
        <Line label="Efeito no caixa" strong hint="Só o dinheiro que realmente entra ou sai das suas contas.">
          <Money cents={a.netCashCents} tone="auto" signed />
        </Line>
      </div>
      <div className="rounded-[10px] bg-surface-2 px-3 py-2">
        <Line label="Custo que os itens recebidos vão carregar" strong hint="Custo do que sai + dinheiro pago + taxas − dinheiro recebido. Rateado pelo valor combinado de cada item recebido.">
          <Money cents={a.incomingCostBasisCents} />
        </Line>
        <Line label="Resultado realizado agora" hint="Pela regra conservadora, trocar mercadoria por mercadoria não gera lucro na hora. O lucro aparece quando você vender o que recebeu. Exceção: dinheiro recebido acima do custo do que saiu.">
          <Money cents={a.realizedResultCents} tone="auto" />
        </Line>
        <Line label="Ganho pelos valores combinados (não realizado)" hint="Diferença entre o que você recebe e o que entrega, pelos valores que vocês combinaram, incluindo o dinheiro.">
          <Money cents={a.agreedGainCents} tone="auto" signed />
        </Line>
        <Line label="Potencial de revenda (não realizado)" strong hint="Valor de mercado estimado do que você recebe menos o custo que ele vai carregar. É uma expectativa, não dinheiro.">
          {a.potentialUpsideCents !== null ? <Money cents={a.potentialUpsideCents} tone="auto" signed /> : <span className="text-ink-3">sem estimativa</span>}
        </Line>
      </div>
      {a.in.length > 1 && (
        <div>
          <p className="mb-1 text-[0.75rem] font-medium text-ink-3">Custo de cada item recebido</p>
          {a.in.map((i) => (
            <Line key={i.index} label={`${i.title}${i.quantity > 1 ? ` (${i.quantity} un.)` : ""}`}>
              <Money cents={i.allocatedCostCents} />
            </Line>
          ))}
        </div>
      )}
      {a.warnings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {a.warnings.map((w, i) => {
            const Icon = w.level === "risk" ? CircleAlert : w.level === "warn" ? TriangleAlert : Info;
            return (
              <li key={i} className={cn("flex gap-2 rounded-[8px] px-3 py-2 text-[0.8125rem]", w.level === "risk" ? "bg-negative-soft/70 text-ink" : w.level === "warn" ? "bg-warning-soft/70 text-ink" : "bg-info-soft/60 text-ink-2")}>
                <Icon className={cn("mt-0.5 size-4 shrink-0", w.level === "risk" ? "text-negative" : w.level === "warn" ? "text-warning-text" : "text-info")} />
                {w.text}
              </li>
            );
          })}
        </ul>
      )}
      {frozen && <p className="text-[0.75rem] text-ink-3">Análise registrada no momento da confirmação (não muda depois).</p>}
    </div>
  );
}
