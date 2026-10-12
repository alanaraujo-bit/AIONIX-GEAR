"use client";

import * as React from "react";
import { HandCoins, Ban, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Money } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { METHOD_LABEL, TITLE_STATUS_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { settleAction, writeOffTitleAction } from "@/app/(app)/financeiro/actions";

export type TitleView = {
  id: string;
  direction: string;
  description: string;
  amountCents: number;
  settledCents: number;
  openCents: number;
  dueDate: Date | string;
  status: string;
  installmentNo: number | null;
  installmentCount: number | null;
  sourceType?: string;
  settlements: { id: string; amountCents: number; kind: string; date: Date | string; note: string | null; account: string | null; method: string | null; reversal: boolean }[];
};

const STATUS_TONE: Record<string, Tone> = { OPEN: "warning", PARTIAL: "info", PAID: "positive", CANCELLED: "muted" };
const KIND_LABEL: Record<string, string> = { PAYMENT: "Pagamento", TRADE_IN: "Itens na troca", CANCELLATION: "Abatimento/cancelamento", FEE: "Taxa retida" };

function fmtDate(d: Date | string, tz = "America/Belem") {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: tz });
}

/** Lista de títulos de uma operação com baixa (pagamento/recebimento) e histórico. */
export function TitleList({
  titles,
  accounts,
  canSettle,
  canWriteOff,
  emptyText = "Nenhum valor financeiro vinculado.",
  tz = "America/Belem",
}: {
  tz?: string;
  titles: TitleView[];
  accounts: { id: string; name: string }[];
  canSettle: boolean;
  canWriteOff?: boolean;
  emptyText?: string;
}) {
  const [settling, setSettling] = React.useState<TitleView | null>(null);
  if (!titles.length) return <p className="text-sm text-ink-3">{emptyText}</p>;
  const today = new Date();
  return (
    <>
      <ul className="divide-y divide-line">
        {titles.map((t) => {
          const overdue = (t.status === "OPEN" || t.status === "PARTIAL") && new Date(t.dueDate) < new Date(today.toDateString());
          return (
            <li key={t.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {t.direction === "RECEIVABLE" ? "A receber" : "A pagar"}
                    {t.installmentNo ? ` · parcela ${t.installmentNo}/${t.installmentCount}` : ""}
                  </p>
                  <p className="text-[0.8125rem] text-ink-3">{t.description}</p>
                  <p className={cn("text-[0.8125rem]", overdue ? "text-negative" : "text-ink-3")}>
                    Vencimento {fmtDate(t.dueDate, tz)}
                    {overdue && " · atrasado"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Money cents={t.amountCents} className="font-medium" />
                  <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{TITLE_STATUS_LABEL[t.status] ?? t.status}</Badge>
                  {t.openCents > 0 && t.status !== "CANCELLED" && <span className="num text-[0.75rem] text-ink-3">em aberto {formatBRL(t.openCents)}</span>}
                </div>
              </div>
              {t.settlements.length > 0 && (
                <ul className="mt-2 space-y-1 border-l-2 border-line pl-3">
                  {t.settlements.map((s) => (
                    <li key={s.id} className={cn("flex items-baseline justify-between gap-3 text-[0.8125rem]", s.reversal && "text-ink-3 line-through decoration-ink-3/40")}>
                      <span className="text-ink-2">
                        {s.reversal ? "Estorno" : KIND_LABEL[s.kind] ?? s.kind} · {fmtDate(s.date, tz)}
                        {s.account ? ` · ${s.account}` : ""}
                        {s.method ? ` · ${METHOD_LABEL[s.method] ?? s.method}` : ""}
                        {s.note && <span className="block text-ink-3">{s.note}</span>}
                      </span>
                      <Money cents={s.amountCents} />
                    </li>
                  ))}
                </ul>
              )}
              {(t.status === "OPEN" || t.status === "PARTIAL") && (canSettle || canWriteOff) && (
                <div className="mt-2 flex gap-2">
                  {canSettle && (
                    <Button size="sm" onClick={() => setSettling(t)}>
                      <HandCoins /> {t.direction === "RECEIVABLE" ? "Registrar recebimento" : "Registrar pagamento"}
                    </Button>
                  )}
                  {canWriteOff && <WriteOff title={t} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <SettleSheet title={settling} onClose={() => setSettling(null)} accounts={accounts} tz={tz} />
    </>
  );
}

function WriteOff({ title }: { title: TitleView }) {
  const { run, pending } = useAction(writeOffTitleAction);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={async () => {
        const c = await confirmDialog({
          title: "Cancelar o saldo em aberto?",
          description: `O valor em aberto (${formatBRL(title.openCents)}) deixa de ser cobrado/devido. O que já foi pago continua registrado.`,
          input: { label: "Motivo", required: true },
          confirmLabel: "Cancelar saldo",
          tone: "danger",
        });
        if (c.ok) run({ titleId: title.id, reason: c.value });
      }}
    >
      <Ban /> Cancelar saldo
    </Button>
  );
}

export function SettleSheet({ title, onClose, accounts, tz = "America/Belem" }: { title: TitleView | null; onClose: () => void; accounts: { id: string; name: string }[]; tz?: string }) {
  const [amount, setAmount] = React.useState<number | null>(null);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [method, setMethod] = React.useState("PIX");
  const [date, setDate] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (title) {
      setAmount(title.openCents);
      setDate(new Date().toLocaleDateString("sv-SE", { timeZone: tz }));
      setNote("");
    }
  }, [title, tz]);
  const { run, pending } = useAction(settleAction, { onSuccess: onClose });
  const receiving = title?.direction === "RECEIVABLE";
  return (
    <Sheet
      open={!!title}
      onOpenChange={(o) => !o && onClose()}
      title={receiving ? "Registrar recebimento" : "Registrar pagamento"}
      description={title?.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!amount || !accountId}
            onClick={() => title && run((key) => ({ idempotencyKey: key, titleId: title.id, amountCents: amount!, accountId, method, dateInput: date, note: note || null }))}
          >
            <CheckCircle2 /> Confirmar {amount ? formatBRL(amount) : ""}
          </Button>
        </>
      }
    >
      {title && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            Em aberto: <Money cents={title.openCents} className="font-semibold text-ink" />. Pode registrar um valor parcial.
          </p>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={receiving ? "Entrou na conta" : "Saiu da conta"}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Forma">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Observação (opcional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: comprovante PIX 12/10" />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
