"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { CATEGORY_KIND_LABEL } from "@/lib/labels";
import { saveCategoryAction } from "../actions";

type Cat = { id: string; name: string; kind: string; archived: boolean; products: number };

export function CategoriesManager({ categories }: { categories: Cat[] }) {
  const [editing, setEditing] = React.useState<Partial<Cat> | null>(null);
  return (
    <>
      <Section title="Categorias de itens" description="O tipo técnico (processador, placa-mãe…) habilita as especificações e os avisos de compatibilidade." actions={<Button size="sm" onClick={() => setEditing({ kind: "OTHER" })}><Plus /> Categoria</Button>} flush>
        <ul className="divide-y divide-line">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {c.name} {c.archived && <Badge tone="muted">arquivada</Badge>}
                </p>
                <p className="text-[0.75rem] text-ink-3">
                  Tipo: {CATEGORY_KIND_LABEL[c.kind]} · {c.products} modelo(s)
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
      </Section>
      <CatSheet value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CatSheet({ value, onClose }: { value: Partial<Cat> | null; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("OTHER");
  const [archived, setArchived] = React.useState(false);
  React.useEffect(() => {
    if (value) {
      setName(value.name ?? "");
      setKind(value.kind ?? "OTHER");
      setArchived(value.archived ?? false);
    }
  }, [value]);
  const { run, pending } = useAction(saveCategoryAction, { onSuccess: onClose });
  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={name.trim().length < 2} onClick={() => run({ id: value?.id ?? null, name, kind, archived })}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Tipo técnico">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(CATEGORY_KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {value?.id && <Checkbox label="Arquivada (não aparece em novos cadastros)" checked={archived} onChange={(e) => setArchived(e.target.checked)} />}
      </div>
    </Sheet>
  );
}
