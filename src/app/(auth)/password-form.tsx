"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/layout";
import type { ActionResult } from "@/server/action";

/** Formulário compartilhado: definir senha por link / aceitar convite. */
export function PasswordForm({
  submit,
  askName,
  defaultName,
  existingAccount,
  cta,
}: {
  submit: (input: { name?: string; password: string }) => Promise<ActionResult<{ next: string }>>;
  askName?: boolean;
  defaultName?: string;
  existingAccount?: boolean;
  cta: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const strength = password.length >= 14 ? 3 : password.length >= 10 ? 2 : password.length > 0 ? 1 : 0;

  return (
    <form
      className="mt-8 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!existingAccount && password !== confirm) {
          setError("As senhas não conferem.");
          return;
        }
        start(async () => {
          const r = await submit({ name: askName ? name : undefined, password });
          if (r.ok) {
            router.replace(r.data.next);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      {error && <Callout tone="negative">{error}</Callout>}
      {askName && !existingAccount && (
        <Field label="Seu nome" htmlFor="name">
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <Field
        label={existingAccount ? "Sua senha atual" : "Crie uma senha"}
        htmlFor="password"
        hint={existingAccount ? "Você já tem conta: confirme com sua senha para entrar nesta empresa." : "Pelo menos 10 caracteres. Uma frase curta é mais forte que uma palavra com símbolos."}
      >
        <Input
          id="password"
          type="password"
          autoComplete={existingAccount ? "current-password" : "new-password"}
          required
          minLength={existingAccount ? 1 : 10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {!existingAccount && (
        <>
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${strength >= n ? (strength === 1 ? "bg-negative" : strength === 2 ? "bg-warning" : "bg-positive") : "bg-line"}`}
              />
            ))}
          </div>
          <Field label="Repita a senha" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2">
        {cta}
      </Button>
    </form>
  );
}
