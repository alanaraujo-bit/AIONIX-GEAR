"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker, type ContactOption } from "@/components/app/pickers";
import { useAction } from "@/components/ui/use-action";
import { saveBuildAction } from "./actions";

export type BuildFormValue = {
  id?: string | null;
  name: string;
  purpose: "SALE" | "CUSTOMER_ORDER";
  contactId: string | null;
  description: string;
  targetPriceCents: number | null;
  warrantyDays: string;
  ownLaborCents: number | null;
  notes: string;
  testNotes?: string;
  benchmarks?: string;
};

export function BuildForm({ contacts, defaultWarrantyDays, ownLaborHourCents, initial, onDone }: { contacts: ContactOption[]; defaultWarrantyDays: number; ownLaborHourCents: number; initial?: BuildFormValue; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState<BuildFormValue>(
    initial ?? { name: "", purpose: "SALE", contactId: null, description: "", targetPriceCents: null, warrantyDays: String(defaultWarrantyDays), ownLaborCents: ownLaborHourCents ? ownLaborHourCents * 3 : null, notes: "" },
  );
  const { run, pending, fields } = useAction(saveBuildAction, {
    onSuccess: (d) => {
      if (onDone) onDone();
      else router.push(`/montagens/${d.id}`);
    },
  });
  return (
    <form
      className="max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault();
        run({
          id: v.id ?? null,
          name: v.name,
          purpose: v.purpose,
          contactId: v.contactId,
          description: v.description || null,
          targetPriceCents: v.targetPriceCents,
          warrantyDays: v.warrantyDays ? Number(v.warrantyDays) : null,
          ownLaborCents: v.ownLaborCents ?? 0,
          notes: v.notes || null,
          testNotes: v.testNotes ?? null,
          benchmarks: v.benchmarks ?? null,
        });
      }}
    >
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da montagem" required error={fields.name} className="sm:col-span-2">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: PC Gamer Ryzen 5 + RX 6600" required minLength={2} autoFocus />
          </Field>
          <Field label="Objetivo" className="sm:col-span-2">
            <SegmentedControl
              value={v.purpose}
              onChange={(p) => setV({ ...v, purpose: p })}
              options={[
                { value: "SALE", label: "Montar para vender" },
                { value: "CUSTOMER_ORDER", label: "Encomenda de cliente" },
              ]}
            />
          </Field>
          {v.purpose === "CUSTOMER_ORDER" && (
            <Field label="Cliente" required className="sm:col-span-2" hint="Peças do próprio cliente podem entrar na montagem (sem custo para você).">
              <ContactPicker value={v.contactId} onChange={(id) => setV({ ...v, contactId: id })} options={contacts} role="customer" />
            </Field>
          )}
          <Field label="Preço de venda alvo">
            <MoneyInput value={v.targetPriceCents} onChange={(c) => setV({ ...v, targetPriceCents: c })} />
          </Field>
          <Field label="Garantia da montagem (dias)">
            <Input inputMode="numeric" value={v.warrantyDays} onChange={(e) => setV({ ...v, warrantyDays: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Sua mão de obra (valor atribuído)" hint="Não é despesa nem entra no custo contábil — só é usada para sugerir o preço. Mão de obra paga a terceiros entra como despesa da montagem." className="sm:col-span-2">
            <MoneyInput value={v.ownLaborCents} onChange={(c) => setV({ ...v, ownLaborCents: c })} />
          </Field>
          <Field label="Descrição para o cliente" className="sm:col-span-2" hint="Aparece na ficha técnica e no anúncio.">
            <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={3} placeholder="Ex.: ideal para jogos em 1080p alto, silencioso, pronto para usar" />
          </Field>
          <Field label="Anotações internas" className="sm:col-span-2">
            <Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} />
          </Field>
        </div>
      </Section>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {v.id ? "Salvar" : "Criar e escolher peças"}
        </Button>
      </div>
    </form>
  );
}
