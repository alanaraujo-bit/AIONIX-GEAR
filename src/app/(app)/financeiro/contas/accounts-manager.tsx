"use client";

import * as React from "react";
import { Plus, Pencil, Archive, ArchiveRestore, Lock } from "lucide-react";
import { Section, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useAction } from "@/components/ui/use-action";
import { createAccountAction, renameAccountAction, openingBalanceAction, saveFinanceCategoryAction } from "../actions";

type Acc = { id: string; name: string; kind: string; archived: boolean; balanceCents: number; openingCents: number | null };
type Cat = { id: string; name: string; type: string; group: string; archived: boolean };

const KIND: Record<string, string> = { CASH: "Dinheiro em espécie", BANK: "Banco / PIX", DIGITAL: "Carteira digital", OTHER: "Outra" };
const GROUP: Record<string, string> = {
  OPERATING_EXPENSE: "Despesa operacional",
  SALES_EXPENSE: "Despesa de venda",
  OTHER_INCOME: "Outra receita",
  OTHER_EXPENSE: "Outra despesa / ajuste",
  SYSTEM: "Usada pelo sistema",
  CAPITAL: "Capital do dono",
};

export function AccountsManager({ accounts, categories, canManage, today }: { accounts: Acc[]; categories: Cat[]; canManage: boolean; today: string }) {
  const [editing, setEditing] = React.useState<Partial<Acc> | null>(null);
  const [catEditing, setCatEditing] = React.useState<Partial<Cat> | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Contas" actions={canManage ? <Button size="sm" onClick={() => setEditing({ kind: "BANK" })}><Plus /> Nova conta</Button> : undefined} flush>
        <ul className="divide-y divide-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {a.name} {a.archived && <Badge tone="muted">arquivada</Badge>}
                </p>
                <p className="text-[0.75rem] text-ink-3">
                  {KIND[a.kind]} · saldo inicial {a.openingCents === null ? "não informado" : <Money cents={a.openingCents} />}
                </p>
              </div>
              <Money cents={a.balanceCents} className="font-medium" />
              {canManage && (
                <Button size="icon-sm" variant="ghost" aria-label={`Editar ${a.name}`} onClick={() => setEditing(a)}>
                  <Pencil />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Categorias de despesa e receita" actions={canManage ? <Button size="sm" onClick={() => setCatEditing({ type: "EXPENSE", group: "OPERATING_EXPENSE" })}><Plus /> Categoria</Button> : undefined} flush>
        <ul className="divide-y divide-line">
          {categories.map((c) => {
            const locked = c.group === "SYSTEM" || c.group === "CAPITAL";
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {c.name} {c.archived && <Badge tone="muted">arquivada</Badge>}
                  </p>
                  <p className="text-[0.75rem] text-ink-3">
                    {c.type === "EXPENSE" ? "Saída" : "Entrada"} · {GROUP[c.group] ?? c.group}
                  </p>
                </div>
                {locked ? (
                  <Lock className="size-3.5 text-ink-3" aria-label="Categoria do sistema" />
                ) : (
                  canManage && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setCatEditing(c)}>
                      <Pencil />
                    </Button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </Section>
      <AccountSheet value={editing} onClose={() => setEditing(null)} today={today} />
      <CategorySheet value={catEditing} onClose={() => setCatEditing(null)} />
    </div>
  );
}

function AccountSheet({ value, onClose, today }: { value: Partial<Acc> | null; onClose: () => void; today: string }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("BANK");
  const [opening, setOpening] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today);
  React.useEffect(() => {
    if (value) {
      setName(value.name ?? "");
      setKind(value.kind ?? "BANK");
      setOpening(value.openingCents ?? null);
    }
  }, [value]);
  const create = useAction(createAccountAction, { onSuccess: onClose });
  const rename = useAction(renameAccountAction);
  const openingAct = useAction(openingBalanceAction, { onSuccess: onClose });
  const isNew = !value?.id;
  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "Nova conta" : "Editar conta"}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" onClick={() => rename.run({ id: value!.id!, name, archived: !value!.archived }).then((r) => r.ok && onClose())}>
              {value?.archived ? <ArchiveRestore /> : <Archive />} {value?.archived ? "Reativar" : "Arquivar"}
            </Button>
          )}
          <Button
            variant="primary"
            loading={create.pending || rename.pending || openingAct.pending}
            disabled={name.trim().length < 2}
            onClick={async () => {
              if (isNew) create.run({ name, kind: kind as never, openingBalanceCents: opening, openingDateInput: date });
              else {
                const r = await rename.run({ id: value!.id!, name });
                if (r.ok && opening !== (value!.openingCents ?? null)) openingAct.run({ accountId: value!.id!, amountCents: opening ?? 0, dateInput: date });
                else if (r.ok) onClose();
              }
            }}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank, Mercado Pago, Gaveta" autoFocus />
        </Field>
        {isNew && (
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Saldo inicial" hint="Quanto havia na conta quando você começou a usar o sistema.">
            <MoneyInput value={opening} onChange={setOpening} />
          </Field>
          <Field label="Na data de">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {!isNew && <p className="text-[0.8125rem] text-ink-3">Mudar o saldo inicial registra um estorno do anterior e um novo lançamento — nada é apagado.</p>}
      </div>
    </Sheet>
  );
}

function CategorySheet({ value, onClose }: { value: Partial<Cat> | null; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [group, setGroup] = React.useState("OPERATING_EXPENSE");
  React.useEffect(() => {
    if (value) {
      setName(value.name ?? "");
      setGroup(value.group ?? "OPERATING_EXPENSE");
    }
  }, [value]);
  const { run, pending } = useAction(saveFinanceCategoryAction, { onSuccess: onClose });
  const type = group === "OTHER_INCOME" ? "INCOME" : "EXPENSE";
  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          {value?.id && (
            <Button variant="ghost" onClick={() => run({ id: value.id, name, type: type as never, group: group as never, archived: !value.archived })}>
              {value.archived ? "Reativar" : "Arquivar"}
            </Button>
          )}
          <Button variant="primary" loading={pending} disabled={name.trim().length < 2} onClick={() => run({ id: value?.id ?? null, name, type: type as never, group: group as never })}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Grupo no resultado" hint="Define em que linha do relatório de resultado o valor aparece.">
          <Select value={group} onChange={(e) => setGroup(e.target.value)} disabled={!!value?.id}>
            <option value="OPERATING_EXPENSE">Despesa operacional (aluguel, internet…)</option>
            <option value="SALES_EXPENSE">Despesa de venda (taxas, frete, anúncios por venda)</option>
            <option value="OTHER_EXPENSE">Outra despesa / perda</option>
            <option value="OTHER_INCOME">Outra receita (serviços, etc.)</option>
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
