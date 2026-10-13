"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Section, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker, LocationSelect, type ContactOption } from "@/components/app/pickers";
import { ProductFields, emptyProduct, productPayload, type CategoryOpt, type ProductOpt, type ProductValue } from "@/components/app/product-fields";
import { PaymentPlan, initialPlan, planPayload, planNowTotal, type PaymentPlanValue } from "@/components/app/payment-plan";
import { CONDITION_LABEL, COST_KIND_LABEL } from "@/lib/labels";
import { allocate, splitEven, formatBRL } from "@/lib/money";
import { savePurchaseAction } from "../actions";

type Line = {
  key: string;
  product: ProductValue;
  description: string;
  quantity: string;
  unitPriceCents: number | null;
  condition: string;
  locationId: string | null;
  serials: string;
  expectedPriceCents: number | null;
  open: boolean;
};

type Extra = { key: string; kind: string; description: string; amountCents: number | null };

const newLine = (locationId: string | null): Line => ({
  key: crypto.randomUUID(),
  product: emptyProduct(),
  description: "",
  quantity: "1",
  unitPriceCents: null,
  condition: "GOOD",
  locationId,
  serials: "",
  expectedPriceCents: null,
  open: true,
});

export function PurchaseForm({
  categories,
  locations,
  contacts,
  accounts,
  products,
  today,
}: {
  categories: CategoryOpt[];
  locations: { id: string; path: string }[];
  contacts: ContactOption[];
  accounts: { id: string; name: string }[];
  products: ProductOpt[];
  today: string;
}) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(today);
  const [channel, setChannel] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([newLine(locations[0]?.id ?? null)]);
  const [extras, setExtras] = React.useState<Extra[]>([]);
  const [discount, setDiscount] = React.useState<number | null>(null);
  const [notes, setNotes] = React.useState("");
  const [plan, setPlan] = React.useState<PaymentPlanValue>(initialPlan(accounts, today));
  const [pending, setPending] = React.useState<"draft" | "confirm" | null>(null);
  const keyRef = React.useRef(crypto.randomUUID());

  const qty = (l: Line) => Math.max(1, Number(l.quantity) || 1);
  const bases = lines.map((l) => qty(l) * (l.unitPriceCents ?? 0));
  const subtotal = bases.reduce((a, b) => a + b, 0);
  const extrasTotal = extras.reduce((a, e) => a + (e.amountCents ?? 0), 0);
  const total = subtotal - (discount ?? 0) + extrasTotal;
  const discParts = allocate(-(discount ?? 0), bases).map((x) => -x);
  const extraParts = allocate(extrasTotal, bases);
  const unitCost = (i: number) => {
    const per = splitEven(bases[i] - discParts[i] + extraParts[i], qty(lines[i]));
    return per[0];
  };

  const setLine = (i: number, patch: Partial<Line>) => setLines((s) => s.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (confirm: boolean) => {
    for (const [i, l] of lines.entries()) {
      if (!l.product.categoryId || (!l.product.productId && !l.product.model.trim() && !l.product.brand.trim())) {
        toast.error(`Peça ${i + 1}: informe categoria e modelo.`);
        setLine(i, { open: true });
        return;
      }
      if (l.unitPriceCents === null) {
        toast.error(`Peça ${i + 1}: informe o preço pago.`);
        return;
      }
    }
    if ((discount ?? 0) > subtotal) {
      toast.error("O desconto passa do valor das peças.");
      return;
    }
    if (confirm && planNowTotal(plan) > total) {
      toast.error("Os pagamentos passam do total da compra.");
      return;
    }
    setPending(confirm ? "confirm" : "draft");
    const r = await savePurchaseAction({
      idempotencyKey: keyRef.current,
      contactId,
      dateInput: date,
      channel: channel || null,
      notes: notes || null,
      discountCents: discount ?? 0,
      extras: extras.filter((e) => e.amountCents).map((e) => ({ kind: e.kind as never, description: e.description || COST_KIND_LABEL[e.kind], amountCents: e.amountCents! })),
      lines: lines.map((l) => {
        const cat = categories.find((c) => c.id === l.product.categoryId);
        return {
          product: { ...productPayload(l.product), tracking: cat?.kind === "CONSUMABLE" ? ("LOT" as const) : ("UNIT" as const) },
          description: l.description || null,
          quantity: qty(l),
          unitPriceCents: l.unitPriceCents!,
          condition: l.condition as never,
          locationId: l.locationId,
          serials: l.serials.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean),
          expectedPriceCents: l.expectedPriceCents,
        };
      }),
      confirm,
      payment: confirm ? planPayload(plan) : undefined,
    });
    setPending(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(confirm ? `Compra ${r.data.code} confirmada — ${r.data.items.length} item(ns) no estoque` : `Rascunho ${r.data.code} salvo`);
    router.push(`/compras/${r.data.id}`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Section title="De quem e quando">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fornecedor / vendedor">
              <ContactPicker value={contactId} onChange={setContactId} options={contacts} role="supplier" placeholder="Pessoa ou loja" />
            </Field>
            <Field label="Data">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Onde comprou" hint="OLX, Marketplace, loja…">
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} list="channels" />
              <datalist id="channels">
                {["OLX", "Facebook Marketplace", "Mercado Livre", "WhatsApp", "Instagram", "Loja física", "Indicação"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </Section>

        {lines.map((l, i) => {
          const cat = categories.find((c) => c.id === l.product.categoryId);
          const isLot = cat?.kind === "CONSUMABLE";
          const title = l.description || [l.product.brand, l.product.model].filter(Boolean).join(" ") || products.find((p) => p.id === l.product.productId)?.name || `Peça ${i + 1}`;
          return (
            <Section
              key={l.key}
              title={
                <button type="button" className="flex items-center gap-2 text-left" onClick={() => setLine(i, { open: !l.open })}>
                  {l.open ? <ChevronUp className="size-4 text-ink-3" /> : <ChevronDown className="size-4 text-ink-3" />}
                  {title}
                  {qty(l) > 1 && <span className="num text-ink-3">× {qty(l)}</span>}
                </button>
              }
              actions={
                <>
                  {l.unitPriceCents !== null && <Money cents={bases[i]} className="text-sm" />}
                  {lines.length > 1 && (
                    <Button size="icon-sm" variant="ghost" aria-label="Remover peça" onClick={() => setLines((s) => s.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  )}
                </>
              }
            >
              {l.open ? (
                <div className="flex flex-col gap-4">
                  <ProductFields value={l.product} onChange={(p) => setLine(i, { product: p })} categories={categories} products={products} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={isLot ? "Quantidade (lote)" : "Unidades"}>
                      <Input inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value.replace(/\D/g, "") })} />
                    </Field>
                    <Field label="Preço pago por unidade" required>
                      <MoneyInput value={l.unitPriceCents} onChange={(c) => setLine(i, { unitPriceCents: c })} />
                    </Field>
                    <Field label="Condição">
                      <Select value={l.condition} onChange={(e) => setLine(i, { condition: e.target.value })}>
                        {Object.entries(CONDITION_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Local">
                      <LocationSelect value={l.locationId} onChange={(v) => setLine(i, { locationId: v })} options={locations} />
                    </Field>
                    <Field label="Preço de venda pretendido">
                      <MoneyInput value={l.expectedPriceCents} onChange={(c) => setLine(i, { expectedPriceCents: c })} />
                    </Field>
                    <Field label="Nome de exibição">
                      <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Opcional" />
                    </Field>
                    {!isLot && (
                      <Field label="Números de série" hint="Um por linha, na ordem das unidades. Pode completar depois." className="sm:col-span-3">
                        <Textarea value={l.serials} onChange={(e) => setLine(i, { serials: e.target.value })} rows={Math.min(4, qty(l))} className="code" />
                      </Field>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-3">
                  {cat?.name} · {CONDITION_LABEL[l.condition]} · custo final por unidade ≈ <Money cents={unitCost(i)} />
                </p>
              )}
            </Section>
          );
        })}
        <div>
          <Button variant="ghost" onClick={() => setLines((s) => [...s.map((x) => ({ ...x, open: false })), newLine(s[s.length - 1]?.locationId ?? null)])}>
            <Plus /> Adicionar outra peça
          </Button>
        </div>

        <Section title="Custos extras e desconto" description="Rateados entre as peças pelo valor de cada uma.">
          <div className="flex flex-col gap-3">
            {extras.map((e, i) => (
              <div key={e.key} className="grid grid-cols-[1fr_1.4fr_1fr_auto] items-end gap-2">
                <Select value={e.kind} onChange={(ev) => setExtras((s) => s.map((x, j) => (j === i ? { ...x, kind: ev.target.value } : x)))} aria-label="Tipo">
                  {["FREIGHT", "FEE", "COMMISSION", "REPAIR", "TESTING", "OTHER"].map((k) => (
                    <option key={k} value={k}>
                      {COST_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                <Input value={e.description} placeholder="Descrição" onChange={(ev) => setExtras((s) => s.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)))} aria-label="Descrição" />
                <MoneyInput value={e.amountCents} onChange={(c) => setExtras((s) => s.map((x, j) => (j === i ? { ...x, amountCents: c } : x)))} aria-label="Valor" />
                <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setExtras((s) => s.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-3">
              <Button size="sm" variant="ghost" onClick={() => setExtras((s) => [...s, { key: crypto.randomUUID(), kind: "FREIGHT", description: "", amountCents: null }])}>
                <Plus /> Frete, taxa ou comissão
              </Button>
              <Field label="Desconto negociado" className="ml-auto w-48">
                <MoneyInput value={discount} onChange={setDiscount} />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: veio sem caixa; vendedor testou na hora" />
        </Section>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <Section title="Resumo">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-3">Peças ({lines.reduce((a, l) => a + qty(l), 0)} un.)</dt>
              <dd>
                <Money cents={subtotal} />
              </dd>
            </div>
            {extrasTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-3">Custos extras</dt>
                <dd>
                  <Money cents={extrasTotal} />
                </dd>
              </div>
            )}
            {(discount ?? 0) > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-3">Desconto</dt>
                <dd>
                  <Money cents={-(discount ?? 0)} />
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>
                <Money cents={total} />
              </dd>
            </div>
          </dl>
          {lines.length > 0 && subtotal > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-[0.75rem] font-medium text-ink-3">Custo real por unidade</p>
              <ul className="space-y-1 text-[0.8125rem]">
                {lines.map((l, i) => (
                  <li key={l.key} className="flex justify-between gap-2">
                    <span className="truncate text-ink-2">{l.description || [l.product.brand, l.product.model].filter(Boolean).join(" ") || `Peça ${i + 1}`}</span>
                    <Money cents={unitCost(i)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
        <Section title="Pagamento">
          <PaymentPlan value={plan} onChange={setPlan} totalCents={total} accounts={accounts} direction="out" />
        </Section>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" loading={pending === "confirm"} disabled={!!pending || total <= 0} onClick={() => submit(true)}>
            Confirmar compra ({formatBRL(total)})
          </Button>
          <Button variant="ghost" loading={pending === "draft"} disabled={!!pending} onClick={() => submit(false)}>
            Salvar como rascunho
          </Button>
          <p className="text-center text-[0.75rem] text-ink-3">Ao confirmar, as peças entram no estoque e o pagamento é registrado.</p>
        </div>
      </aside>
    </div>
  );
}
