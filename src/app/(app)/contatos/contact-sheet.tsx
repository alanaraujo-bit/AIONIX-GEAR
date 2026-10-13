"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/field";
import { Callout } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { saveContactAction, duplicateContactsAction } from "./actions";

export type ContactValue = {
  id?: string;
  name: string;
  isCustomer: boolean;
  isSupplier: boolean;
  whatsapp: string;
  phone: string;
  email: string;
  document: string;
  city: string;
  state: string;
  instagram: string;
  notes: string;
  tags: string;
};

const empty: ContactValue = { name: "", isCustomer: true, isSupplier: false, whatsapp: "", phone: "", email: "", document: "", city: "", state: "", instagram: "", notes: "", tags: "" };

export function ContactSheetButton({ initial, label }: { initial?: ContactValue; label?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={initial ? "secondary" : "primary"} size="sm" onClick={() => setOpen(true)}>
        {initial ? <Pencil /> : <Plus />} {label ?? (initial ? "Editar" : "Novo contato")}
      </Button>
      <ContactSheet open={open} onClose={() => setOpen(false)} initial={initial} />
    </>
  );
}

export function ContactSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: ContactValue }) {
  const router = useRouter();
  const [v, setV] = React.useState<ContactValue>(initial ?? empty);
  const [dups, setDups] = React.useState<{ id: string; name: string }[]>([]);
  React.useEffect(() => {
    if (open) setV(initial ?? empty);
  }, [open, initial]);
  React.useEffect(() => {
    if (!open || (!v.name && !v.whatsapp && !v.document)) return setDups([]);
    const t = setTimeout(async () => {
      const r = await duplicateContactsAction({ name: v.name, phone: v.whatsapp || v.phone, document: v.document, excludeId: v.id });
      setDups(r.ok ? r.data : []);
    }, 450);
    return () => clearTimeout(t);
  }, [open, v.name, v.whatsapp, v.phone, v.document, v.id]);
  const { run, pending, fields } = useAction(saveContactAction, {
    onSuccess: (d) => {
      onClose();
      if (!initial) router.push(`/contatos/${d.id}`);
    },
  });
  const set = (k: keyof ContactValue, val: string | boolean) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={initial ? "Editar contato" : "Novo contato"}
      description="Guarde só o necessário para negociar e cobrar (minimização de dados)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={v.name.trim().length < 2}
            onClick={() =>
              run({
                id: v.id ?? null,
                name: v.name,
                isCustomer: v.isCustomer,
                isSupplier: v.isSupplier,
                whatsapp: v.whatsapp || null,
                phone: v.phone || null,
                email: v.email || null,
                document: v.document || null,
                city: v.city || null,
                state: v.state || null,
                instagram: v.instagram || null,
                notes: v.notes || null,
                tags: v.tags.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean),
              })
            }
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" required error={fields.name}>
          <Input value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        {dups.length > 0 && (
          <Callout tone="warning" icon={TriangleAlert} title="Possível duplicado">
            Já existe:{" "}
            {dups.map((d, i) => (
              <React.Fragment key={d.id}>
                {i > 0 && ", "}
                <a href={`/contatos/${d.id}`}>{d.name}</a>
              </React.Fragment>
            ))}
            .
          </Callout>
        )}
        <div className="flex gap-5">
          <Checkbox label="Cliente" checked={v.isCustomer} onChange={(e) => set("isCustomer", e.target.checked)} />
          <Checkbox label="Fornecedor" checked={v.isSupplier} onChange={(e) => set("isSupplier", e.target.checked)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="WhatsApp">
            <Input inputMode="tel" value={v.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(91) 99999-0000" />
          </Field>
          <Field label="Outro telefone">
            <Input inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="E-mail" error={fields.email}>
            <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Instagram">
            <Input value={v.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@usuario" />
          </Field>
          <Field label="Cidade">
            <Input value={v.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="UF">
            <Input value={v.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} />
          </Field>
        </div>
        <Field label="CPF/CNPJ" hint="Só se precisar para recibo ou cobrança.">
          <Input inputMode="numeric" value={v.document} onChange={(e) => set("document", e.target.value)} />
        </Field>
        <Field label="Etiquetas" hint="Ex.: confiável, paga em dia, catira">
          <Input value={v.tags} onChange={(e) => set("tags", e.target.value)} />
        </Field>
        <Field label="Observações">
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
