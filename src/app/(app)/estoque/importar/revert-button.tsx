"use client";

import * as React from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { revertImportAction } from "./actions";

export function RevertButton({ id, name }: { id: string; name: string }) {
  const action = React.useCallback(() => revertImportAction(id), [id]);
  const { run, pending } = useAction(action);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={async () => {
        const c = await confirmDialog({ title: `Desfazer “${name}”?`, description: "Os itens criados por esta importação serão anulados (o histórico fica registrado).", confirmLabel: "Desfazer importação", tone: "danger" });
        if (c.ok) run(undefined);
      }}
    >
      <Undo2 /> Desfazer
    </Button>
  );
}
