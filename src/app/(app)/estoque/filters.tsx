"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X, Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { confirmDialog } from "@/components/ui/confirm";
import { CONDITION_LABEL, OWNERSHIP_LABEL, STATUS_LABEL } from "@/lib/labels";
import { saveViewAction, deleteViewAction } from "./actions";
import { toast } from "sonner";

export function ItemFilters({
  groups,
  categories,
  locations,
  tags,
  views,
  seeCost,
}: {
  groups: { key: string; label: string }[];
  categories: { id: string; name: string }[];
  locations: { id: string; path: string }[];
  tags: string[];
  views: { id: string; name: string; query: string }[];
  seeCost: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [open, setOpen] = React.useState(false);
  const group = sp.get("group") ?? "stock";

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, pathname, router],
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) update({ q: q.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [q, sp, update]);

  const advancedKeys = ["categoryId", "locationId", "ownership", "condition", "cost", "tag", "stale", "status"];
  const activeCount = advancedKeys.filter((k) => sp.get(k)).length;
  React.useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount]);

  return (
    <div className="mb-4 space-y-3">
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Situação">
        {groups.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={group === g.key}
            onClick={() => update({ group: g.key === "stock" ? null : g.key, status: null })}
            className={cn(
              "h-8 shrink-0 rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors",
              group === g.key ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, série, nome, marca, etiqueta…" className="pl-9" aria-label="Buscar no estoque" />
        </div>
        <Button variant={activeCount ? "secondary" : "ghost"} size="md" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal /> Filtros{activeCount > 0 && <span className="num rounded-full bg-accent px-1.5 text-[0.6875rem] text-accent-ink">{activeCount}</span>}
        </Button>
        <Select aria-label="Ordenar" value={sp.get("sort") ?? "recent"} onChange={(e) => update({ sort: e.target.value === "recent" ? null : e.target.value })} wrapperClassName="w-44">
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigos (parados)</option>
          <option value="name">Nome</option>
          <option value="code">Código</option>
          <option value="price">Maior preço</option>
          {seeCost && <option value="cost">Maior custo</option>}
        </Select>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Visões salvas" title="Visões salvas">
              <Bookmark />
            </Button>
          </MenuTrigger>
          <MenuContent className="w-64">
            <MenuLabel>Visões salvas</MenuLabel>
            {views.length === 0 && <p className="px-2.5 pb-2 text-[0.8125rem] text-ink-3">Salve combinações de filtros que você usa sempre.</p>}
            {views.map((v) => (
              <MenuItem key={v.id} onSelect={() => router.replace(`${pathname}?${v.query}`)}>
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                <button
                  className="text-ink-3 hover:text-negative"
                  aria-label={`Remover ${v.name}`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const r = await deleteViewAction(v.id);
                    if (r.ok) router.refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                const c = await confirmDialog({ title: "Salvar esta visão", input: { label: "Nome da visão", placeholder: "Ex.: GPUs disponíveis na prateleira A", required: true, minLength: 2 }, confirmLabel: "Salvar" });
                if (!c.ok) return;
                const params = new URLSearchParams(sp.toString());
                params.delete("page");
                const r = await saveViewAction({ name: c.value, query: params.toString() });
                if (r.ok) {
                  toast.success("Visão salva");
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              <BookmarkPlus /> Salvar filtros atuais
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-2 rounded-[10px] border border-line bg-surface-2/60 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <Select aria-label="Categoria" value={sp.get("categoryId") ?? ""} onChange={(e) => update({ categoryId: e.target.value || null })}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Local" value={sp.get("locationId") ?? ""} onChange={(e) => update({ locationId: e.target.value || null })}>
            <option value="">Todos os locais</option>
            <option value="none">Sem local definido</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </Select>
          <Select aria-label="Situação específica" value={sp.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null, group: e.target.value ? "all" : null })}>
            <option value="">Qualquer situação</option>
            {Object.entries(STATUS_LABEL)
              .filter(([k]) => k !== "VOID")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Select>
          <Select aria-label="Posse" value={sp.get("ownership") ?? ""} onChange={(e) => update({ ownership: e.target.value || null })}>
            <option value="">Próprios e de terceiros</option>
            {Object.entries(OWNERSHIP_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select aria-label="Condição" value={sp.get("condition") ?? ""} onChange={(e) => update({ condition: e.target.value || null })}>
            <option value="">Qualquer condição</option>
            {Object.entries(CONDITION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          {seeCost ? (
            <Select aria-label="Custo" value={sp.get("cost") ?? ""} onChange={(e) => update({ cost: e.target.value || null })}>
              <option value="">Qualquer custo</option>
              <option value="unknown">Custo desconhecido</option>
              <option value="estimated">Custo estimado</option>
            </Select>
          ) : (
            <span />
          )}
          {tags.length > 0 && (
            <Select aria-label="Etiqueta" value={sp.get("tag") ?? ""} onChange={(e) => update({ tag: e.target.value || null })}>
              <option value="">Qualquer etiqueta</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label="Parados" value={sp.get("stale") ?? ""} onChange={(e) => update({ stale: e.target.value || null })}>
            <option value="">Qualquer tempo em estoque</option>
            <option value="30">Parados há +30 dias</option>
            <option value="60">Parados há +60 dias</option>
            <option value="90">Parados há +90 dias</option>
          </Select>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ("");
                router.replace(pathname);
              }}
            >
              <X /> Limpar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
