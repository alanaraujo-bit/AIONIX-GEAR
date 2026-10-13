"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { cancelExpenseAction } from "../actions";

export function CancelExpense({ refId, description }: { refId: string; description: string }) {
  const { run, pending } = useAction(cancelExpenseAction);
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Cancelar lançamento"
      title="Cancelar lançamento"
      loading={pending}
      onClick={async () => {
        const c = await confirmDialog({ title: `Cancelar “${description}”?`, description: "O resultado é estornado e o dinheiro já movimentado é devolvido à conta (estorno registrado).", input: { label: "Motivo", required: true }, confirmLabel: "Cancelar lançamento", tone: "danger" });
        if (c.ok) run({ refId, reason: c.value });
      }}
    >
      <Undo2 />
    </Button>
  );
}
