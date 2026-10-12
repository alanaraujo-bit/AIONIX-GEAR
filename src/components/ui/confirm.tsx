"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter } from "./dialog";
import { Button } from "./button";
import { Field, Input, Textarea } from "./field";

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  /** Pede um texto (ex.: motivo). Retorna em `value`. */
  input?: { label: string; placeholder?: string; required?: boolean; multiline?: boolean; minLength?: number };
  /** Exige digitar uma palavra exata para confirmar ações irreversíveis. */
  typeToConfirm?: string;
};

type Pending = ConfirmOptions & { resolve: (r: { ok: boolean; value: string }) => void };

let push: ((p: Pending) => void) | null = null;

/** Abre a confirmação e espera a decisão do usuário. */
export function confirmDialog(opts: ConfirmOptions): Promise<{ ok: boolean; value: string }> {
  return new Promise((resolve) => {
    if (!push) {
      resolve({ ok: false, value: "" });
      return;
    }
    push({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [current, setCurrent] = React.useState<Pending | null>(null);
  const [value, setValue] = React.useState("");
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    push = (p) => {
      setValue("");
      setTyped("");
      setCurrent(p);
    };
    return () => {
      push = null;
    };
  }, []);
  const close = (ok: boolean) => {
    current?.resolve({ ok, value: value.trim() });
    setCurrent(null);
  };
  const minLen = current?.input?.required ? current.input.minLength ?? 3 : 0;
  const blocked = (current?.input?.required && value.trim().length < minLen) || (current?.typeToConfirm && typed.trim().toUpperCase() !== current.typeToConfirm.toUpperCase());
  return (
    <Dialog open={!!current} onOpenChange={(o) => !o && close(false)}>
      {current && (
        <DialogContent title={current.title} description={current.description}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!blocked) close(true);
            }}
          >
            {current.input && (
              <Field label={current.input.label} hint={current.input.required ? `Obrigatório (mínimo ${minLen} caracteres) — fica registrado no histórico.` : undefined}>
                {current.input.multiline ? (
                  <Textarea autoFocus value={value} placeholder={current.input.placeholder} onChange={(e) => setValue(e.target.value)} />
                ) : (
                  <Input autoFocus value={value} placeholder={current.input.placeholder} onChange={(e) => setValue(e.target.value)} />
                )}
              </Field>
            )}
            {current.typeToConfirm && (
              <Field label={`Digite ${current.typeToConfirm} para confirmar`} className="mt-3">
                <Input autoFocus={!current.input} value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                {current.cancelLabel ?? "Voltar"}
              </Button>
              <Button type="submit" variant={current.tone === "danger" ? "danger" : "primary"} disabled={!!blocked} autoFocus={!current.input && !current.typeToConfirm}>
                {current.confirmLabel ?? "Confirmar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
