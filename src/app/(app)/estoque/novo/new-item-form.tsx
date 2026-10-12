"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Archive, Handshake, UserRound, Camera, X, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Section, Callout, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select, Checkbox, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker, LocationSelect, type ContactOption } from "@/components/app/pickers";
import { ProductFields, emptyProduct, productPayload, type CategoryOpt, type ProductOpt, type ProductValue } from "@/components/app/product-fields";
import { uploadFile } from "@/components/app/photos";
import { CONDITION_LABEL, COMPLETENESS_FIELDS, METHOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { createItemAction, quickPurchaseAction } from "../actions";

type Mode = "PURCHASE" | "MIGRATION" | "CONSIGNMENT" | "CLIENT";

const MODES: { value: Mode; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "PURCHASE", label: "Comprei agora", hint: "Registra a compra e o pagamento", icon: ShoppingCart },
  { value: "MIGRATION", label: "Já estava comigo", hint: "Estoque inicial, sem movimentar caixa", icon: Archive },
  { value: "CONSIGNMENT", label: "Consignado", hint: "Vendo por conta de outra pessoa", icon: Handshake },
  { value: "CLIENT", label: "De cliente", hint: "Equipamento de cliente (montagem/serviço)", icon: UserRound },
];

export function NewItemForm({
  categories,
  locations,
  contacts,
  accounts,
  products,
  canPurchase,
  seeCost,
  targetMarginPct,
  today,
  initialMode,
  initialLocationId,
}: {
  categories: CategoryOpt[];
  locations: { id: string; path: string }[];
  contacts: ContactOption[];
  accounts: { id: string; name: string }[];
  products: ProductOpt[];
  canPurchase: boolean;
  seeCost: boolean;
  targetMarginPct: number;
  today: string;
  initialMode?: Mode;
  initialLocationId: string | null;
}) {
  const router = useRouter();
  const availableModes = MODES.filter((m) => (m.value === "PURCHASE" ? canPurchase : m.value === "MIGRATION" ? seeCost || true : true));
  const [mode, setMode] = React.useState<Mode>(initialMode ?? (canPurchase ? "PURCHASE" : "MIGRATION"));
  const [product, setProduct] = React.useState<ProductValue>(emptyProduct());
  const [title, setTitle] = React.useState("");
  const [serial, setSerial] = React.useState("");
  const [condition, setCondition] = React.useState("GOOD");
  const [initialStatus, setInitialStatus] = React.useState<"AVAILABLE" | "INSPECTION">("AVAILABLE");
  const [defects, setDefects] = React.useState("");
  const [completeness, setCompleteness] = React.useState<Record<string, boolean>>({});
  const [quantity, setQuantity] = React.useState("1");
  const [locationId, setLocationId] = React.useState<string | null>(initialLocationId ?? locations[0]?.id ?? null);
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(today);
  const [price, setPrice] = React.useState<number | null>(null);
  const [freight, setFreight] = React.useState<number | null>(null);
  const [costMode, setCostMode] = React.useState<"KNOWN" | "ESTIMATED" | "UNKNOWN">("KNOWN");
  const [paid, setPaid] = React.useState<"NOW" | "LATER">("NOW");
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [method, setMethod] = React.useState("PIX");
  const [dueDate, setDueDate] = React.useState(today);
  const [expectedPrice, setExpectedPrice] = React.useState<number | null>(null);
  const [marketValue, setMarketValue] = React.useState<number | null>(null);
  const [warrantyUntil, setWarrantyUntil] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [photos, setPhotos] = React.useState<File[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const keyRef = React.useRef(crypto.randomUUID());
  const photoRef = React.useRef<HTMLInputElement>(null);

  const cat = categories.find((c) => c.id === product.categoryId);
  const isLot = cat?.kind === "CONSUMABLE";
  const qty = Math.max(1, Number(quantity) || 1);
  const unitCost = mode === "PURCHASE" ? (price !== null ? price + Math.round((freight ?? 0) / qty) : null) : mode === "CLIENT" ? null : costMode === "UNKNOWN" ? null : price;
  const suggested = unitCost ? Math.ceil(unitCost / (1 - targetMarginPct / 100) / 100) * 100 : null;
  const isPurchase = mode === "PURCHASE";

  const validate = () => {
    const e: Record<string, string> = {};
    if (!product.categoryId) e.categoryId = "Escolha a categoria.";
    if (!product.productId && !product.model.trim() && !product.brand.trim()) e.model = "Informe o modelo.";
    if (isPurchase && price === null) e.price = "Informe quanto pagou.";
    if (mode === "MIGRATION" && costMode !== "UNKNOWN" && price === null) e.price = "Informe o custo ou marque como desconhecido.";
    if (mode === "CONSIGNMENT" && price === null) e.price = "Informe o valor de repasse ao dono.";
    if ((mode === "CONSIGNMENT" || mode === "CLIENT") && !contactId) e.contactId = "Informe o dono do item.";
    if (isPurchase && paid === "NOW" && !accountId) e.accountId = "Escolha a conta do pagamento.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) {
      toast.error("Revise os campos destacados.");
      return;
    }
    if (!navigator.onLine) {
      toast.error("Sem conexão: nada foi enviado. Tente quando a internet voltar.");
      return;
    }
    setPending(true);
    const tagList = tags.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const p = productPayload(product);
    let itemIds: string[] = [];
    let primaryId: string | null = null;
    try {
      if (isPurchase) {
        const total = price! * (isLot ? qty : qty) + (freight ?? 0);
        const r = await quickPurchaseAction({
          idempotencyKey: keyRef.current,
          contactId,
          dateInput: date,
          lines: [
            {
              product: { ...p, tracking: isLot ? "LOT" : "UNIT" },
              description: title.trim() || null,
              quantity: qty,
              unitPriceCents: price!,
              condition: condition as never,
              locationId,
              serials: !isLot && serial.trim() ? [serial.trim()] : [],
              expectedPriceCents: expectedPrice,
              notes: notes || null,
              defects: defects || null,
              warrantyUntil: warrantyUntil ? new Date(`${warrantyUntil}T12:00:00`) : null,
              completeness,
              initialStatus,
            },
          ],
          extras: freight ? [{ kind: "FREIGHT", description: "Frete da compra", amountCents: freight }] : [],
          payment:
            paid === "NOW"
              ? { now: [{ amountCents: total, accountId, method: method as never }] }
              : { now: [], remainder: { installments: 1, firstDueDate: new Date(`${dueDate}T12:00:00`) } },
        });
        if (!r.ok) throw new Error(r.error);
        itemIds = r.data.items.map((i) => i.id);
        primaryId = r.data.itemId;
      } else {
        const r = await createItemAction({
          idempotencyKey: keyRef.current,
          product: { ...p, tracking: isLot ? "LOT" : "UNIT" },
          title: title.trim() || null,
          serial: isLot ? null : serial.trim() || null,
          origin: mode,
          ownerContactId: mode === "CONSIGNMENT" || mode === "CLIENT" ? contactId : null,
          condition: condition as never,
          initialStatus,
          defects: defects || null,
          completeness,
          quantity: isLot ? qty : 1,
          costMode: mode === "CONSIGNMENT" ? "KNOWN" : mode === "CLIENT" ? "KNOWN" : costMode,
          unitCostCents: mode === "CLIENT" ? 0 : costMode === "UNKNOWN" && mode === "MIGRATION" ? null : price,
          expectedPriceCents: expectedPrice,
          estimatedValueCents: marketValue,
          warrantyUntil: warrantyUntil ? new Date(`${warrantyUntil}T12:00:00`) : null,
          locationId,
          acquiredAt: new Date(`${date}T12:00:00`),
          tags: tagList,
          notes: notes || null,
        });
        if (!r.ok) throw new Error(r.error);
        primaryId = r.data.id;
        itemIds = [r.data.id];
      }
    } catch (err) {
      setPending(false);
      toast.error((err as Error).message);
      return;
    }
    // Fotos vão para a primeira unidade criada.
    if (primaryId && photos.length) {
      let failed = 0;
      for (const f of photos) {
        try {
          await uploadFile(f, "Item", primaryId);
        } catch {
          failed++;
        }
      }
      if (failed) toast.warning(`${failed} foto(s) não foram enviadas. Adicione novamente na ficha do item.`);
    }
    toast.success(itemIds.length > 1 ? `${itemIds.length} unidades cadastradas` : "Item cadastrado");
    router.push(itemIds.length > 1 ? "/estoque?sort=recent" : `/estoque/${primaryId}`);
    router.refresh();
  };

  return (
    <form
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Como o item chegou">
          {availableModes.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-[10px] border p-3 text-left transition-[border-color,box-shadow,background-color] duration-150",
                mode === m.value ? "border-accent bg-accent-soft/50 shadow-[var(--focus)]" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <m.icon className={cn("size-[18px]", mode === m.value ? "text-accent-text" : "text-ink-3")} />
              <span className="text-sm font-medium text-ink">{m.label}</span>
              <span className="text-[0.75rem] leading-snug text-ink-3">{m.hint}</span>
            </button>
          ))}
        </div>

        <Section title="O que é">
          <ProductFields value={product} onChange={setProduct} categories={categories} products={products} errors={errors} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nome de exibição" hint="Opcional. Se vazio, usa marca + modelo.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: RTX 3060 12GB — sem caixa" />
            </Field>
            {isLot ? (
              <Field label="Quantidade" required hint="Insumos são controlados por lote (quantidade).">
                <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
              </Field>
            ) : isPurchase ? (
              <Field label="Quantidade de unidades" hint="Mais de 1 cria unidades separadas, cada uma com seu código.">
                <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
              </Field>
            ) : (
              <Field label="Número de série">
                <Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Opcional" className="code" />
              </Field>
            )}
            {isPurchase && !isLot && (
              <Field label="Número de série" hint={qty > 1 ? "Com várias unidades, informe as séries depois em cada item." : undefined}>
                <Input value={serial} onChange={(e) => setSerial(e.target.value)} disabled={qty > 1} className="code" placeholder="Opcional" />
              </Field>
            )}
          </div>
        </Section>

        <Section title="Estado">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Condição">
              <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
                {Object.entries(CONDITION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Situação ao entrar">
              <SegmentedControl
                value={initialStatus}
                onChange={setInitialStatus}
                options={[
                  { value: "AVAILABLE", label: "Pronto para venda" },
                  { value: "INSPECTION", label: "Testar antes" },
                ]}
              />
            </Field>
            <Field label="Defeitos ou observações de estado" className="sm:col-span-2">
              <Textarea value={defects} onChange={(e) => setDefects(e.target.value)} rows={2} placeholder="Ex.: ventoinha com ruído, sem backplate, pasta térmica vencida" />
            </Field>
            <div className="flex flex-wrap gap-x-5 gap-y-2.5 sm:col-span-2">
              {COMPLETENESS_FIELDS.map((c) => (
                <Checkbox key={c.key} label={c.label} checked={!!completeness[c.key]} onChange={(e) => setCompleteness((s) => ({ ...s, [c.key]: e.target.checked }))} />
              ))}
            </div>
          </div>
        </Section>

        <Section title={isPurchase ? "Compra" : mode === "MIGRATION" ? "Custo" : "Dono do item"}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(isPurchase || mode === "CONSIGNMENT" || mode === "CLIENT") && (
              <Field label={isPurchase ? "Comprado de" : "Dono"} required={!isPurchase} error={errors.contactId} hint={isPurchase ? "Pessoa ou loja — ajuda a rastrear a origem." : undefined}>
                <ContactPicker value={contactId} onChange={(id) => setContactId(id)} options={contacts} role={isPurchase ? "supplier" : undefined} invalid={!!errors.contactId} placeholder={isPurchase ? "Fornecedor (opcional)" : "Escolher dono"} />
              </Field>
            )}
            <Field label={isPurchase ? "Data da compra" : "Data de entrada"}>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {mode === "MIGRATION" && (
              <Field label="Você sabe quanto custou?" className="sm:col-span-2">
                <SegmentedControl
                  value={costMode}
                  onChange={setCostMode}
                  options={[
                    { value: "KNOWN", label: "Sei o valor" },
                    { value: "ESTIMATED", label: "Valor aproximado" },
                    { value: "UNKNOWN", label: "Não sei" },
                  ]}
                />
              </Field>
            )}
            {mode !== "CLIENT" && !(mode === "MIGRATION" && costMode === "UNKNOWN") && (
              <Field
                label={isPurchase ? (qty > 1 || isLot ? "Preço pago por unidade" : "Preço pago") : mode === "CONSIGNMENT" ? "Valor de repasse ao dono" : costMode === "ESTIMATED" ? "Custo aproximado" : "Custo de aquisição"}
                required
                error={errors.price}
                hint={mode === "CONSIGNMENT" ? "Quanto você deve ao dono quando vender. É o custo do item." : undefined}
              >
                <MoneyInput value={price} onChange={setPrice} invalid={!!errors.price} />
              </Field>
            )}
            {mode === "MIGRATION" && costMode === "UNKNOWN" && (
              <Callout tone="warning" icon={Info} className="sm:col-span-2">
                O item entra com <strong>custo desconhecido</strong>: não conta como zero no valor do estoque e o lucro da venda fica sinalizado. Você pode informar o custo depois na ficha do item.
              </Callout>
            )}
            {isPurchase && (
              <>
                <Field label="Frete / taxas da compra" hint="Somado ao custo e rateado entre as unidades.">
                  <MoneyInput value={freight} onChange={setFreight} />
                </Field>
                <Field label="Pagamento">
                  <SegmentedControl
                    value={paid}
                    onChange={setPaid}
                    options={[
                      { value: "NOW", label: "Já paguei" },
                      { value: "LATER", label: "Vou pagar depois" },
                    ]}
                  />
                </Field>
                {paid === "NOW" ? (
                  <>
                    <Field label="Pago com a conta" error={errors.accountId}>
                      <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Forma">
                      <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                        {Object.entries(METHOD_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                ) : (
                  <Field label="Vencimento" hint="Fica em Contas a pagar até você registrar o pagamento.">
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                )}
              </>
            )}
          </div>
        </Section>

        <Section title="Fotos">
          <div className="flex flex-wrap gap-2">
            {photos.map((f, i) => (
              <div key={i} className="relative size-20 overflow-hidden rounded-[8px] border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white" aria-label="Remover foto">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => photoRef.current?.click()} className="grid size-20 place-items-center rounded-[8px] border border-dashed border-line-strong text-ink-3 hover:border-accent hover:text-accent-text" aria-label="Adicionar fotos">
              <Camera className="size-5" />
            </button>
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink-3">As fotos são reduzidas no aparelho antes do envio para economizar dados.</p>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => (setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])]), (e.target.value = ""))} />
        </Section>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <Section title="Onde fica">
          <LocationSelect value={locationId} onChange={setLocationId} options={locations} />
        </Section>
        <Section title="Preço">
          <div className="flex flex-col gap-4">
            <Field label="Preço de venda pretendido" hint={suggested && seeCost ? <>Para {targetMarginPct}% de margem: <button type="button" className="font-medium text-accent-text underline-offset-2 hover:underline" onClick={() => setExpectedPrice(suggested)}>{formatBRL(suggested)}</button></> : undefined}>
              <MoneyInput value={expectedPrice} onChange={setExpectedPrice} />
            </Field>
            {!isPurchase && (
              <Field label="Valor de mercado estimado" hint="Sua estimativa de quanto vale hoje. Nunca conta como lucro.">
                <MoneyInput value={marketValue} onChange={setMarketValue} />
              </Field>
            )}
            {unitCost !== null && seeCost && (
              <div className="rounded-[8px] bg-surface-2 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-3">Custo por unidade</span>
                  <Money cents={unitCost} />
                </div>
                {expectedPrice !== null && expectedPrice > 0 && (
                  <div className="mt-1 flex justify-between">
                    <span className="text-ink-3">Margem prevista</span>
                    <span className={cn("num", expectedPrice >= unitCost ? "text-positive" : "text-negative")}>
                      {formatBRL(expectedPrice - unitCost)} ({Math.round(((expectedPrice - unitCost) / expectedPrice) * 100)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
        <Section title="Mais detalhes">
          <div className="flex flex-col gap-4">
            <Field label="Garantia até">
              <Input type="date" value={warrantyUntil} onChange={(e) => setWarrantyUntil(e.target.value)} />
            </Field>
            <Field label="Etiquetas" hint="Separe por vírgula. Ex.: gamer, promoção">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Anotações">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </Field>
          </div>
        </Section>
        <div className="pb-safe sticky bottom-16 z-10 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
            {isPurchase ? (qty > 1 && !isLot ? `Registrar compra de ${qty} unidades` : "Registrar compra e item") : "Cadastrar item"}
          </Button>
        </div>
      </aside>
    </form>
  );
}
