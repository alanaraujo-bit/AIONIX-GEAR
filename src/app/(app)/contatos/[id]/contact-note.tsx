"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { contactNoteAction } from "../actions";

export function ContactNote({ contactId }: { contactId: string }) {
  const [body, setBody] = React.useState("");
  const action = React.useCallback((b: string) => contactNoteAction(contactId, b), [contactId]);
  const { run, pending } = useAction(action, { onSuccess: () => setBody("") });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) run(body);
      }}
      className="flex flex-col gap-2"
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Ex.: prefere PIX; procura RTX 4060" aria-label="Nova anotação" />
      <Button type="submit" size="sm" className="self-end" disabled={!body.trim()} loading={pending}>
        Anotar
      </Button>
    </form>
  );
}
