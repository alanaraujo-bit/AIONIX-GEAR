"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { LocationSelect } from "@/components/app/pickers";
import { useAction } from "@/components/ui/use-action";
import { startCountAction } from "./actions";

export function NewCount({ locations }: { locations: { id: string; path: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [loc, setLoc] = React.useState<string | null>(null);
  const { run, pending } = useAction(startCountAction, { onSuccess: (d) => router.push(`/estoque/inventarios/${d.id}`) });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> Nova contagem
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Nova contagem"
        description="O sistema lista o que deveria estar no local (incluindo os locais dentro dele)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={pending} disabled={name.trim().length < 2} onClick={() => run({ name, locationId: loc })}>
              Começar contagem
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Contagem da prateleira A — outubro" autoFocus />
          </Field>
          <Field label="Local a contar" hint="Deixe em branco para contar o estoque inteiro.">
            <LocationSelect value={loc} onChange={setLoc} options={locations} emptyLabel="Todos os locais" />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
