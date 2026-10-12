"use client";

import * as React from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatBRL } from "@/lib/money";

type Point = { day: string; revenue: number; gross: number };

function shortDay(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

/** Receita (barras, cobre) × lucro bruto (linha, azul) no mesmo eixo em R$. */
export function RevenueChart({ data, weekly }: { data: Point[]; weekly?: boolean }) {
  const [table, setTable] = React.useState(false);
  const hasData = data.some((d) => d.revenue !== 0 || d.gross !== 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[var(--viz-1)]" aria-hidden /> Receita
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full bg-[var(--viz-2)]" aria-hidden /> Lucro bruto
        </span>
        <span className="text-ink-3">{weekly ? "por semana" : "por dia"}</span>
        <button onClick={() => setTable((t) => !t)} className="ml-auto text-[0.8125rem] text-accent-text hover:underline">
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {!hasData ? (
        <div className="grid h-56 place-items-center rounded-[8px] border border-dashed border-line text-sm text-ink-3">Nenhuma venda no período.</div>
      ) : table ? (
        <div className="max-h-64 overflow-y-auto rounded-[8px] border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-[0.75rem] text-ink-3">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">{weekly ? "Semana de" : "Dia"}</th>
                <th className="px-3 py-1.5 text-right font-medium">Receita</th>
                <th className="px-3 py-1.5 text-right font-medium">Lucro bruto</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((d) => d.revenue || d.gross)
                .map((d) => (
                  <tr key={d.day} className="border-t border-line">
                    <td className="px-3 py-1.5">{shortDay(d.day)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatBRL(d.revenue)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatBRL(d.gross)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-60" role="img" aria-label="Gráfico de receita e lucro bruto no período">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: "var(--ink-3)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis
                tickFormatter={(v: number) => (Math.abs(v) >= 100_000 ? `${Math.round(v / 100_000)}k` : String(Math.round(v / 100)))}
                tick={{ fill: "var(--ink-3)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-[8px] border border-line bg-surface px-3 py-2 text-[0.8125rem] shadow-[var(--shadow-md)]">
                      <p className="mb-1 font-medium text-ink">{weekly ? `Semana de ${shortDay(String(label))}` : shortDay(String(label))}</p>
                      <p className="flex items-center justify-between gap-6 text-ink-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-[2px] bg-[var(--viz-1)]" /> Receita
                        </span>
                        <span className="num text-ink">{formatBRL(Number(payload.find((p) => p.dataKey === "revenue")?.value ?? 0))}</span>
                      </p>
                      <p className="flex items-center justify-between gap-6 text-ink-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-2.5 rounded-full bg-[var(--viz-2)]" /> Lucro bruto
                        </span>
                        <span className="num text-ink">{formatBRL(Number(payload.find((p) => p.dataKey === "gross")?.value ?? 0))}</span>
                      </p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="revenue" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Line dataKey="gross" type="monotone" stroke="var(--viz-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
