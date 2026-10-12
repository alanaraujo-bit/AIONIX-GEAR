"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { itemNoteAction } from "../actions";

export function NoteForm({ itemId }: { itemId: string }) {
  const [body, setBody] = React.useState("");
  const action = React.useCallback((b: string) => itemNoteAction(itemId, b), [itemId]);
  const { run, pending } = useAction(action, { onSuccess: () => setBody("") });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) run(body);
      }}
      className="flex flex-col gap-2"
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Ex.: cliente do Instagram perguntou, testado em 12/10…" aria-label="Nova anotação" />
      <Button type="submit" size="sm" disabled={!body.trim()} loading={pending} className="self-end">
        Adicionar anotação
      </Button>
    </form>
  );
}
