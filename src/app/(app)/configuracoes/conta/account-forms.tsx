"use client";

import * as React from "react";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { updateProfileAction, changePasswordAction, endOtherSessionsAction } from "../actions";

export function AccountForms({ name, email, role, sessions }: { name: string; email: string; role: string; sessions: number }) {
  const [n, setN] = React.useState(name);
  const [cur, setCur] = React.useState("");
  const [next, setNext] = React.useState("");
  const [conf, setConf] = React.useState("");
  const profile = useAction(updateProfileAction);
  const pw = useAction(changePasswordAction, {
    onSuccess: () => {
      setCur("");
      setNext("");
      setConf("");
    },
  });
  const end = useAction(endOtherSessionsAction);
  return (
    <div className="flex flex-col gap-5">
      <Section title="Perfil" description={`${email} · ${role} nesta empresa`}>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            profile.run({ name: n });
          }}
        >
          <Field label="Seu nome" className="min-w-64 flex-1">
            <Input value={n} onChange={(e) => setN(e.target.value)} />
          </Field>
          <Button type="submit" loading={profile.pending} disabled={n === name}>
            Salvar
          </Button>
        </form>
      </Section>
      <Section title="Senha" description="Ao trocar, as outras sessões abertas são encerradas.">
        <form
          className="grid max-w-md gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== conf) return;
            pw.run({ current: cur, next });
          }}
        >
          <Field label="Senha atual">
            <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="Nova senha" hint="Pelo menos 10 caracteres.">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repita a nova senha" error={conf && next !== conf ? "As senhas não conferem." : null}>
            <Input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" loading={pw.pending} disabled={!cur || next.length < 10 || next !== conf} className="justify-self-start">
            Trocar senha
          </Button>
        </form>
      </Section>
      <Section title="Sessões" description={`${sessions} sessão(ões) ativa(s) nesta conta.`}>
        <Button loading={end.pending} disabled={sessions <= 1} onClick={() => end.run(undefined)}>
          Sair de todos os outros aparelhos
        </Button>
      </Section>
    </div>
  );
}
