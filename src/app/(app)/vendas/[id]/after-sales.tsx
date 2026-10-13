"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { afterSalesAction } from "../actions";

export function AfterSales({ saleId, initial }: { saleId: string; initial: string }) {
  const [text, setText] = React.useState(initial);
  const action = React.useCallback((t: string) => afterSalesAction(saleId, t), [saleId]);
  const { run, pending } = useAction(action);
  return (
    <div className="flex flex-col gap-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Ex.: cliente ligou em 20/10 relatando ruído; trocado pad térmico em garantia." aria-label="Anotações de pós-venda" />
      <Button size="sm" className="self-end" loading={pending} disabled={text === initial} onClick={() => run(text)}>
        Salvar pós-venda
      </Button>
    </div>
  );
}
