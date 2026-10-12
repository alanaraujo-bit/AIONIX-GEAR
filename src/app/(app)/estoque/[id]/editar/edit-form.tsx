"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select, Checkbox } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useAction } from "@/components/ui/use-action";
import { SPEC_FIELDS } from "@/server/domain/compat";
import { CONDITION_LABEL, COMPLETENESS_FIELDS } from "@/lib/labels";
import { updateItemAction } from "../../actions";

type Initial = {
  id: string;
  version: number;
  title: string;
  serial: string;
  condition: string;
  defects: string;
  completeness: Record<string, boolean>;
  accessories: string;
  specs: Record<string, string>;
  productSpecs: Record<string, string>;
  expectedPriceCents: number | null;
  minPriceCents: number | null;
  estimatedValueCents: number | null;
  estimatedValueNote: string;
  warrantyUntil: string;
  warrantyNotes: string;
  tags: string;
  notes: string;
  tracking: string;
};

export function EditItemForm({ initial, kind, seeCost }: { initial: Initial; kind: string; seeCost: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((s) => ({ ...s, [k]: val }));
  const { run, pending, fields } = useAction(updateItemAction, { onSuccess: () => router.push(`/estoque/${initial.id}`) });
  const specFields = SPEC_FIELDS[kind] ?? [];
  return (
    <form
      className="grid max-w-4xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const specs = Object.fromEntries(Object.entries(v.specs).filter(([, x]) => x.trim() !== ""));
        run({
          id: v.id,
          version: v.version,
          title: v.title,
          serial: v.serial || null,
          condition: v.condition as never,
          defects: v.defects || null,
          completeness: v.completeness,
          accessories: v.accessories || null,
          specs,
          expectedPriceCents: v.expectedPriceCents,
          minPriceCents: v.minPriceCents,
          estimatedValueCents: v.estimatedValueCents,
          estimatedValueNote: v.estimatedValueNote || null,
          warrantyUntil: v.warrantyUntil ? new Date(`${v.warrantyUntil}T12:00:00`) : null,
          warrantyNotes: v.warrantyNotes || null,
          tags: v.tags.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean),
          notes: v.notes || null,
        });
      }}
    >
      <Section title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome de exibição" required error={fields.title}>
            <Input value={v.title} onChange={(e) => set("title", e.target.value)} required minLength={2} />
          </Field>
          {v.tracking === "UNIT" && (
            <Field label="Número de série">
              <Input value={v.serial} onChange={(e) => set("serial", e.target.value)} className="code" />
            </Field>
          )}
        </div>
        {specFields.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[0.8125rem] font-medium text-ink-2">Especificações desta unidade</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {specFields.map((f) => (
                <Field key={f.key} label={<span className="text-[0.75rem]">{f.label}</span>}>
                  <Input
                    className="h-9 text-sm"
                    value={v.specs[f.key] ?? ""}
                    placeholder={v.productSpecs[f.key] || f.placeholder}
                    onChange={(e) => set("specs", { ...v.specs, [f.key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <p className="mt-1.5 text-[0.75rem] text-ink-3">Em branco usa o valor do modelo (mostrado em cinza).</p>
          </div>
        )}
      </Section>
      <Section title="Estado">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Condição">
            <Select value={v.condition} onChange={(e) => set("condition", e.target.value)}>
              {Object.entries(CONDITION_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Acessórios">
            <Input value={v.accessories} onChange={(e) => set("accessories", e.target.value)} placeholder="Ex.: suporte anti-sag, cabo adaptador" />
          </Field>
          <Field label="Defeitos e observações de estado" className="sm:col-span-2">
            <Textarea value={v.defects} onChange={(e) => set("defects", e.target.value)} rows={3} />
          </Field>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5 sm:col-span-2">
            {COMPLETENESS_FIELDS.map((c) => (
              <Checkbox key={c.key} label={c.label} checked={!!v.completeness[c.key]} onChange={(e) => set("completeness", { ...v.completeness, [c.key]: e.target.checked })} />
            ))}
          </div>
        </div>
      </Section>
      <Section title="Preço e valor">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço de venda pretendido">
            <MoneyInput value={v.expectedPriceCents} onChange={(c) => set("expectedPriceCents", c)} />
          </Field>
          {seeCost && (
            <Field label="Preço mínimo (só para você)" hint="Referência para negociação; não aparece para vendedores.">
              <MoneyInput value={v.minPriceCents} onChange={(c) => set("minPriceCents", c)} />
            </Field>
          )}
          <Field label="Valor de mercado estimado" hint="Sua estimativa atual. Nunca conta como lucro.">
            <MoneyInput value={v.estimatedValueCents} onChange={(c) => set("estimatedValueCents", c)} />
          </Field>
          <Field label="Fonte da estimativa" hint="Ex.: média de 5 anúncios na OLX em 12/10">
            <Input value={v.estimatedValueNote} onChange={(e) => set("estimatedValueNote", e.target.value)} />
          </Field>
        </div>
      </Section>
      <Section title="Garantia, etiquetas e notas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Garantia até">
            <Input type="date" value={v.warrantyUntil} onChange={(e) => set("warrantyUntil", e.target.value)} />
          </Field>
          <Field label="Observação da garantia">
            <Input value={v.warrantyNotes} onChange={(e) => set("warrantyNotes", e.target.value)} placeholder="Ex.: garantia de fábrica com nota" />
          </Field>
          <Field label="Etiquetas" hint="Separe por vírgula" className="sm:col-span-2">
            <Input value={v.tags} onChange={(e) => set("tags", e.target.value)} />
          </Field>
          <Field label="Anotações gerais" className="sm:col-span-2">
            <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </div>
      </Section>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
