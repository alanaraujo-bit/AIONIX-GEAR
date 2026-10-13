"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { PaymentPlan, initialPlan, planPayload, type PaymentPlanValue } from "@/components/app/payment-plan";
import { formatBRL } from "@/lib/money";
import { confirmPurchaseAction, cancelPurchaseAction } from "../actions";

export function PurchaseActions({
  id,
  code,
  status,
  totalCents,
  accounts,
  today,
  paidCents,
}: {
  id: string;
  code: string;
  status: string;
  totalCents: number;
  accounts: { id: string; name: string }[];
  today: string;
  paidCents: number;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [plan, setPlan] = React.useState<PaymentPlanValue>(initialPlan(accounts, today));
  const [refundAccount, setRefundAccount] = React.useState(accounts[0]?.id ?? "");
  const confirm = useAction(confirmPurchaseAction, { onSuccess: () => setConfirming(false) });
  const cancel = useAction(cancelPurchaseAction);
  if (status === "CANCELLED") return null;
  return (
    <>
      {status === "DRAFT" && (
        <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
          <CheckCircle2 /> Confirmar compra
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={cancel.pending}
        onClick={async () => {
          const c = await confirmDialog({
            title: `Cancelar a compra ${code}?`,
            description:
              status === "CONFIRMED"
                ? `Só é possível se nenhuma peça dela já foi usada. As peças serão anuladas${paidCents ? ` e o pagamento de ${formatBRL(paidCents)} registrado como devolvido pelo fornecedor` : ""}.`
                : "O rascunho será marcado como cancelado.",
            input: { label: "Motivo", required: true },
            confirmLabel: "Cancelar compra",
            tone: "danger",
          });
          if (c.ok) cancel.run({ id, reason: c.value, refundAccountId: paidCents ? refundAccount : null });
        }}
      >
        <XCircle /> Cancelar
      </Button>
      {status === "CONFIRMED" && paidCents > 0 && accounts.length > 1 && (
        <Select aria-label="Conta que recebe o estorno" value={refundAccount} onChange={(e) => setRefundAccount(e.target.value)} wrapperClassName="hidden w-44 sm:block" title="Conta do estorno, se cancelar">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              Estorno em: {a.name}
            </option>
          ))}
        </Select>
      )}
      <Sheet
        open={confirming}
        onOpenChange={setConfirming}
        title={`Confirmar compra ${code}`}
        description="As peças entram no estoque com custo rateado e o pagamento é registrado."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <Button variant="primary" loading={confirm.pending} onClick={() => confirm.run((key) => ({ id, idempotencyKey: key, payment: planPayload(plan) as never }))}>
              Confirmar ({formatBRL(totalCents)})
            </Button>
          </>
        }
      >
        <Field label="Pagamento">
          <PaymentPlan value={plan} onChange={setPlan} totalCents={totalCents} accounts={accounts} direction="out" />
        </Field>
        <Callout tone="neutral" className="mt-4">
          O que não for pago agora vira conta a pagar, com vencimento.
        </Callout>
      </Sheet>
    </>
  );
}
