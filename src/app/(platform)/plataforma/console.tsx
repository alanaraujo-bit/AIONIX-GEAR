"use client";

import * as React from "react";
import { Building2, Plus, KeyRound, PauseCircle, PlayCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Section, Table, Th, Td, Callout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Checkbox } from "@/components/ui/field";
import { confirmDialog } from "@/components/ui/confirm";
import { formatRelative } from "@/lib/dates";
import { createOrgAction, setOrgStateAction, ownerResetLinkAction } from "./actions";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isDemo: boolean;
  suspended: boolean;
  createdAt: Date;
  members: number;
  items: number;
  sales: number;
  storageBytes: number;
  lastActivity: Date | null;
  owners: { email: string; name: string; lastLoginAt: Date | null }[];
};

export function PlatformConsole({ orgs, origin }: { orgs: Org[]; origin: string }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-box)] border border-line bg-line sm:grid-cols-4 [&>*]:bg-surface">
        {[
          ["Empresas", orgs.filter((o) => !o.isDemo).length],
          ["Ativas (30 dias)", orgs.filter((o) => o.lastActivity && Date.now() - new Date(o.lastActivity).getTime() < 30 * 86_400_000).length],
          ["Usuários", orgs.reduce((a, o) => a + o.members, 0)],
          ["Itens cadastrados", orgs.reduce((a, o) => a + o.items, 0)],
        ].map(([l, v]) => (
          <div key={String(l)} className="px-4 py-3">
            <p className="text-[0.8125rem] text-ink-3">{l}</p>
            <p className="num text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <Section title="Empresas" actions={<Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus /> Nova empresa</Button>} flush>
        <Table>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Proprietário</Th>
              <Th align="right">Uso</Th>
              <Th>Atividade</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <Td>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Building2 className="size-4 text-ink-3" /> {o.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    <Badge>plano {o.plan}</Badge>
                    {o.isDemo && <Badge tone="info">demonstração</Badge>}
                    {o.suspended && <Badge tone="negative">suspensa</Badge>}
                  </span>
                </Td>
                <Td className="text-[0.8125rem]">
                  {o.owners.map((w) => (
                    <span key={w.email} className="block">
                      {w.name} <span className="text-ink-3">{w.email}</span>
                      <span className="block text-ink-3">{w.lastLoginAt ? `entrou ${formatRelative(w.lastLoginAt)}` : "nunca entrou"}</span>
                    </span>
                  ))}
                </Td>
                <Td align="right" className="num text-[0.8125rem] text-ink-2">
                  {o.members} usuário(s) · {o.items} itens · {o.sales} vendas
                  <span className="block text-ink-3">{(o.storageBytes / 1024 / 1024).toFixed(1)} MB em anexos</span>
                </Td>
                <Td className="text-[0.8125rem] text-ink-3">{o.lastActivity ? formatRelative(o.lastActivity) : "—"}</Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Gerar link de acesso para o proprietário"
                      aria-label="Gerar link de acesso"
                      onClick={async () => {
                        const r = await ownerResetLinkAction(o.id);
                        if (r.ok) setLink(`${origin}/definir-senha/${r.data.token}`);
                        else toast.error(r.error);
                      }}
                    >
                      <KeyRound />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={o.suspended ? "Reativar" : "Suspender"}
                      aria-label={o.suspended ? "Reativar" : "Suspender"}
                      onClick={async () => {
                        const c = await confirmDialog({ title: o.suspended ? `Reativar ${o.name}?` : `Suspender ${o.name}?`, description: o.suspended ? "Os usuários voltam a acessar." : "Ninguém da empresa consegue acessar até reativar. Nenhum dado é apagado.", confirmLabel: o.suspended ? "Reativar" : "Suspender", tone: o.suspended ? "primary" : "danger" });
                        if (!c.ok) return;
                        const r = await setOrgStateAction({ orgId: o.id, suspended: !o.suspended });
                        if (r.ok) router.refresh();
                        else toast.error(r.error);
                      }}
                    >
                      {o.suspended ? <PlayCircle /> : <PauseCircle />}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
      <Callout tone="neutral" className="mt-5">
        Cobrança de assinaturas não está integrada: o campo “plano” serve para organizar limites e ofertas futuras. Nenhum pagamento é processado pela plataforma.
      </Callout>
      <CreateOrg
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          router.refresh();
          if (t) setLink(`${origin}/definir-senha/${t}`);
        }}
      />
      <Sheet open={!!link} onOpenChange={(o) => !o && setLink(null)} title="Link de acesso do proprietário" description="Uso único. Envie por um canal privado (ex.: WhatsApp direto).">
        {link && (
          <div className="flex flex-col gap-3">
            <Input readOnly value={link} className="code text-[0.8125rem]" onFocus={(e) => e.currentTarget.select()} />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(link).catch(() => undefined);
                toast.success("Link copiado");
              }}
            >
              <Copy /> Copiar
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function CreateOrg({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (token: string | null) => void }) {
  const [orgName, setOrgName] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [isDemo, setIsDemo] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nova empresa"
      description="A empresa nasce com categorias, contas e plano de contas padrão. O proprietário define a própria senha pelo link."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={orgName.trim().length < 2 || !ownerEmail.includes("@")}
            onClick={() =>
              start(async () => {
                const r = await createOrgAction({ orgName, ownerEmail, ownerName, isDemo });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Empresa criada");
                onClose();
                onCreated(r.data.setupToken);
                setOrgName("");
                setOwnerEmail("");
                setOwnerName("");
              })
            }
          >
            Criar empresa
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome da empresa">
          <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} autoFocus />
        </Field>
        <Field label="Nome do proprietário">
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="E-mail do proprietário">
          <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        </Field>
        <Checkbox label="Empresa de demonstração" description="Mostra um aviso permanente de dados fictícios." checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
      </div>
    </Sheet>
  );
}
