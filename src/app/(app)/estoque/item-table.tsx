"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ImageOff, MapPin, QrCode, Tag, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Table, Th, Td, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ItemStatusBadge, CostStatusBadge } from "@/components/app/status";
import { LocationSelect } from "@/components/app/pickers";
import { Badge } from "@/components/ui/badge";
import { CONDITION_LABEL, OWNERSHIP_LABEL } from "@/lib/labels";
import { useAction } from "@/components/ui/use-action";
import { moveItemsAction, bulkPriceAction } from "./actions";
import type { ItemListRow } from "@/server/queries/items";

export function ItemTable({
  rows,
  page,
  pages,
  canEdit,
  seeCost,
  locations,
}: {
  rows: ItemListRow[];
  page: number;
  pages: number;
  canEdit: boolean;
  seeCost: boolean;
  locations: { id: string; path: string }[];
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [priceOpen, setPriceOpen] = React.useState(false);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  React.useEffect(() => setSelected(new Set()), [rows]);

  return (
    <>
      {/* Desktop */}
      <div className="surface hidden overflow-hidden md:block">
        <Table>
          <thead>
            <tr>
              {canEdit && (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="size-4 cursor-pointer accent-[var(--accent)]"
                  />
                </Th>
              )}
              <Th>Item</Th>
              <Th>Situação</Th>
              <Th className="hidden lg:table-cell">Local</Th>
              {seeCost && <Th align="right">Custo</Th>}
              <Th align="right">Preço pretendido</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("group transition-colors hover:bg-surface-2/70 [&:last-child>td]:border-b-0", selected.has(r.id) && "bg-accent-soft/40")}>
                {canEdit && (
                  <Td>
                    <input type="checkbox" aria-label={`Selecionar ${r.code}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="size-4 cursor-pointer accent-[var(--accent)]" />
                  </Td>
                )}
                <Td>
                  <Link href={`/estoque/${r.id}`} className="flex items-center gap-3 no-underline">
                    <Thumb id={r.coverId} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink group-hover:text-accent-text">{r.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-3">
                        <span className="code text-ink-2">{r.code}</span>
                        {r.serial && <span className="code">S/N {r.serial}</span>}
                        <span>{r.category}</span>
                        {r.tracking === "LOT" && (
                          <span className="num">
                            · {r.qtyOnHand} un.{r.qtyReserved > 0 && ` (${r.qtyReserved} reservadas)`}
                          </span>
                        )}
                        {r.ownership !== "OWNED" && (
                          <Badge tone="info" className="h-5">
                            {OWNERSHIP_LABEL[r.ownership]}
                            {r.ownerName ? ` · ${r.ownerName}` : ""}
                          </Badge>
                        )}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <ItemStatusBadge status={r.status} />
                    <span className="text-[0.75rem] text-ink-3">{CONDITION_LABEL[r.condition]}</span>
                  </div>
                </Td>
                <Td className="hidden max-w-[220px] lg:table-cell">
                  <span className="block truncate text-ink-2" title={r.location ?? undefined}>
                    {r.location ?? <span className="text-ink-3">—</span>}
                  </span>
                </Td>
                {seeCost && (
                  <Td align="right">
                    <div className="flex flex-col items-end gap-1">
                      <Money cents={r.costStatus === "UNKNOWN" && !r.unitCostCents ? null : r.unitCostCents} unknown="Desconhecido" />
                      <CostStatusBadge status={r.costStatus} />
                    </div>
                  </Td>
                )}
                <Td align="right">
                  <Money cents={r.expectedPriceCents} unknown="Sem preço" className="font-medium" />
                  {seeCost && r.expectedPriceCents && r.unitCostCents && r.costStatus !== "UNKNOWN" ? (
                    <span className={cn("num block text-[0.75rem]", r.expectedPriceCents >= r.unitCostCents ? "text-ink-3" : "text-negative")}>
                      margem {Math.round(((r.expectedPriceCents - r.unitCostCents) / r.expectedPriceCents) * 100)}%
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {/* Celular */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className={cn("surface flex items-center gap-3 p-3", selected.has(r.id) && "ring-2 ring-accent/40")}>
            {canEdit && <input type="checkbox" aria-label={`Selecionar ${r.code}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="size-5 shrink-0 accent-[var(--accent)]" />}
            <Link href={`/estoque/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 no-underline">
              <Thumb id={r.coverId} large />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{r.title}</span>
                <span className="code block text-ink-3">
                  {r.code}
                  {r.tracking === "LOT" ? ` · ${r.qtyOnHand} un.` : ""}
                </span>
                <span className="mt-1.5 flex items-center justify-between gap-2">
                  <ItemStatusBadge status={r.status} />
                  <Money cents={r.expectedPriceCents} unknown="" className="text-sm font-medium" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && <Pagination page={page} pages={pages} />}

      {selected.size > 0 && (
        <div className="pb-safe fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-xl items-center gap-2 rounded-[14px] border border-line bg-surface p-2 pl-4 shadow-[var(--shadow-lg)] animate-[ag-pop_180ms_var(--ease-out-expo)] lg:bottom-6">
          <span className="num mr-auto text-sm font-medium">
            {selected.size} selecionado{selected.size > 1 ? "s" : ""}
          </span>
          <Button size="sm" onClick={() => setMoveOpen(true)}>
            <MapPin /> Mover
          </Button>
          <Button size="sm" onClick={() => setPriceOpen(true)}>
            <Tag /> Preço
          </Button>
          <Button size="sm" asChild>
            <Link href={`/estoque/etiquetas?ids=${[...selected].join(",")}`}>
              <QrCode /> Etiquetas
            </Link>
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X />
          </Button>
        </div>
      )}
      <MoveSheet open={moveOpen} onOpenChange={setMoveOpen} ids={[...selected]} locations={locations} onDone={() => setSelected(new Set())} />
      <PriceSheet open={priceOpen} onOpenChange={setPriceOpen} ids={[...selected]} seeCost={seeCost} onDone={() => setSelected(new Set())} />
    </>
  );
}

function Thumb({ id, large }: { id: string | null; large?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[8px] border border-line bg-surface-2 text-ink-3", large ? "size-14" : "size-10")}>
      {id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${id}`} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff className="size-4" aria-hidden />
      )}
    </span>
  );
}

