"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, Receipt, ArrowLeftRight, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Section, Money, Callout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Checkbox, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker, LocationSelect, type ContactOption } from "@/components/app/pickers";
import { ItemPicker } from "@/components/app/item-picker";
import { PaymentPlan, initialPlan, planPayload, planNowTotal, type PaymentPlanValue } from "@/components/app/payment-plan";
import { CONDITION_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { saveSaleAction } from "../actions";
import type { PickableItem } from "@/server/queries/items";

type Line = { item: PickableItem; quantity: number; priceCents: number | null };
type TradeIn = { key: string; categoryId: string; name: string; serial: string; condition: string; valueCents: number | null };

function addDays(d: string, n: number) {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

export function SaleForm({
  items,
  preselect,
  contacts,
  accounts,
  categories,
  locations,
  today,
  defaultWarrantyDays,
  reservationDays,
  seeCost,
  initialContactId,
  opportunityId,
}: {
  items: PickableItem[];
  preselect: PickableItem[];
  contacts: ContactOption[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: string }[];
  locations: { id: string; path: string }[];
  today: string;
  defaultWarrantyDays: number;
  reservationDays: number;
  seeCost: boolean;
  initialContactId: string | null;
  opportunityId: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"CONFIRM" | "QUOTE">("CONFIRM");
  const [contactId, setContactId] = React.useState<string | null>(initialContactId);
  const [date, setDate] = React.useState(today);
  const [channel, setChannel] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>(preselect.map((i) => ({ item: i, quantity: 1, priceCents: i.expectedPriceCents })));
  const [picker, setPicker] = React.useState(false);
  const [discount, setDiscount] = React.useState<number | null>(null);
  const [shipCharged, setShipCharged] = React.useState<number | null>(null);
  const [shipCost, setShipCost] = React.useState<number | null>(null);
  const [shipAccount, setShipAccount] = React.useState<string>("");
  const [fee, setFee] = React.useState<number | null>(null);
  const [feeWithheld, setFeeWithheld] = React.useState(true);
  const [warranty, setWarranty] = React.useState(String(defaultWarrantyDays));
  const [notes, setNotes] = React.useState("");
  const [delivered, setDelivered] = React.useState(true);
  const [reserve, setReserve] = React.useState(true);
  const [validUntil, setValidUntil] = React.useState(addDays(today, reservationDays));
  const [tradeIns, setTradeIns] = React.useState<TradeIn[]>([]);
  const [tradeLocation, setTradeLocation] = React.useState<string | null>(locations[0]?.id ?? null);
  const [plan, setPlan] = React.useState<PaymentPlanValue>(initialPlan(accounts, today));
  const [pending, setPending] = React.useState(false);
  const keyRef = React.useRef(crypto.randomUUID());

  const subtotal = lines.reduce((a, l) => a + l.quantity * (l.priceCents ?? 0), 0);
  const total = subtotal - (discount ?? 0) + (shipCharged ?? 0);
  const tradeInTotal = tradeIns.reduce((a, t) => a + (t.valueCents ?? 0), 0);
  const withheld = feeWithheld ? Math.min(fee ?? 0, total - tradeInTotal) : 0;
  const toReceive = total - tradeInTotal - withheld;
  const costKnown = lines.every((l) => l.item.unitCostCents !== null && l.item.unitCostCents !== undefined);
  const cost = lines.reduce((a, l) => a + (l.item.unitCostCents ?? 0) * l.quantity, 0);
  const gross = subtotal - (discount ?? 0) - cost;
  const contribution = gross - (fee ?? 0) - (shipCost ?? 0) + (shipCharged ?? 0);

  const submit = async () => {
    if (!lines.length) return toast.error("Adicione ao menos um item.");
    if (lines.some((l) => l.priceCents === null)) return toast.error("Informe o preço de todos os itens.");
    if ((discount ?? 0) > subtotal) return toast.error("O desconto passa do valor dos itens.");
    if (tradeInTotal > total) return toast.error("Os itens na troca valem mais que a venda.");
    if (tradeIns.some((t) => !t.categoryId || t.name.trim().length < 2 || !t.valueCents)) return toast.error("Complete os itens recebidos na troca.");
    if (mode === "CONFIRM" && planNowTotal(plan) > toReceive) return toast.error("Os pagamentos passam do valor a receber.");
    setPending(true);
    const r = await saveSaleAction({
      idempotencyKey: keyRef.current,
      action: mode,
      contactId,
      channel: channel || null,
      dateInput: date,
      lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity, unitPriceCents: l.priceCents! })),
      discountCents: discount ?? 0,
      shippingChargedCents: shipCharged ?? 0,
      shippingCostCents: shipCost ?? 0,
      shippingAccountId: shipAccount || null,
      feeCents: fee ?? 0,
      feeWithheld,
      warrantyDays: warranty ? Number(warranty) : null,
      notes: notes || null,
      reserveItems: mode === "QUOTE" && reserve,
      validUntilInput: mode === "QUOTE" ? validUntil : null,
      delivered,
      payment: mode === "CONFIRM" ? (planPayload(plan) as never) : undefined,
      tradeIns:
        mode === "CONFIRM"
          ? tradeIns.map((t) => ({ product: { categoryId: t.categoryId, name: t.name }, serial: t.serial || null, condition: t.condition as never, agreedValueCents: t.valueCents!, locationId: tradeLocation }))
          : [],
      opportunityId,
    });
    setPending(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(mode === "QUOTE" ? `Orçamento ${r.data.code} salvo` : `Venda ${r.data.code} fechada`);
    router.push(`/vendas/${r.data.id}`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
          {(
            [
              ["CONFIRM", "Fechar venda", "Gera receita, tira do estoque e registra o recebimento", Receipt],
              ["QUOTE", "Orçamento", "Não é venda: só proposta (pode reservar os itens)", FileText],
            ] as const
          ).map(([v, label, hint, Icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mode === v}
              onClick={() => setMode(v)}
              className={cn("flex flex-col items-start gap-1.5 rounded-[10px] border p-3 text-left transition-colors", mode === v ? "border-accent bg-accent-soft/50 shadow-[var(--focus)]" : "border-line bg-surface hover:border-line-strong")}
            >
              <Icon className={cn("size-[18px]", mode === v ? "text-accent-text" : "text-ink-3")} />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-[0.75rem] leading-snug text-ink-3">{hint}</span>
            </button>
          ))}
        </div>

        <Section title="Cliente">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Cliente" className="sm:col-span-1">
              <ContactPicker value={contactId} onChange={setContactId} options={contacts} role="customer" placeholder="Opcional" />
            </Field>
            <Field label="Data">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Canal">
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} list="sale-channels" placeholder="OLX, Instagram…" />
              <datalist id="sale-channels">
                {["OLX", "Facebook Marketplace", "Mercado Livre", "Instagram", "WhatsApp", "Indicação", "Balcão"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </Section>

        <Section title="Itens" actions={<Button size="sm" onClick={() => setPicker(true)}><Plus /> Adicionar item</Button>} flush>
          {lines.length === 0 ? (
            <button onClick={() => setPicker(true)} className="flex w-full flex-col items-center gap-1 px-5 py-10 text-center hover:bg-surface-2/50">
              <Plus className="size-5 text-accent-text" />
              <span className="text-sm font-medium">Escolher itens do estoque</span>
              <span className="text-[0.8125rem] text-ink-3">Só aparecem itens disponíveis.</span>
            </button>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l, i) => {
                const margin = seeCost && l.item.unitCostCents !== null && l.item.unitCostCents !== undefined && l.priceCents !== null ? l.priceCents - l.item.unitCostCents : null;
                return (
                  <li key={l.item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.item.title}</p>
                      <p className="code text-ink-3">
                        {l.item.code}
                        {l.item.serial ? ` · S/N ${l.item.serial}` : ""} · {CONDITION_LABEL[l.item.condition]}
                      </p>
                      {margin !== null && (
                        <p className={cn("num text-[0.75rem]", margin >= 0 ? "text-ink-3" : "text-negative")}>
                          custo {formatBRL(l.item.unitCostCents!)} · margem {formatBRL(margin * l.quantity)}
                          {l.priceCents ? ` (${Math.round((margin / l.priceCents) * 100)}%)` : ""}
                        </p>
                      )}
                      {seeCost && l.item.costStatus === "UNKNOWN" && <p className="text-[0.75rem] text-warning-text">Custo desconhecido — o lucro desta venda ficará sinalizado.</p>}
                    </div>
                    {l.item.tracking === "LOT" ? (
                      <Field label={<span className="text-[0.75rem]">Qtd. (de {l.item.available})</span>}>
                        <Input
                          inputMode="numeric"
                          value={String(l.quantity)}
                          onChange={(e) => setLines((s) => s.map((x, j) => (j === i ? { ...x, quantity: Math.min(l.item.available, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) } : x)))}
                          className="h-9 w-20"
                        />
                      </Field>
                    ) : (
                      <span />
                    )}
                    <MoneyInput value={l.priceCents} onChange={(c) => setLines((s) => s.map((x, j) => (j === i ? { ...x, priceCents: c } : x)))} className="w-40" aria-label={`Preço de ${l.item.title}`} />
                    <Button size="icon-sm" variant="ghost" aria-label="Remover" onClick={() => setLines((s) => s.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Ajustes da venda">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Desconto">
              <MoneyInput value={discount} onChange={setDiscount} />
            </Field>
            <Field label="Frete cobrado do cliente">
              <MoneyInput value={shipCharged} onChange={setShipCharged} />
            </Field>
            <Field label="Frete pago por você" hint="Despesa da venda (reduz o lucro).">
              <MoneyInput value={shipCost} onChange={setShipCost} />
            </Field>
            {(shipCost ?? 0) > 0 && (
              <Field label="Frete pago com">
                <Select value={shipAccount} onChange={(e) => setShipAccount(e.target.value)}>
                  <option value="">Ainda vou pagar</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Taxa de cartão / plataforma">
              <MoneyInput value={fee} onChange={setFee} />
            </Field>
            {(fee ?? 0) > 0 && (
              <Field label="Essa taxa…">
                <SegmentedControl
                  size="sm"
                  value={feeWithheld ? "w" : "s"}
                  onChange={(v) => setFeeWithheld(v === "w")}
                  options={[
                    { value: "w", label: "É descontada do repasse" },
                    { value: "s", label: "Pago à parte" },
                  ]}
                />
              </Field>
            )}
            <Field label="Garantia oferecida (dias)">
              <Input inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Aparece no orçamento/recibo" />
            </Field>
          </div>
        </Section>

        {mode === "CONFIRM" && (
          <Section title="Troca na venda" description="O cliente deu itens como parte do pagamento? Eles entram no estoque pelo valor combinado." actions={<Button size="sm" variant="ghost" onClick={() => setTradeIns((s) => [...s, { key: crypto.randomUUID(), categoryId: "", name: "", serial: "", condition: "GOOD", valueCents: null }])}><ArrowLeftRight /> Adicionar item recebido</Button>}>
            {tradeIns.length === 0 ? (
              <p className="text-sm text-ink-3">Nenhum item recebido. Para trocas mais complexas (vários itens dos dois lados), use uma Catira.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {tradeIns.map((t, i) => (
                  <div key={t.key} className="grid gap-2 rounded-[10px] border border-line p-3 sm:grid-cols-[1fr_1.4fr_1fr_1fr_auto] sm:items-end">
                    <Field label="Categoria">
                      <Select value={t.categoryId} onChange={(e) => setTradeIns((s) => s.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}>
                        <option value="">Escolha…</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Item">
                      <Input value={t.name} onChange={(e) => setTradeIns((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Ex.: GTX 1650 4GB" />
                    </Field>
                    <Field label="Condição">
                      <Select value={t.condition} onChange={(e) => setTradeIns((s) => s.map((x, j) => (j === i ? { ...x, condition: e.target.value } : x)))}>
                        {Object.entries(CONDITION_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Valor combinado">
                      <MoneyInput value={t.valueCents} onChange={(c) => setTradeIns((s) => s.map((x, j) => (j === i ? { ...x, valueCents: c } : x)))} />
                    </Field>
                    <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setTradeIns((s) => s.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Field label="Guardar os itens recebidos em">
                  <LocationSelect value={tradeLocation} onChange={setTradeLocation} options={locations} />
                </Field>
                <p className="text-[0.8125rem] text-ink-3">Os itens recebidos entram como “aguardando inspeção”, com custo igual ao valor combinado.</p>
              </div>
            )}
          </Section>
        )}
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <Section title="Resumo">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-3">Itens</dt>
              <dd>
                <Money cents={subtotal} />
              </dd>
            </div>
            {(discount ?? 0) > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-3">Desconto</dt>
                <dd>
                  <Money cents={-(discount ?? 0)} />
                </dd>
              </div>
            )}
            {(shipCharged ?? 0) > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-3">Frete cobrado</dt>
                <dd>
                  <Money cents={shipCharged} />
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>Total ao cliente</dt>
              <dd>
                <Money cents={total} />
              </dd>
            </div>
            {mode === "CONFIRM" && tradeInTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-3">Pago com itens (troca)</dt>
                <dd>
                  <Money cents={-tradeInTotal} />
                </dd>
              </div>
            )}
            {mode === "CONFIRM" && withheld > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-3">Taxa retida</dt>
                <dd>
                  <Money cents={-withheld} />
                </dd>
              </div>
            )}
            {mode === "CONFIRM" && (
              <div className="flex justify-between font-medium">
                <dt>Dinheiro a receber</dt>
                <dd>
                  <Money cents={toReceive} />
                </dd>
              </div>
            )}
          </dl>
          {seeCost && lines.length > 0 && (
            <div className="mt-3 border-t border-line pt-3 text-sm">
              {costKnown ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-ink-3">Custo dos itens</span>
                    <Money cents={cost} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-3">Lucro bruto</span>
                    <Money cents={gross} tone="auto" />
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Após taxas e frete</span>
                    <Money cents={contribution} tone="auto" />
                  </div>
                </>
              ) : (
                <Callout tone="warning" icon={Info}>
                  Há item sem custo conhecido: o lucro não pode ser calculado com precisão.
                </Callout>
              )}
            </div>
          )}
        </Section>
        {mode === "CONFIRM" ? (
          <Section title="Recebimento">
            <PaymentPlan value={plan} onChange={setPlan} totalCents={Math.max(0, toReceive)} accounts={accounts} direction="in" />
            <Checkbox className="mt-4" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} label="Cliente já levou os itens" description="Desmarque se a entrega for depois (frete, retirada marcada)." />
          </Section>
        ) : (
          <Section title="Orçamento">
            <div className="flex flex-col gap-4">
              <Field label="Válido até">
                <Input type="date" value={validUntil} min={today} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
              <Checkbox checked={reserve} onChange={(e) => setReserve(e.target.checked)} label="Reservar os itens até a validade" description="Ficam indisponíveis para outras vendas; a reserva cai sozinha quando vence." />
            </div>
          </Section>
        )}
        <Button variant="primary" size="lg" loading={pending} disabled={!lines.length} onClick={submit}>
          {mode === "QUOTE" ? "Salvar orçamento" : `Fechar venda (${formatBRL(total)})`}
        </Button>
      </aside>
      <ItemPicker
        open={picker}
        onOpenChange={setPicker}
        items={items}
        excludeIds={lines.map((l) => l.item.id)}
        seeCost={seeCost}
        onPick={(it) => {
          setLines((s) => (s.some((l) => l.item.id === it.id) ? s : [...s, { item: it, quantity: 1, priceCents: it.expectedPriceCents }]));
          toast.success(`${it.code} adicionado`);
        }}
      />
    </div>
  );
}
