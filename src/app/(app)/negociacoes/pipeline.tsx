"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, CalendarClock, MessageCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Money } from "@/components/ui/layout";
import { ContactPicker, type ContactOption } from "@/components/app/pickers";
import { waLink } from "@/components/app/share";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { saveOpportunityAction, moveOpportunityAction } from "./actions";

type Opp = {
  id: string;
  title: string;
  type: string;
  stage: string;
  contactId: string | null;
  contactName: string | null;
  whatsapp: string | null;
  valueCents: number | null;
  itemIds: string[];
  source: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  notes: string | null;
  lostReason: string | null;
  linkType: string | null;
  linkId: string | null;
};

const COLUMNS = [
  { key: "NEW", label: "Novo contato" },
  { key: "NEGOTIATING", label: "Negociando" },
  { key: "PROPOSAL", label: "Proposta enviada" },
  { key: "WON", label: "Fechado" },
  { key: "LOST", label: "Perdido" },
] as const;
const TYPE_LABEL: Record<string, string> = { SELL: "Venda", BUY: "Compra", TRADE: "Catira", BUILD: "Montagem" };

export function Pipeline({ opps, contacts, items, today, openId, canSell, canTrade }: { opps: Opp[]; contacts: ContactOption[]; items: { id: string; code: string; title: string }[]; today: string; openId: string | null; canSell: boolean; canTrade: boolean }) {
  const [editing, setEditing] = React.useState<Partial<Opp> | null>(openId ? opps.find((o) => o.id === openId) ?? null : null);
  const router = useRouter();
  const move = async (o: Opp, dir: 1 | -1) => {
    const idx = COLUMNS.findIndex((c) => c.key === o.stage);
    const next = COLUMNS[Math.max(0, Math.min(COLUMNS.length - 1, idx + dir))].key;
    if (next === o.stage) return;
    let lostReason: string | null = null;
    if (next === "LOST") {
      const c = await confirmDialog({ title: "Marcar como perdida?", input: { label: "Por que não fechou?", placeholder: "Ex.: achou mais barato, desistiu" }, confirmLabel: "Marcar como perdida" });
      if (!c.ok) return;
      lostReason = c.value || null;
    }
    const r = await moveOpportunityAction({ id: o.id, stage: next, lostReason });
    if (r.ok) router.refresh();
    else toast.error(r.error);
  };
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setEditing({ stage: "NEW", type: "SELL" })}>
          <Plus /> Nova negociação
        </Button>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
        {COLUMNS.map((col) => {
          const list = opps.filter((o) => o.stage === col.key);
          const sum = list.reduce((a, o) => a + (o.valueCents ?? 0), 0);
          return (
            <section key={col.key} className="flex w-72 shrink-0 flex-col rounded-[12px] border border-line bg-panel lg:w-auto" aria-label={col.label}>
              <header className="flex items-baseline justify-between gap-2 px-3 py-2.5">
                <h2 className="text-[0.8125rem] font-semibold">
                  {col.label} <span className="num font-normal text-ink-3">{list.length}</span>
                </h2>
                {sum > 0 && <Money cents={sum} className="text-[0.75rem] text-ink-3" />}
              </header>
              <ul className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {list.map((o) => {
                  const overdue = o.nextActionAt && o.nextActionAt <= today && !["WON", "LOST"].includes(o.stage);
                  return (
                    <li key={o.id} className="group rounded-[10px] border border-line bg-surface p-3 shadow-sm">
                      <button className="block w-full text-left" onClick={() => setEditing(o)}>
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium leading-snug text-ink">{o.title}</span>
                          <Badge tone="neutral" className="h-5">
                            {TYPE_LABEL[o.type]}
                          </Badge>
                        </span>
                        {o.contactName && <span className="mt-0.5 block text-[0.8125rem] text-ink-3">{o.contactName}</span>}
                        {o.valueCents ? <Money cents={o.valueCents} className="mt-1 block text-sm" /> : null}
                        {o.nextAction && !["WON", "LOST"].includes(o.stage) && (
                          <span className={cn("mt-2 flex items-center gap-1.5 text-[0.75rem]", overdue ? "font-medium text-negative" : "text-ink-3")}>
                            <CalendarClock className="size-3.5" />
                            {o.nextAction}
                            {o.nextActionAt && ` · ${o.nextActionAt.split("-").reverse().slice(0, 2).join("/")}`}
                          </span>
                        )}
                        {o.stage === "LOST" && o.lostReason && <span className="mt-1 block text-[0.75rem] text-ink-3">{o.lostReason}</span>}
                      </button>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex gap-1">
                          <button onClick={() => move(o, -1)} disabled={col.key === "NEW"} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Voltar etapa">
                            <ChevronLeft className="size-4" />
                          </button>
                          <button onClick={() => move(o, 1)} disabled={col.key === "LOST"} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Avançar etapa">
                            <ChevronRight className="size-4" />
                          </button>
                        </div>
                        {o.whatsapp && (
                          <a href={waLink(`Olá, ${o.contactName?.split(" ")[0] ?? ""}!`, o.whatsapp)} target="_blank" rel="noreferrer" className="rounded p-1 text-ink-3 hover:text-positive" aria-label="WhatsApp">
                            <MessageCircle className="size-4" />
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
                {list.length === 0 && <li className="px-2 py-4 text-center text-[0.75rem] text-ink-3">Nada aqui</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <OppSheet value={editing} onClose={() => setEditing(null)} contacts={contacts} items={items} canSell={canSell} canTrade={canTrade} />
    </>
  );
}

function OppSheet({ value, onClose, contacts, items, canSell, canTrade }: { value: Partial<Opp> | null; onClose: () => void; contacts: ContactOption[]; items: { id: string; code: string; title: string }[]; canSell: boolean; canTrade: boolean }) {
  const [v, setV] = React.useState<Partial<Opp>>({});
  React.useEffect(() => {
    if (value) setV(value);
  }, [value]);
  const { run, pending } = useAction(saveOpportunityAction, { onSuccess: onClose });
  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={v.id ? "Negociação" : "Nova negociação"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={(v.title ?? "").trim().length < 2}
            onClick={() =>
              run({
                id: v.id ?? null,
                title: v.title ?? "",
                type: (v.type ?? "SELL") as never,
                stage: (v.stage ?? "NEW") as never,
                contactId: v.contactId ?? null,
                valueCents: v.valueCents ?? null,
                itemIds: v.itemIds ?? [],
                source: v.source ?? null,
                nextAction: v.nextAction ?? null,
                nextActionInput: v.nextActionAt ?? null,
                notes: v.notes ?? null,
                lostReason: v.lostReason ?? null,
              })
            }
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="O que está sendo negociado" required>
          <Input value={v.title ?? ""} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Ex.: Interessado na RTX 3060 (OLX)" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={v.type ?? "SELL"} onChange={(e) => setV({ ...v, type: e.target.value })}>
              {Object.entries(TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={v.stage ?? "NEW"} onChange={(e) => setV({ ...v, stage: e.target.value })}>
              {COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Com quem">
          <ContactPicker value={v.contactId ?? null} onChange={(id) => setV({ ...v, contactId: id })} options={contacts} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor em jogo">
            <MoneyInput value={v.valueCents ?? null} onChange={(c) => setV({ ...v, valueCents: c })} />
          </Field>
          <Field label="Origem">
            <Input value={v.source ?? ""} onChange={(e) => setV({ ...v, source: e.target.value })} placeholder="OLX, Instagram…" />
          </Field>
        </div>
        <Field label="Itens de interesse">
          <Select
            value=""
            onChange={(e) => {
              if (e.target.value && !(v.itemIds ?? []).includes(e.target.value)) setV({ ...v, itemIds: [...(v.itemIds ?? []), e.target.value] });
            }}
          >
            <option value="">Adicionar item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} — {i.title}
              </option>
            ))}
          </Select>
          {(v.itemIds ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(v.itemIds ?? []).map((id) => {
                const it = items.find((i) => i.id === id);
                return (
                  <button key={id} onClick={() => setV({ ...v, itemIds: (v.itemIds ?? []).filter((x) => x !== id) })} className="rounded-full border border-line px-2 py-0.5 text-[0.75rem] hover:border-negative" title="Remover">
                    {it ? `${it.code} ${it.title}` : "item"} ×
                  </button>
                );
              })}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <Field label="Próxima ação">
            <Input value={v.nextAction ?? ""} onChange={(e) => setV({ ...v, nextAction: e.target.value })} placeholder="Ex.: mandar fotos do PC" />
          </Field>
          <Field label="Quando">
            <Input type="date" value={v.nextActionAt ?? ""} onChange={(e) => setV({ ...v, nextActionAt: e.target.value })} />
          </Field>
        </div>
        <Field label="Anotações">
          <Textarea value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={3} />
        </Field>
        {v.stage === "LOST" && (
          <Field label="Motivo da perda">
            <Input value={v.lostReason ?? ""} onChange={(e) => setV({ ...v, lostReason: e.target.value })} />
          </Field>
        )}
        {v.id && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {v.linkType === "SALE" && v.linkId ? (
              <Button asChild size="sm">
                <Link href={`/vendas/${v.linkId}`}>Ver venda vinculada</Link>
              </Button>
            ) : (
              <>
                {canSell && (
                  <Button asChild size="sm">
                    <Link href={`/vendas/nova?oportunidade=${v.id}${v.contactId ? `&contato=${v.contactId}` : ""}${v.itemIds?.[0] ? `&item=${v.itemIds[0]}` : ""}`}>Criar orçamento / venda</Link>
                  </Button>
                )}
                {canTrade && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/catiras/nova${v.contactId ? `?contato=${v.contactId}` : ""}`}>Montar catira</Link>
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
