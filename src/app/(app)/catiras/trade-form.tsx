"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Section, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker, LocationSelect, type ContactOption } from "@/components/app/pickers";
import { ItemPicker } from "@/components/app/item-picker";
import { TradeAnalysisPanel } from "@/components/app/trade-analysis";
import { SPEC_FIELDS } from "@/server/domain/compat";
import { CONDITION_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { saveTradeAction, previewTradeAction } from "./actions";
import type { PickableItem } from "@/server/queries/items";
import type { TradeAnalysis } from "@/server/domain/trades";

export type OutLine = { item: PickableItem; quantity: number; agreedValueCents: number | null; estimatedValueCents: number | null };
export type InLine = {
  key: string;
  categoryId: string;
  title: string;
  brand: string;
  model: string;
  serial: string;
  condition: string;
  conditionReport: string;
  quantity: number;
  agreedValueCents: number | null;
  estimatedValueCents: number | null;
  expectedPriceCents: number | null;
  locationId: string | null;
  specs: Record<string, string>;
};

export type TradeFormInitial = {
  id: string | null;
  title: string;
  contactId: string | null;
  date: string;
  notes: string;
  out: OutLine[];
  in: InLine[];
  cashDir: "none" | "in" | "out";
  cashCents: number | null;
  feesCents: number | null;
};

const newIn = (locationId: string | null): InLine => ({
  key: crypto.randomUUID(),
  categoryId: "",
  title: "",
  brand: "",
  model: "",
  serial: "",
  condition: "GOOD",
  conditionReport: "",
  quantity: 1,
  agreedValueCents: null,
  estimatedValueCents: null,
  expectedPriceCents: null,
  locationId,
  specs: {},
});

export function TradeForm({
  initial,
  items,
  contacts,
  categories,
  locations,
  today,
}: {
  initial: TradeFormInitial;
  items: PickableItem[];
  contacts: ContactOption[];
  categories: { id: string; name: string; kind: string }[];
  locations: { id: string; path: string }[];
  today: string;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(initial.title);
  const [contactId, setContactId] = React.useState(initial.contactId);
  const [date, setDate] = React.useState(initial.date);
  const [notes, setNotes] = React.useState(initial.notes);
  const [out, setOut] = React.useState<OutLine[]>(initial.out);
  const [inn, setIn] = React.useState<InLine[]>(initial.in.length ? initial.in : [newIn(locations[0]?.id ?? null)]);
  const [cashDir, setCashDir] = React.useState(initial.cashDir);
  const [cash, setCash] = React.useState<number | null>(initial.cashCents);
  const [fees, setFees] = React.useState<number | null>(initial.feesCents);
  const [picker, setPicker] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<TradeAnalysis | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [revAuthor, setRevAuthor] = React.useState<"" | "US" | "THEM">("");
  const [revNote, setRevNote] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const keyRef = React.useRef(crypto.randomUUID());

  const payload = React.useCallback(
    () => ({
      id: initial.id,
      title: title.trim() || autoTitle(out, inn),
      contactId,
      notes: notes || null,
      out: out.map((o) => ({ itemId: o.item.id, quantity: o.quantity, agreedValueCents: o.agreedValueCents ?? 0, estimatedValueCents: o.estimatedValueCents })),
      in: inn
        .filter((i) => i.categoryId && i.title.trim().length >= 2)
        .map((i) => ({
          categoryId: i.categoryId,
          title: i.title.trim(),
          brand: i.brand || null,
          model: i.model || null,
          serial: i.serial || null,
          condition: i.condition as never,
          conditionReport: i.conditionReport || null,
          specs: Object.fromEntries(Object.entries(i.specs).filter(([, v]) => v.trim())),
          quantity: i.quantity,
          agreedValueCents: i.agreedValueCents ?? 0,
          estimatedValueCents: i.estimatedValueCents,
          expectedPriceCents: i.expectedPriceCents,
          locationId: i.locationId,
        })),
      cashInCents: cashDir === "in" ? cash ?? 0 : 0,
      cashOutCents: cashDir === "out" ? cash ?? 0 : 0,
      feesCents: fees ?? 0,
    }),
    [initial.id, title, contactId, notes, out, inn, cashDir, cash, fees],
  );

  // Análise ao vivo (servidor calcula com os custos reais dos itens).
  React.useEffect(() => {
    const t = setTimeout(async () => {
      const p = payload();
      if (!p.out.length && !p.in.length) {
        setAnalysis(null);
        return;
      }
      setAnalyzing(true);
      const r = await previewTradeAction(p);
      setAnalyzing(false);
      if (r.ok) setAnalysis(r.data);
    }, 400);
    return () => clearTimeout(t);
  }, [payload]);

  const save = async (status: "DRAFT" | "NEGOTIATING") => {
    if (inn.some((i) => (i.title || i.categoryId) && (!i.categoryId || i.title.trim().length < 2))) return toast.error("Complete categoria e nome dos itens recebidos.");
    if (out.some((o) => o.agreedValueCents === null)) return toast.error("Informe o valor combinado de cada item que você entrega.");
    setPending(status);
    const r = await saveTradeAction({ ...payload(), status, dateInput: date, idempotencyKey: keyRef.current, revision: revAuthor ? { author: revAuthor, note: revNote || null } : null });
    setPending(null);
    if (!r.ok) return toast.error(r.error);
    router.push(`/catiras/${r.data.id}`);
    router.refresh();
  };

  const setInLine = (i: number, patch: Partial<InLine>) => setIn((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Section>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Com quem">
              <ContactPicker value={contactId} onChange={setContactId} options={contacts} placeholder="Escolher contato" />
            </Field>
            <Field label="Nome da negociação" hint="Opcional — gerado a partir dos itens.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle(out, inn) || "Ex.: 3060 + monitor por PC i5"} />
            </Field>
            <Field label="Data">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section
            title={
              <span className="inline-flex items-center gap-2">
                <ArrowUpRight className="size-4 text-negative" /> Você entrega
              </span>
            }
            actions={
              <Button size="sm" onClick={() => setPicker(true)}>
                <Plus /> Item do estoque
              </Button>
            }
          >
            {out.length === 0 ? (
              <p className="text-sm text-ink-3">Escolha os itens do seu estoque que entram na troca.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {out.map((o, i) => (
                  <li key={o.item.id} className="rounded-[10px] border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.item.title}</p>
                        <p className="code text-ink-3">
                          {o.item.code} · custo <Money cents={o.item.unitCostCents ?? null} unknown="desconhecido" />
                        </p>
                      </div>
                      <Button size="icon-sm" variant="ghost" aria-label="Remover" onClick={() => setOut((s) => s.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label={<span className="text-[0.75rem]">Valor combinado</span>}>
                        <MoneyInput value={o.agreedValueCents} onChange={(c) => setOut((s) => s.map((x, j) => (j === i ? { ...x, agreedValueCents: c } : x)))} />
                      </Field>
                      <Field label={<span className="text-[0.75rem]">Valor de mercado</span>}>
                        <MoneyInput value={o.estimatedValueCents} onChange={(c) => setOut((s) => s.map((x, j) => (j === i ? { ...x, estimatedValueCents: c } : x)))} />
                      </Field>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={
              <span className="inline-flex items-center gap-2">
                <ArrowDownLeft className="size-4 text-positive" /> Você recebe
              </span>
            }
            actions={
              <Button size="sm" onClick={() => setIn((s) => [...s, newIn(locations[0]?.id ?? null)])}>
                <Plus /> Item
              </Button>
            }
          >
            <ul className="flex flex-col gap-3">
              {inn.map((l, i) => {
                const kind = categories.find((c) => c.id === l.categoryId)?.kind;
                const specFields = kind ? SPEC_FIELDS[kind] ?? [] : [];
                return (
                  <li key={l.key} className="rounded-[10px] border border-line p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={<span className="text-[0.75rem]">Categoria</span>}>
                        <Select value={l.categoryId} onChange={(e) => setInLine(i, { categoryId: e.target.value })}>
                          <option value="">Escolha…</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={<span className="text-[0.75rem]">Condição</span>}>
                        <Select value={l.condition} onChange={(e) => setInLine(i, { condition: e.target.value })}>
                          {Object.entries(CONDITION_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={<span className="text-[0.75rem]">O que é</span>} className="col-span-2">
                        <Input value={l.title} onChange={(e) => setInLine(i, { title: e.target.value })} placeholder="Ex.: PC i5 10400F + GTX 1660 Super 16GB" />
                      </Field>
                      <Field label={<span className="text-[0.75rem]">Valor combinado</span>}>
                        <MoneyInput value={l.agreedValueCents} onChange={(c) => setInLine(i, { agreedValueCents: c })} />
                      </Field>
                      <Field label={<span className="text-[0.75rem]">Valor de mercado</span>}>
                        <MoneyInput value={l.estimatedValueCents} onChange={(c) => setInLine(i, { estimatedValueCents: c })} />
                      </Field>
                    </div>
                    <details className="group mt-2">
                      <summary className="cursor-pointer list-none text-[0.8125rem] font-medium text-accent-text">Mais detalhes (estado, série, especificações)</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Field label={<span className="text-[0.75rem]">Marca</span>}>
                          <Input value={l.brand} onChange={(e) => setInLine(i, { brand: e.target.value })} />
                        </Field>
                        <Field label={<span className="text-[0.75rem]">Nº de série</span>}>
                          <Input value={l.serial} onChange={(e) => setInLine(i, { serial: e.target.value })} className="code" />
                        </Field>
                        <Field label={<span className="text-[0.75rem]">Preço de revenda pretendido</span>}>
                          <MoneyInput value={l.expectedPriceCents} onChange={(c) => setInLine(i, { expectedPriceCents: c })} />
                        </Field>
                        <Field label={<span className="text-[0.75rem]">Guardar em</span>}>
                          <LocationSelect value={l.locationId} onChange={(v) => setInLine(i, { locationId: v })} options={locations} />
                        </Field>
                        <Field label={<span className="text-[0.75rem]">Laudo do estado (o que você testou/viu)</span>} className="col-span-2">
                          <Textarea value={l.conditionReport} onChange={(e) => setInLine(i, { conditionReport: e.target.value })} rows={2} />
                        </Field>
                        {specFields.map((f) => (
                          <Field key={f.key} label={<span className="text-[0.75rem]">{f.label}</span>}>
                            <Input value={l.specs[f.key] ?? ""} onChange={(e) => setInLine(i, { specs: { ...l.specs, [f.key]: e.target.value } })} className="h-9 text-sm" />
                          </Field>
                        ))}
                      </div>
                    </details>
                    {inn.length > 1 && (
                      <Button size="sm" variant="ghost" className="mt-1" onClick={() => setIn((s) => s.filter((_, j) => j !== i))}>
                        <Trash2 /> Remover
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>

        <Section title="Volta em dinheiro e custos">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Volta" className="sm:col-span-2">
              <SegmentedControl
                value={cashDir}
                onChange={setCashDir}
                options={[
                  { value: "none", label: "Sem volta" },
                  { value: "out", label: "Eu pago" },
                  { value: "in", label: "Eu recebo" },
                ]}
              />
            </Field>
            {cashDir !== "none" && (
              <Field label={cashDir === "out" ? "Quanto você paga" : "Quanto você recebe"}>
                <MoneyInput value={cash} onChange={setCash} />
              </Field>
            )}
            <Field label="Frete / taxas suas" hint="Entram no custo do que você recebe.">
              <MoneyInput value={fees} onChange={setFees} />
            </Field>
            <Field label="Anotações da negociação" className="sm:col-span-3">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: ele aceita se eu tirar o monitor; testamos o PC por 2h" />
            </Field>
          </div>
        </Section>

        <Section title="Registrar como contraproposta" description="Guarda um retrato desta versão no histórico da negociação.">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Select value={revAuthor} onChange={(e) => setRevAuthor(e.target.value as "" | "US" | "THEM")} aria-label="Quem propôs">
              <option value="">Não registrar versão</option>
              <option value="US">Proposta minha</option>
              <option value="THEM">Proposta da outra parte</option>
            </Select>
            <Input value={revNote} onChange={(e) => setRevNote(e.target.value)} placeholder="Comentário da versão (opcional)" disabled={!revAuthor} />
          </div>
        </Section>
      </div>

      <aside className="flex flex-col gap-5 xl:sticky xl:top-20 xl:self-start">
        <Section title={<span className="inline-flex items-center gap-2">Análise da troca {analyzing && <Loader2 className="size-3.5 animate-spin text-ink-3" />}</span>}>
          {analysis ? <TradeAnalysisPanel a={analysis} /> : <p className="text-sm text-ink-3">Adicione itens dos dois lados para ver o efeito no caixa, no custo e no potencial de revenda.</p>}
        </Section>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" loading={pending === "NEGOTIATING"} disabled={!!pending} onClick={() => save("NEGOTIATING")}>
            Salvar e bloquear meus itens
          </Button>
          <Button variant="ghost" loading={pending === "DRAFT"} disabled={!!pending} onClick={() => save("DRAFT")}>
            Salvar como rascunho (sem bloquear)
          </Button>
          <p className={cn("text-center text-[0.75rem] text-ink-3")}>A confirmação, com o dinheiro e a entrada dos itens no estoque, é feita na próxima tela.</p>
        </div>
      </aside>
      <ItemPicker
        open={picker}
        onOpenChange={setPicker}
        items={items}
        excludeIds={out.map((o) => o.item.id)}
        seeCost
        title="O que você entrega"
        onPick={(it) => {
          setOut((s) => (s.some((x) => x.item.id === it.id) ? s : [...s, { item: it, quantity: 1, agreedValueCents: it.expectedPriceCents, estimatedValueCents: it.estimatedValueCents }]));
          setPicker(false);
        }}
      />
    </div>
  );
}

function autoTitle(out: OutLine[], inn: InLine[]) {
  const a = out.map((o) => o.item.title.split(" ").slice(0, 3).join(" ")).join(" + ");
  const b = inn.filter((i) => i.title).map((i) => i.title.split(" ").slice(0, 3).join(" ")).join(" + ");
  if (!a && !b) return "";
  return `${a || "?"} por ${b || "?"}`.slice(0, 150);
}

export { formatBRL };
