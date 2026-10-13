"use client";

import * as React from "react";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker, type ContactOption } from "@/components/app/pickers";
import { useAction } from "@/components/ui/use-action";
import { METHOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { expenseAction } from "../actions";

export function ExpenseForm({ accounts, contacts, categories, today }: { accounts: { id: string; name: string; kind?: string }[]; contacts: ContactOption[]; categories: { id: string; name: string; type: string }[]; today: string }) {
  const [kind, setKind] = React.useState<"EXPENSE" | "INCOME">("EXPENSE");
  const cats = categories.filter((c) => c.type === kind);
  const [categoryId, setCategoryId] = React.useState(cats[0]?.id ?? "");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today);
  const [paid, setPaid] = React.useState(true);
  const [accountId, setAccountId] = React.useState(accounts.find((a) => a.kind !== "CASH")?.id ?? accounts[0]?.id ?? "");
  const [method, setMethod] = React.useState("PIX");
  const [due, setDue] = React.useState(today);
  const [installments, setInstallments] = React.useState(1);
  const [contactId, setContactId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setCategoryId(categories.find((c) => c.type === kind)?.id ?? "");
  }, [kind, categories]);
  const { run, pending } = useAction(expenseAction, {
    onSuccess: () => {
      setDescription("");
      setAmount(null);
    },
  });
  return (
    <Section>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run((key) => ({ idempotencyKey: key, kind, categoryId, description, amountCents: amount ?? 0, dateInput: date, contactId, paid, accountId, method, dueDateInput: paid ? null : due, installments }));
        }}
      >
        <SegmentedControl
          value={kind}
          onChange={setKind}
          options={[
            { value: "EXPENSE", label: "Despesa" },
            { value: "INCOME", label: "Receita avulsa" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
        </div>
        <Field label="Descrição" required>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "EXPENSE" ? "Ex.: Internet fibra — outubro" : "Ex.: Formatação e limpeza de PC de cliente"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data (competência)">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={kind === "EXPENSE" ? "Pago a" : "Recebido de"}>
            <ContactPicker value={contactId} onChange={setContactId} options={contacts} placeholder="Opcional" />
          </Field>
        </div>
        <SegmentedControl
          value={paid ? "y" : "n"}
          onChange={(v) => setPaid(v === "y")}
          options={[
            { value: "y", label: kind === "EXPENSE" ? "Já paguei" : "Já recebi" },
            { value: "n", label: kind === "EXPENSE" ? "A pagar" : "A receber" },
          ]}
        />
        {paid ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Conta">
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
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="1º vencimento">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label="Parcelas">
              <Select value={String(installments)} onChange={(e) => setInstallments(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}×{amount ? ` ${formatBRL(Math.floor(amount / n))}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Button type="submit" variant="primary" loading={pending} disabled={!amount || description.trim().length < 2 || !categoryId}>
          Lançar {amount ? formatBRL(amount) : ""}
        </Button>
      </form>
    </Section>
  );
}
