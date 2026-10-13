"use client";

import * as React from "react";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/ui/use-action";
import { saveOrgAction } from "./actions";
import type { OrgSettings } from "@/server/domain/org";

type V = { name: string; legalName: string; document: string; phone: string; email: string; city: string; state: string; timezone: string; settings: OrgSettings };

const TZS = ["America/Belem", "America/Sao_Paulo", "America/Fortaleza", "America/Recife", "America/Manaus", "America/Cuiaba", "America/Porto_Velho", "America/Boa_Vista", "America/Rio_Branco", "America/Noronha"];

export function OrgForm({ initial, canEdit, plan, slug }: { initial: V; canEdit: boolean; plan: string; slug: string }) {
  const [v, setV] = React.useState(initial);
  const s = v.settings;
  const setS = (patch: Partial<OrgSettings>) => setV((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const { run, pending } = useAction(saveOrgAction);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        run({ ...v, settings: { ...s, targetMarginPct: Number(s.targetMarginPct), staleDays: Number(s.staleDays), reservationDays: Number(s.reservationDays), defaultWarrantyDays: Number(s.defaultWarrantyDays) } });
      }}
    >
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <Section title="Empresa" description="Aparece em orçamentos, recibos e fichas técnicas." actions={<Badge tone="neutral">Plano {plan}</Badge>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome de exibição" required>
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Razão social / nome completo">
              <Input value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} />
            </Field>
            <Field label="CPF ou CNPJ" hint="Opcional. Só aparece nos documentos se preenchido.">
              <Input value={v.document} onChange={(e) => setV({ ...v, document: e.target.value })} inputMode="numeric" />
            </Field>
            <Field label="Telefone / WhatsApp">
              <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <Field label="Cidade">
                <Input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
              </Field>
              <Field label="UF">
                <Input value={v.state} maxLength={2} onChange={(e) => setV({ ...v, state: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <Field label="Fuso horário" hint="Define o que é 'hoje' e 'este mês' nos relatórios.">
              <Select value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
                {TZS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("America/", "").replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Endereço da empresa no sistema">
              <Input value={slug} disabled className="code" />
            </Field>
          </div>
        </Section>
        <Section title="Preferências do negócio" description="Usadas em sugestões de preço, alertas e documentos.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Margem-alvo (%)" hint="Usada no preço sugerido: custo ÷ (1 − margem).">
              <Input inputMode="decimal" value={String(s.targetMarginPct)} onChange={(e) => setS({ targetMarginPct: Number(e.target.value.replace(",", ".")) || 0 })} />
            </Field>
            <Field label="Item parado após (dias)">
              <Input inputMode="numeric" value={String(s.staleDays)} onChange={(e) => setS({ staleDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="Validade padrão de orçamento/reserva (dias)">
              <Input inputMode="numeric" value={String(s.reservationDays)} onChange={(e) => setS({ reservationDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="Garantia padrão nas vendas (dias)">
              <Input inputMode="numeric" value={String(s.defaultWarrantyDays)} onChange={(e) => setS({ defaultWarrantyDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="Valor da sua hora de montagem" hint="Só para preço sugerido de montagens (não é despesa).">
              <MoneyInput value={s.ownLaborHourCents || null} onChange={(c) => setS({ ownLaborHourCents: c ?? 0 })} />
            </Field>
            <Field label="Rodapé dos documentos" className="sm:col-span-2" hint="Ex.: chave PIX, política de troca, endereço de retirada.">
              <Textarea value={s.documentFooter} onChange={(e) => setS({ documentFooter: e.target.value })} rows={3} />
            </Field>
          </div>
        </Section>
      </fieldset>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending}>
            Salvar configurações
          </Button>
        </div>
      )}
    </form>
  );
}
