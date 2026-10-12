"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Pencil, Archive, ArchiveRestore, MapPin, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { useAction } from "@/components/ui/use-action";
import { LOCATION_KIND_LABEL } from "@/lib/labels";
import { saveLocationAction, archiveLocationAction } from "../actions";

type Node = { id: string; name: string; path: string; kind: string; parentId: string | null; archived: boolean; code: string | null; description: string | null; items: number; units: number };

export function LocationsManager({ nodes, noLocation, canEdit }: { nodes: Node[]; noLocation: number; canEdit: boolean }) {
  const [editing, setEditing] = React.useState<Partial<Node> | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const visible = nodes.filter((n) => showArchived || !n.archived);
  const roots = visible.filter((n) => !n.parentId || !visible.find((p) => p.id === n.parentId));
  const childrenOf = (id: string) => visible.filter((n) => n.parentId === id);
  const total = (id: string): number => (visible.find((n) => n.id === id)?.items ?? 0) + childrenOf(id).reduce((a, c) => a + total(c.id), 0);

  const Row = ({ n, depth }: { n: Node; depth: number }) => (
    <>
      <li className={cn("group flex items-center gap-3 border-b border-line py-2.5 pr-4 last:border-b-0 sm:pr-5", n.archived && "opacity-60")} style={{ paddingLeft: `${16 + depth * 22}px` }}>
        {depth > 0 && <ChevronRight className="-ml-1 size-3.5 shrink-0 text-ink-3" />}
        <MapPin className="size-4 shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <Link href={`/estoque?locationId=${n.id}&group=stock`} className="text-sm font-medium text-ink no-underline hover:text-accent-text">
            {n.name}
          </Link>
          <span className="ml-2 text-[0.75rem] text-ink-3">{LOCATION_KIND_LABEL[n.kind]}</span>
          {n.code && <span className="code ml-2 text-ink-3">{n.code}</span>}
          {n.archived && (
            <Badge tone="muted" className="ml-2">
              Arquivado
            </Badge>
          )}
        </div>
        <span className="num text-[0.8125rem] text-ink-3" title="Itens neste local e nos de dentro">
          {total(n.id)} {total(n.id) === 1 ? "item" : "itens"}
        </span>
        {canEdit && (
          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
            <Button size="icon-sm" variant="ghost" aria-label="Adicionar local dentro" title="Adicionar local dentro" onClick={() => setEditing({ parentId: n.id, kind: "BOX" })}>
              <Plus />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(n)}>
              <Pencil />
            </Button>
            <ArchiveButton n={n} />
          </div>
        )}
      </li>
      {childrenOf(n.id).map((c) => (
        <Row key={c.id} n={c} depth={depth + 1} />
      ))}
    </>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button variant="primary" onClick={() => setEditing({ kind: "ROOM", parentId: null })}>
            <Plus /> Novo local
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[var(--accent)]" /> Mostrar arquivados
        </label>
        {noLocation > 0 && (
          <Link href="/estoque?locationId=none" className="ml-auto inline-flex items-center gap-1.5 text-sm">
            <Package className="size-4" /> {noLocation} item(ns) sem local
          </Link>
        )}
      </div>
      <div className="surface overflow-hidden">
        {roots.length === 0 ? (
          <EmptyState icon={MapPin} title="Nenhum local cadastrado">
            Crie os lugares onde as peças ficam — por exemplo “Quarto” e, dentro dele, “Prateleira A”.
          </EmptyState>
        ) : (
          <ul>
            {roots.map((r) => (
              <Row key={r.id} n={r} depth={0} />
            ))}
          </ul>
        )}
      </div>
      <LocationSheet value={editing} onClose={() => setEditing(null)} nodes={nodes.filter((n) => !n.archived)} />
    </>
  );
}

function ArchiveButton({ n }: { n: Node }) {
  const action = React.useCallback(() => archiveLocationAction(n.id, !n.archived), [n.id, n.archived]);
  const { run, pending } = useAction(action);
  return (
    <Button size="icon-sm" variant="ghost" aria-label={n.archived ? "Reativar" : "Arquivar"} title={n.archived ? "Reativar" : "Arquivar"} loading={pending} onClick={() => run(undefined)}>
      {n.archived ? <ArchiveRestore /> : <Archive />}
    </Button>
  );
}

function LocationSheet({ value, onClose, nodes }: { value: Partial<Node> | null; onClose: () => void; nodes: Node[] }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("ROOM");
  const [parentId, setParentId] = React.useState<string>("");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  React.useEffect(() => {
    if (value) {
      setName(value.name ?? "");
      setKind(value.kind ?? "ROOM");
      setParentId(value.parentId ?? "");
      setCode(value.code ?? "");
      setDescription(value.description ?? "");
    }
  }, [value]);
  const { run, pending } = useAction(saveLocationAction, { onSuccess: onClose });
  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Editar local" : "Novo local"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!name.trim()} onClick={() => run({ id: value?.id ?? null, name, kind, parentId: parentId || null, code: code || null, description: description || null })}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ex.: Prateleira A" />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(LOCATION_KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fica dentro de">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— nenhum (local principal)</option>
            {nodes
              .filter((n) => n.id !== value?.id)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.path}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Código curto (opcional)" hint="Para escrever na caixa ou prateleira. Ex.: P-A, CX-03">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="code" />
        </Field>
        <Field label="Descrição (opcional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
