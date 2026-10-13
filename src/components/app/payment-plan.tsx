"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Money } from "@/components/ui/layout";
import { METHOD_LABEL } from "@/lib/labels";
import { splitEven, formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";

export type PaymentPlanValue = {
  now: { key: string; amountCents: number | null; accountId: string; method: string }[];
  installments: number;
  firstDue: string;
  intervalDays: number;
};

export function initialPlan(accounts: { id: string; kind?: string }[], today: string, total = 0): PaymentPlanValue {
  // PIX é o padrão: sugere a primeira conta que não é dinheiro em espécie.
  const bank = accounts.find((a) => a.kind && a.kind !== "CASH") ?? accounts[0];
  return { now: [{ key: "p0", amountCents: total || null, accountId: bank?.id ?? "", method: "PIX" }], installments: 1, firstDue: today, intervalDays: 30 };
}

export function planPayload(v: PaymentPlanValue, tzNoon = "T12:00:00") {
  return {
    now: v.now.filter((p) => p.amountCents && p.amountCents > 0 && p.accountId).map((p) => ({ amountCents: p.amountCents!, accountId: p.accountId, method: p.method as never })),
    remainder: { installments: v.installments, firstDueDate: new Date(`${v.firstDue}${tzNoon}`), intervalDays: v.intervalDays },
  };
}

export function planNowTotal(v: PaymentPlanValue) {
  return v.now.reduce((a, p) => a + (p.amountCents ?? 0), 0);
}

/**
 * Como o dinheiro se move: o que foi pago/recebido agora (em uma ou mais contas)
 * e o restante em parcelas, que viram contas a pagar/receber com vencimento.
 */
export function PaymentPlan({
  value,
  onChange,
  totalCents,
  accounts,
  direction,
}: {
  value: PaymentPlanValue;
  onChange: (v: PaymentPlanValue) => void;
  totalCents: number;
  accounts: { id: string; name: string; kind?: string }[];
  direction: "in" | "out";
}) {
  const nowTotal = planNowTotal(value);
  const remaining = totalCents - nowTotal;
  const parts = remaining > 0 ? splitEven(remaining, Math.max(1, value.installments)) : [];
  const set = (patch: Partial<PaymentPlanValue>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      {value.now.map((p, i) => (
        <div key={p.key} className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1.2fr_1.2fr_1fr_auto] sm:items-end">
          <Field label={i === 0 ? (direction === "in" ? "Recebido agora" : "Pago agora") : undefined}>
            <MoneyInput value={p.amountCents} onChange={(c) => set({ now: value.now.map((x, j) => (j === i ? { ...x, amountCents: c } : x)) })} />
          </Field>
          <Field label={i === 0 ? "Conta" : undefined}>
            <Select value={p.accountId} onChange={(e) => set({ now: value.now.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)) })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={i === 0 ? "Forma" : undefined}>
            <Select
              value={p.method}
              onChange={(e) => {
                const method = e.target.value;
                const cash = accounts.find((a) => (a as { kind?: string }).kind === "CASH");
                const bank = accounts.find((a) => (a as { kind?: string }).kind && (a as { kind?: string }).kind !== "CASH");
                const accountId = method === "CASH" ? cash?.id ?? p.accountId : p.accountId === cash?.id && bank ? bank.id : p.accountId;
                set({ now: value.now.map((x, j) => (j === i ? { ...x, method, accountId } : x)) });
              }}
            >
              {Object.entries(METHOD_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            {value.now.length > 1 ? (
              <Button size="icon" variant="ghost" aria-label="Remover pagamento" onClick={() => set({ now: value.now.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            ) : (
              <span className="hidden size-10 sm:block" />
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => set({ now: [...value.now, { key: crypto.randomUUID(), amountCents: null, accountId: accounts[0]?.id ?? "", method: "CASH" }] })}>
          <Plus /> Dividir em outra forma
        </Button>
        {remaining !== 0 && nowTotal === 0 && (
          <Button size="sm" variant="ghost" onClick={() => set({ now: value.now.map((x, j) => (j === 0 ? { ...x, amountCents: totalCents } : x)) })}>
            {direction === "in" ? "Recebeu tudo agora" : "Pagou tudo agora"}
          </Button>
        )}
      </div>
      {remaining < 0 && <p className="text-sm text-negative">O valor informado passa do total em {formatBRL(-remaining)}.</p>}
      {remaining > 0 && (
        <div className="rounded-[10px] border border-line bg-surface-2/60 p-3">
          <p className="text-sm text-ink">
            Restante <Money cents={remaining} className="font-semibold" /> fica {direction === "in" ? "a receber" : "a pagar"}:
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Parcelas">
              <Select value={String(value.installments)} onChange={(e) => set({ installments: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="1º vencimento">
              <Input type="date" value={value.firstDue} onChange={(e) => set({ firstDue: e.target.value })} />
            </Field>
            <Field label="Intervalo">
              <Select value={String(value.intervalDays)} onChange={(e) => set({ intervalDays: Number(e.target.value) })} disabled={value.installments === 1}>
                <option value="7">semanal</option>
                <option value="15">quinzenal</option>
                <option value="30">mensal</option>
              </Select>
            </Field>
          </div>
          {value.installments > 1 && (
            <p className={cn("mt-2 text-[0.8125rem] text-ink-3")}>
              {parts.map((p) => formatBRL(p)).join(" + ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