function Pagination({ page, pages }: { page: number; pages: number }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const href = (p: number) => {
    const n = new URLSearchParams(sp.toString());
    n.set("page", String(p));
    return `${pathname}?${n.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginação">
      <span className="text-ink-3">
        Página <span className="num text-ink">{page}</span> de <span className="num text-ink">{pages}</span>
      </span>
      <div className="flex gap-2">
        <Button size="sm" asChild disabled={page <= 1}>
          <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
            <ChevronLeft /> Anterior
          </Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages} className={cn(page >= pages && "pointer-events-none opacity-50")}>
            Próxima <ChevronRight />
          </Link>
        </Button>
      </div>
    </nav>
  );
}

export function MoveSheet({
  open,
  onOpenChange,
  ids,
  locations,
  onDone,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  locations: { id: string; path: string }[];
  onDone?: () => void;
  current?: string | null;
}) {
  const [loc, setLoc] = React.useState<string | null>(current ?? null);
  const [reason, setReason] = React.useState("");
  const { run, pending } = useAction(moveItemsAction, {
    onSuccess: () => {
      onOpenChange(false);
      onDone?.();
    },
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={ids.length > 1 ? `Mover ${ids.length} itens` : "Mover item"}
      description="O local anterior fica registrado no histórico de cada item."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} onClick={() => run({ itemIds: ids, locationId: loc, reason: reason || null })}>
            Mover
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Novo local">
          <LocationSelect value={loc} onChange={setLoc} options={locations} />
        </Field>
        <Field label="Motivo (opcional)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reorganização da prateleira" />
        </Field>
        <p className="text-[0.8125rem] text-ink-3">
          Não encontrou o local? <Link href="/estoque/locais">Cadastre em Estoque › Locais</Link>.
        </p>
      </div>
    </Sheet>
  );
}

function PriceSheet({ open, onOpenChange, ids, seeCost, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ids: string[]; seeCost: boolean; onDone: () => void }) {
  const [mode, setMode] = React.useState<"SET" | "MARGIN">("SET");
  const [value, setValue] = React.useState<number | null>(null);
  const [margin, setMargin] = React.useState("25");
  const router = useRouter();
  const { run, pending } = useAction(bulkPriceAction, {
    onSuccess: () => {
      onOpenChange(false);
      onDone();
      router.refresh();
    },
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Definir preço pretendido"
      description={`${ids.length} item(ns) selecionado(s). O preço anterior fica no histórico.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={mode === "SET" ? value === null : !margin}
            onClick={() => run(mode === "SET" ? { itemIds: ids, mode, valueCents: value ?? 0 } : { itemIds: ids, mode, marginPct: Number(margin.replace(",", ".")) })}
          >
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {seeCost && (
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "SET", label: "Valor fixo" },
              { value: "MARGIN", label: "Margem sobre o custo" },
            ]}
          />
        )}
        {mode === "SET" ? (
          <Field label="Preço de venda pretendido">
            <MoneyInput value={value} onChange={setValue} autoFocus />
          </Field>
        ) : (
          <Field label="Margem desejada sobre o preço de venda (%)" hint="Preço = custo ÷ (1 − margem), arredondado para cima em R$ 1. Itens sem custo conhecido são ignorados.">
            <Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}
