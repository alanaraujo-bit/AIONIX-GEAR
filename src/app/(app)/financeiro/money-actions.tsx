"use client";

import * as React from "react";
import { ArrowLeftRight, PiggyBank, Scale, MoreHorizontal, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Callout, Money } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { formatBRL } from "@/lib/money";
import { transferAction, capitalAction, reconcileAction } from "./actions";

type Acc = { id: string; name: string; kind: string; balanceCents: number };

function today() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Belem" });
}

export function MoneyActions({ accounts }: { accounts: Acc[] }) {
  const [sheet, setSheet] = React.useState<null | "transfer" | "capital" | "reconcile">(null);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button size="sm">
            <MoreHorizontal /> Movimentar
          </Button>
        </MenuTrigger>
        <MenuContent className="w-64">
          <MenuItem onSelect={() => setSheet("transfer")}>
            <ArrowLeftRight /> Transferir entre contas
          </MenuItem>
          <MenuItem onSelect={() => setSheet("capital")}>
            <PiggyBank /> Aporte ou retirada do dono
          </MenuItem>
          <MenuItem onSelect={() => setSheet("reconcile")}>
            <Scale /> Conferir saldo (conciliação)
          </MenuItem>
        </MenuContent>
      </Menu>
      <TransferSheet open={sheet === "transfer"} onClose={() => setSheet(null)} accounts={accounts} />
      <CapitalSheet open={sheet === "capital"} onClose={() => setSheet(null)} accounts={accounts} />
      <ReconcileSheet open={sheet === "reconcile"} onClose={() => setSheet(null)} accounts={accounts} />
    </>
  );
}

function TransferSheet({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: Acc[] }) {
  const [from, setFrom] = React.useState(accounts[0]?.id ?? "");
  const [to, setTo] = React.useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today());
  const [desc, setDesc] = React.useState("");
  const { run, pending } = useAction(transferAction, { onSuccess: onClose });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Transferir entre contas"
      description="Ex.: depositou o dinheiro da gaveta no banco. Não muda o total, só onde ele está."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!amount || from === to} onClick={() => run((key) => ({ idempotencyKey: key, fromAccountId: from, toAccountId: to, amountCents: amount!, dateInput: date, description: desc || undefined }))}>
            Transferir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="De">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Para">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição (opcional)">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function CapitalSheet({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: Acc[] }) {
  const [kind, setKind] = React.useState<"CAPITAL_IN" | "WITHDRAWAL">("WITHDRAWAL");
  const [acc, setAcc] = React.useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today());
  const [desc, setDesc] = React.useState("");
  const { run, pending } = useAction(capitalAction, { onSuccess: onClose });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Aporte ou retirada"
      description="Dinheiro que você colocou no negócio ou tirou para uso pessoal. Mexe no caixa, não no lucro."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!amount} onClick={() => run((key) => ({ idempotencyKey: key, kind, accountId: acc, amountCents: amount!, dateInput: date, description: desc || undefined }))}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          value={kind}
          onChange={setKind}
          options={[
            { value: "WITHDRAWAL", label: "Retirada (pro-labore)" },
            { value: "CAPITAL_IN", label: "Aporte" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Conta">
            <Select value={acc} onChange={(e) => setAcc(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Descrição">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function ReconcileSheet({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: Acc[] }) {
  const [acc, setAcc] = React.useState(accounts[0]?.id ?? "");
  const [actual, setActual] = React.useState<number | null>(null);
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState(today());
  const a = accounts.find((x) => x.id === acc);
  const diff = actual !== null && a ? actual - a.balanceCents : null;
  const { run, pending } = useAction(reconcileAction, { success: (d) => (d.diffCents === 0 ? "Saldo confere — nenhum ajuste" : `Ajuste de ${formatBRL(d.diffCents)} registrado`), onSuccess: onClose });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Conferir saldo"
      description="Compare com o extrato do banco ou com a contagem do dinheiro. A diferença vira um ajuste explícito, com motivo — nada é alterado em silêncio."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={actual === null || (diff !== 0 && note.trim().length < 3)} onClick={() => run({ accountId: acc, actualBalanceCents: actual!, dateInput: date, note: note || "Saldo conferido" })}>
            {diff === 0 ? "Confirmar que confere" : "Registrar ajuste"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Conta">
          <Select value={acc} onChange={(e) => setAcc(e.target.value)}>
            {accounts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        {a && (
          <p className="text-sm text-ink-2">
            Saldo no sistema: <Money cents={a.balanceCents} className="font-semibold text-ink" />
          </p>
        )}
        <Field label="Saldo real (extrato / contagem)">
          <MoneyInput value={actual} onChange={setActual} autoFocus />
        </Field>
        {diff !== null && diff !== 0 && (
          <Callout tone="warning" icon={HandCoins}>
            Diferença de <strong className="num">{formatBRL(diff)}</strong>. Antes de ajustar, confira se falta registrar alguma venda, compra ou despesa.
          </Callout>
        )}
        {diff !== null && diff !== 0 && (
          <Field label="Motivo do ajuste" required>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: tarifas bancárias de outubro não lançadas" />
          </Field>
        )}
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
