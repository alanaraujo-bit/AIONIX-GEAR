"use client";

import * as React from "react";
import { UserPlus, Copy, MessageCircle, KeyRound, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { Section, Callout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { waLink } from "@/components/app/share";
import { ROLE_LABEL, ROLE_DESCRIPTION, type Role } from "@/lib/permissions";
import { formatRelative } from "@/lib/dates";
import { inviteAction, revokeInviteAction, changeRoleAction, removeMemberAction, resetLinkAction } from "../actions";

type Member = { id: string; role: Role; userId: string; name: string; email: string; lastLoginAt: Date | null };
type Invite = { id: string; email: string; name: string | null; role: Role; expiresAt: Date };

export function TeamManager({ members, invites, myUserId, myRole, origin, orgName, tz }: { members: Member[]; invites: Invite[]; myUserId: string; myRole: Role; origin: string; orgName: string; tz: string }) {
  const [inviting, setInviting] = React.useState(false);
  const [link, setLink] = React.useState<{ url: string; title: string; text: string } | null>(null);
  const roleChange = useAction(changeRoleAction);
  const remove = useAction(removeMemberAction);
  const revoke = useAction(revokeInviteAction);
  void tz;
  return (
    <div className="flex flex-col gap-5">
      <Section title="Pessoas com acesso" actions={<Button size="sm" variant="primary" onClick={() => setInviting(true)}><UserPlus /> Convidar</Button>} flush>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.8125rem] font-semibold text-accent-text">{m.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m.name} {m.userId === myUserId && <Badge tone="muted">você</Badge>}
                </p>
                <p className="text-[0.8125rem] text-ink-3">
                  {m.email} · {m.lastLoginAt ? `último acesso ${formatRelative(m.lastLoginAt)}` : "ainda não entrou"}
                </p>
              </div>
              <select
                aria-label={`Papel de ${m.name}`}
                value={m.role}
                disabled={m.userId === myUserId || (m.role === "OWNER" && myRole !== "OWNER") || roleChange.pending}
                onChange={(e) => roleChange.run({ membershipId: m.id, role: e.target.value as Role })}
                className="h-9 rounded-[8px] border border-line-strong bg-surface px-2 text-sm disabled:opacity-60"
              >
                {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== "OWNER" || myRole === "OWNER").map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {m.userId !== myUserId && (
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Gerar link de nova senha"
                    aria-label="Gerar link de nova senha"
                    onClick={async () => {
                      const r = await resetLinkAction(m.id);
                      if (!r.ok) return toast.error(r.error);
                      const url = `${origin}/definir-senha/${r.data.token}`;
                      setLink({ url, title: `Link de nova senha para ${m.name}`, text: `Olá, ${m.name.split(" ")[0]}! Use este link para criar uma nova senha no sistema da ${orgName} (vale por 24h): ${url}` });
                    }}
                  >
                    <KeyRound />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Remover da equipe"
                    aria-label="Remover da equipe"
                    onClick={async () => {
                      const c = await confirmDialog({ title: `Remover ${m.name}?`, description: "O acesso a esta empresa é encerrado imediatamente. O histórico do que a pessoa fez continua registrado.", confirmLabel: "Remover", tone: "danger" });
                      if (c.ok) remove.run(m.id);
                    }}
                  >
                    <UserMinus />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {invites.length > 0 && (
        <Section title="Convites pendentes" flush>
          <ul className="divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{i.name ?? i.email}</p>
                  <p className="text-[0.8125rem] text-ink-3">
                    {i.email} · {ROLE_LABEL[i.role]} · expira {formatRelative(i.expiresAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" loading={revoke.pending} onClick={() => revoke.run(i.id)}>
                  <X /> Revogar
                </Button>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-2.5 text-[0.75rem] text-ink-3">Por segurança, o link de um convite só é mostrado quando ele é criado. Perdeu o link? Revogue e convide de novo.</p>
        </Section>
      )}

      <Section title="O que cada papel pode fazer">
        <dl className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div key={r}>
              <dt className="text-sm font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="text-[0.8125rem] text-ink-2">{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        myRole={myRole}
        onCreated={(token, email, name) => {
          const url = `${origin}/convite/${token}`;
          setLink({ url, title: `Convite para ${name || email}`, text: `Olá${name ? `, ${name.split(" ")[0]}` : ""}! Você foi convidado(a) para o sistema da ${orgName}. Crie seu acesso por este link (vale 7 dias): ${url}` });
        }}
      />
      <Sheet open={!!link} onOpenChange={(o) => !o && setLink(null)} title={link?.title ?? ""} description="Envie por WhatsApp ou outro canal seguro. O link é de uso único.">
        {link && (
          <div className="flex flex-col gap-4">
            <Input readOnly value={link.url} className="code text-[0.8125rem]" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url).catch(() => undefined);
                  toast.success("Link copiado");
                }}
              >
                <Copy /> Copiar link
              </Button>
              <Button asChild variant="primary">
                <a href={waLink(link.text)} target="_blank" rel="noreferrer">
                  <MessageCircle /> Enviar no WhatsApp
                </a>
              </Button>
            </div>
            <Callout tone="warning">Não publique este link. Quem tiver o link pode criar o acesso.</Callout>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function InviteSheet({ open, onClose, myRole, onCreated }: { open: boolean; onClose: () => void; myRole: Role; onCreated: (token: string, email: string, name: string) => void }) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<Role>("SALES");
  const { run, pending } = useAction(inviteAction, {
    success: "Convite criado",
    onSuccess: (d) => {
      onClose();
      onCreated(d.token, email, name);
      setEmail("");
      setName("");
    },
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Convidar pessoa"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!email.includes("@")} onClick={() => run({ email, name, role })}>
            Criar convite
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="E-mail" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Papel" hint={ROLE_DESCRIPTION[role]}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== "OWNER" || myRole === "OWNER").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
