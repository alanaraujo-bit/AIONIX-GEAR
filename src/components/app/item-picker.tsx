"use client";

import * as React from "react";
import { Search, Plus, ImageOff } from "lucide-react";
import { Sheet } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/layout";
import { CONDITION_LABEL, OWNERSHIP_LABEL } from "@/lib/labels";
import type { PickableItem } from "@/server/queries/items";

/** Escolher itens disponíveis do estoque (já filtrados no servidor pelo propósito). */
export function ItemPicker({
  open,
  onOpenChange,
  items,
  excludeIds,
  onPick,
  title = "Adicionar item do estoque",
  seeCost,
  groupBy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: PickableItem[];
  excludeIds: string[];
  onPick: (item: PickableItem) => void;
  title?: string;
  seeCost: boolean;
  groupBy?: "kind";
}) {
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const term = q.trim().toLowerCase();
  const list = items.filter((i) => !excludeIds.includes(i.id) || i.tracking === "LOT").filter((i) => !term || `${i.code} ${i.title} ${i.serial ?? ""} ${i.category}`.toLowerCase().includes(term));
  const groups = groupBy ? Object.entries(list.reduce<Record<string, PickableItem[]>>((a, i) => ((a[i.category] ??= []).push(i), a), {})) : [["", list] as const];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description="Só aparecem itens disponíveis — reservados, em montagem ou em negociação não podem ser usados." width="lg">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, nome, série…" className="pl-9" aria-label="Buscar item" />
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">Nenhum item disponível {term ? "com essa busca" : "no momento"}.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([g, rows]) => (
            <div key={g}>
              {g && <p className="mb-1.5 text-[0.75rem] font-medium text-ink-3">{g}</p>}
              <ul className="divide-y divide-line rounded-[10px] border border-line">
                {rows.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(i);
                        if (i.tracking !== "LOT") setQ("");
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
                        <ImageOff className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{i.title}</span>
                        <span className="code block truncate text-ink-3">
                          {i.code}
                          {i.serial ? ` · S/N ${i.serial}` : ""} · {CONDITION_LABEL[i.condition]}
                          {i.location ? ` · ${i.location}` : ""}
                          {i.tracking === "LOT" ? ` · ${i.available} disp.` : ""}
                        </span>
                      </span>
                      {i.ownership !== "OWNED" && <Badge tone="info">{OWNERSHIP_LABEL[i.ownership]}</Badge>}
                      <span className="flex flex-col items-end text-[0.8125rem]">
                        <Money cents={i.expectedPriceCents} unknown="sem preço" className="text-ink" />
                        {seeCost && i.unitCostCents !== undefined && <Money cents={i.unitCostCents} unknown="custo ?" className="text-ink-3" />}
                      </span>
                      <Plus className="size-4 shrink-0 text-accent-text" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
