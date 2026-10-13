"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Truck, Undo2, XCircle, MoreHorizontal, Printer, MessageCircle, Link2, Link2Off, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, Checkbox, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Callout } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { PaymentPlan, initialPlan, planPayload, type PaymentPlanValue } from "@/components/app/payment-plan";
import { waLink } from "@/components/app/share";
import { formatBRL } from "@/lib/money";
import { confirmQuoteAction, deliverAction, cancelSaleAction, returnSaleAction, shareSaleAction } from "../actions";

type SaleLite = { id: string; code: string; status: string; deliveryStatus: string; shareToken: string | null; totalCents: number; tradeInCents: number; feeCents: number; receivedCents: number };
type LineLite = { id: string; description: string; quantity: number; returnedQty: number; unitPriceCents: number };

export function SaleActions({ sale, lines, accounts, today, message, phone }: { sale: SaleLite; lines: LineLite[]; accounts: { id: string; name: string }[]; today: string; message: string; phone: string | null }) {
  const router = useRouter();
  const [closing, setClosing] = React.useState(false);
  const [returning, setReturning] = React.useState(false);
  const deliver = useAction(React.useCallback(() => deliverAction(sale.id), [sale.id]));
  const cancel = useAction(cancelSaleAction);
  const share = useAction(React.useCallback((enable: boolean) => shareSaleAction(sale.id, enable), [sale.id]));
  const isQuote = sale.status === "QUOTE";
  if (sale.status === "CANCELLED") {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={`/imprimir/venda/${sale.id}`} target="_blank">
          <Printer /> Imprimir
        </Link>
      </Button>
    );
  }
  return (
    <>
      {isQuote && (
        <Button variant="primary" size="sm" onClick={() => setClosing(true)}>
          <CheckCircle2 /> Fechar venda
        </Button>
      )}
      {sale.status === "CONFIRMED" && sale.deliveryStatus === "PENDING" && (
        <Button
          variant="primary"
          size="sm"
          loading={deliver.pending}
          onClick={async () => {
            const c = await confirmDialog({ title: "Confirmar entrega?", description: "Os itens saem fisicamente do estoque.", confirmLabel: "Marcar como entregue" });
            if (c.ok) deliver.run(undefined);
          }}
        >
          <Truck /> Marcar entregue
        </Button>
      )}
      <Button asChild size="sm">
        <a href={waLink(message, phone)} target="_blank" rel="noreferrer">
          <MessageCircle /> WhatsApp
        </a>
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button size="icon-sm" aria-label="Mais ações">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent className="w-64">
          <MenuItem onSelect={() => window.open(`/imprimir/venda/${sale.id}`, "_blank")}>
            <Printer /> {isQuote ? "Imprimir orçamento / PDF" : "Imprimir recibo / PDF"}
          </MenuItem>
          <MenuItem
            onSelect={async () => {
              try {
                await navigator.clipboard.writeText(message);
                toast.success("Texto copiado");
              } catch {
                toast.error("Não foi possível copiar.");
              }
            }}
          >
            <Copy /> Copiar texto
          </MenuItem>
          {sale.shareToken ? (
            <>
              <MenuItem
                onSelect={async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/p/${sale.shareToken}`).catch(() => undefined);
                  toast.success("Link copiado");
                }}
              >
                <Link2 /> Copiar link público
              </MenuItem>
              <MenuItem onSelect={() => share.run(false)}>
                <Link2Off /> Desativar link público
              </MenuItem>
            </>
          ) : (
            <MenuItem onSelect={() => share.run(true)}>
              <Link2 /> Criar link público (sem custos)
            </MenuItem>
          )}
          {sale.status === "CONFIRMED" && lines.some((l) => l.returnedQty < l.quantity) && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => setReturning(true)}>
                <Undo2 /> Registrar devolução
              </MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem
            danger
            onSelect={async () => {
              const c = await confirmDialog({
                title: isQuote ? `Cancelar o orçamento ${sale.code}?` : `Cancelar a venda ${sale.code}?`,
                description: isQuote
                  ? "As reservas são liberadas."
                  : `Receita e custo são estornados e os itens voltam ao estoque.${sale.receivedCents ? ` O valor recebido (${formatBRL(sale.receivedCents)}) será registrado como devolvido ao cliente pela mesma conta.` : ""} Taxas e frete já pagos continuam como despesa.`,
                input: { label: "Motivo", required: true },
                confirmLabel: isQuote ? "Cancelar orçamento" : "Cancelar venda",
                tone: "danger",
              });
              if (c.ok) cancel.run({ saleId: sale.id, reason: c.value });
            }}
          >
            <XCircle /> {isQuote ? "Cancelar orçamento" : "Cancelar venda"}
          </MenuItem>
        </MenuContent>
      </Menu>
      {isQuote && <CloseQuoteSheet open={closing} onClose={() => setClosing(false)} sale={sale} accounts={accounts} today={today} onDone={() => router.refresh()} />}
      {sale.status === "CONFIRMED" && <ReturnSheet open={returning} onClose={() => setReturning(false)} sale={sale} lines={lines} accounts={accounts} today={today} />}
    </>
  );
}

function CloseQuoteSheet({ open, onClose, sale, accounts, today, onDone }: { open: boolean; onClose: () => void; sale: SaleLite; accounts: { id: string; name: string }[]; today: string; onDone: () => void }) {
  const [date, setDate] = React.useState(today);
  const [delivered, setDelivered] = React.useState(true);
  const [plan, setPlan] = React.useState<PaymentPlanValue>(initialPlan(accounts, today));
  const toReceive = sale.totalCents - Math.min(sale.feeCents, sale.totalCents);
  const { run, pending } = useAction(confirmQuoteAction, {
    onSuccess: () => {
      onClose();
      onDone();
    },
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Fechar ${sale.code} como venda`}
      description="A partir daqui conta como receita e os itens saem do estoque."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="primary" loading={pending} onClick={() => run((key) => ({ idempotencyKey: key, saleId: sale.id, dateInput: date, delivered, payment: planPayload(plan) as never }))}>
            Fechar venda ({formatBRL(sale.totalCents)})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Data da venda">
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Recebimento">
          <PaymentPlan value={plan} onChange={setPlan} totalCents={toReceive} accounts={accounts} direction="in" />
        </Field>
        {sale.feeCents > 0 && <p className="text-[0.8125rem] text-ink-3">Taxa de {formatBRL(sale.feeCents)} considerada retida pela plataforma/cartão.</p>}
        <Checkbox checked={delivered} onChange={(e) => setDelivered(e.target.checked)} label="Cliente já levou os itens" />
      </div>
    </Sheet>
  );
}

function ReturnSheet({ open, onClose, sale, lines, accounts, today }: { open: boolean; onClose: () => void; sale: SaleLite; lines: LineLite[]; accounts: { id: string; name: string }[]; today: string }) {
  const returnable = lines.filter((l) => l.returnedQty < l.quantity);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [reason, setReason] = React.useState("");
  const [refund, setRefund] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<"NOW" | "PENDING">("NOW");
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [itemStatus, setItemStatus] = React.useState<"RETURNED" | "AVAILABLE" | "DEFECTIVE">("RETURNED");
  const [date, setDate] = React.useState(today);
  React.useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(returnable.map((l) => [l.id, l.quantity - l.returnedQty])));
      setReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const suggested = returnable.reduce((a, l) => a + (qty[l.id] ?? 0) * l.unitPriceCents, 0);
  React.useEffect(() => setRefund(suggested), [suggested]);
  const { run, pending } = useAction(returnSaleAction, { onSuccess: onClose });
  const selected = returnable.filter((l) => (qty[l.id] ?? 0) > 0);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Devolução na venda ${sale.code}`}
      description="Os itens voltam ao estoque pelo custo original; a receita é estornada pelo valor devolvido."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!selected.length || reason.trim().length < 3 || refund === null}
            onClick={() =>
              run((key) => ({
                idempotencyKey: key,
                saleId: sale.id,
                lines: selected.map((l) => ({ saleLineId: l.id, quantity: qty[l.id] })),
                reason,
                refundCents: refund ?? 0,
                refundMode: mode,
                accountId,
                itemStatus,
                dateInput: date,
              }))
            }
          >
            Registrar devolução
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {returnable.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{l.description}</span>
              <Select value={String(qty[l.id] ?? 0)} onChange={(e) => setQty((s) => ({ ...s, [l.id]: Number(e.target.value) }))} wrapperClassName="w-28" aria-label="Quantidade devolvida">
                {Array.from({ length: l.quantity - l.returnedQty + 1 }, (_, i) => i).map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "não devolve" : `${n} un.`}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
        <Field label="Motivo" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Ex.: cliente desistiu; item com defeito em 3 dias" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor a reembolsar" hint={`Sugerido: ${formatBRL(suggested)}`}>
            <MoneyInput value={refund} onChange={setRefund} />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="O item volta como">
          <SegmentedControl
            size="sm"
            value={itemStatus}
            onChange={setItemStatus}
            options={[
              { value: "RETURNED", label: "Para avaliar" },
              { value: "AVAILABLE", label: "Disponível" },
              { value: "DEFECTIVE", label: "Com defeito" },
            ]}
          />
        </Field>
        <Field label="Reembolso">
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "NOW", label: "Devolvido agora" },
              { value: "PENDING", label: "Vou devolver depois" },
            ]}
          />
        </Field>
        {mode === "NOW" && (
          <Field label="Sai da conta">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Callout tone="neutral">Se o cliente ainda devia parcelas, o reembolso abate primeiro o saldo em aberto; só o restante sai do caixa.</Callout>
      </div>
    </Sheet>
  );
}
