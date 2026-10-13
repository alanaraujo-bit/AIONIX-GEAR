"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Pencil, XCircle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { PaymentPlan, initialPlan, planPayload, type PaymentPlanValue } from "@/components/app/payment-plan";
import { formatBRL } from "@/lib/money";
import { confirmTradeAction, cancelTradeAction } from "../actions";

type TradeLite = { id: string; code: string; status: string; cashInCents: number; cashOutCents: number; feesCents: number; outCount: number; inCount: number };

export function TradeActions({ trade, accounts, today }: { trade: TradeLite; accounts: { id: string; name: string; kind?: string }[]; today: string }) {
  const [open, setOpen] = React.useState(false);
  const [cashIn, setCashIn] = React.useState<PaymentPlanValue>(initialPlan(accounts, today, trade.cashInCents));
  const [cashOut, setCashOut] = React.useState<PaymentPlanValue>(initialPlan(accounts, today, trade.cashOutCents));
  const [fees, setFees] = React.useState<PaymentPlanValue>(initialPlan(accounts, today, trade.feesCents));
  const confirm = useAction(confirmTradeAction, { onSuccess: () => setOpen(false) });
  const cancel = useAction(cancelTradeAction);
  const isOpen = trade.status === "DRAFT" || trade.status === "NEGOTIATING";
  if (trade.status === "CANCELLED") return null;
  return (
    <>
      {isOpen && (
        <>
          <Button asChild size="sm">
            <Link href={`/catiras/${trade.id}/editar`}>
              <Pencil /> Editar proposta
            </Link>
          </Button>
          <Button variant="primary" size="sm" disabled={!trade.outCount || !trade.inCount} onClick={() => setOpen(true)} title={!trade.outCount || !trade.inCount ? "Precisa de itens dos dois lados" : undefined}>
            <CheckCircle2 /> Confirmar catira
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={cancel.pending}
        onClick={async () => {
          const c = await confirmDialog({
            title: isOpen ? `Cancelar a negociação ${trade.code}?` : `Desfazer a catira ${trade.code}?`,
            description: isOpen
              ? "Seus itens são liberados."
              : "Só é possível se os itens recebidos ainda não foram usados. Eles serão anulados, os seus voltam ao estoque com o custo original e o dinheiro movimentado é estornado.",
            input: { label: "Motivo", required: true },
            confirmLabel: isOpen ? "Cancelar negociação" : "Desfazer catira",
            tone: "danger",
          });
          if (c.ok) cancel.run({ tradeId: trade.id, reason: c.value });
        }}
      >
        {isOpen ? <XCircle /> : <Undo2 />} {isOpen ? "Cancelar" : "Desfazer"}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        width="lg"
        title={`Confirmar ${trade.code}`}
        description="Seus itens saem como trocados, os recebidos entram no estoque (aguardando inspeção) com o custo transferido, e o dinheiro é registrado."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="primary"
              loading={confirm.pending}
              onClick={() =>
                confirm.run((key) => ({
                  tradeId: trade.id,
                  idempotencyKey: key,
                  cashIn: trade.cashInCents ? (planPayload(cashIn) as never) : undefined,
                  cashOut: trade.cashOutCents ? (planPayload(cashOut) as never) : undefined,
                  fees: trade.feesCents ? (planPayload(fees) as never) : undefined,
                }))
              }
            >
              Confirmar troca
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {trade.cashInCents > 0 && (
            <Field label={`Volta que você recebe (${formatBRL(trade.cashInCents)})`}>
              <PaymentPlan value={cashIn} onChange={setCashIn} totalCents={trade.cashInCents} accounts={accounts} direction="in" />
            </Field>
          )}
          {trade.cashOutCents > 0 && (
            <Field label={`Volta que você paga (${formatBRL(trade.cashOutCents)})`}>
              <PaymentPlan value={cashOut} onChange={setCashOut} totalCents={trade.cashOutCents} accounts={accounts} direction="out" />
            </Field>
          )}
          {trade.feesCents > 0 && (
            <Field label={`Frete / taxas (${formatBRL(trade.feesCents)})`}>
              <PaymentPlan value={fees} onChange={setFees} totalCents={trade.feesCents} accounts={accounts} direction="out" />
            </Field>
          )}
          {!trade.cashInCents && !trade.cashOutCents && !trade.feesCents && <Callout tone="neutral">Troca só de itens: nenhum dinheiro movimentado.</Callout>}
          <Callout tone="info">Nenhuma receita é lançada pela troca. O lucro aparece quando você vender o que recebeu.</Callout>
        </div>
      </Sheet>
    </>
  );
}
