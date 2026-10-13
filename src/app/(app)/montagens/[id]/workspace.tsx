"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CircleCheck, CircleAlert, TriangleAlert, CircleHelp, Printer, CheckCircle2, XCircle, Pencil, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { Section, Money, Callout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { LocationSelect, type ContactOption } from "@/components/app/pickers";
import { ItemPicker } from "@/components/app/item-picker";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { COST_KIND_LABEL, METHOD_LABEL, OWNERSHIP_LABEL } from "@/lib/labels";
import { formatBRL, formatPct } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { BuildForm } from "../build-form";
import { addPartAction, removePartAction, addExpenseAction, removeExpenseAction, setStageAction, completeBuildAction, cancelBuildAction, saveBuildAction } from "../actions";
import type { BuildDetail } from "@/server/queries/builds";
import type { PickableItem } from "@/server/queries/items";

const SLOTS: { kind: string; label: string; optional?: boolean }[] = [
  { kind: "CPU", label: "Processador" },
  { kind: "MOTHERBOARD", label: "Placa-mãe" },
  { kind: "RAM", label: "Memória" },
  { kind: "GPU", label: "Placa de vídeo", optional: true },
  { kind: "STORAGE", label: "Armazenamento" },
  { kind: "PSU", label: "Fonte" },
  { kind: "CASE", label: "Gabinete" },
  { kind: "COOLER", label: "Refrigeração", optional: true },
];

const STAGES = [
  { v: "PLANNING", l: "Planejamento" },
  { v: "ASSEMBLING", l: "Em montagem" },
  { v: "TESTING", l: "Em testes" },
  { v: "COMPLETED", l: "Concluída" },
] as const;

export function BuildWorkspace({
  d,
  items,
  accounts,
  contacts,
  locations,
  seeCost,
  defaultWarrantyDays,
  tz,
}: {
  d: BuildDetail;
  items: PickableItem[];
  accounts: { id: string; name: string }[];
  contacts: ContactOption[];
  locations: { id: string; path: string }[];
  seeCost: boolean;
  defaultWarrantyDays: number;
  tz: string;
}) {
  const router = useRouter();
  const b = d.build;
  const open = ["PLANNING", "ASSEMBLING", "TESTING"].includes(b.status);
  const [picker, setPicker] = React.useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const add = useAction(addPartAction);
  const stage = useAction(setStageAction);
  const cancel = useAction(cancelBuildAction);
  const others = d.parts.filter((p) => !SLOTS.some((s) => s.kind === p.kind));
  const pickerItems = picker && picker !== "ANY" ? items.filter((i) => (picker === "OTHER" ? !SLOTS.some((s) => s.kind === i.kind) : i.kind === picker)) : items;
  const stageIdx = STAGES.findIndex((s) => s.v === b.status);

  const removePart = async (p: BuildDetail["parts"][number]) => {
    const c = await confirmDialog({
      title: `Retirar ${p.title} da montagem?`,
      description: "A peça volta ao estoque. Se estiver com defeito, ela fica marcada assim.",
      input: { label: "Motivo (ex.: troca por outro modelo, defeito no teste)", required: true },
      confirmLabel: "Retirar peça",
    });
    if (!c.ok) return;
    const def = /defeit|queim|não liga|nao liga|artefato/i.test(c.value);
    const r = await removePartAction({ buildId: b.id, partId: p.partId, reason: c.value, outcome: def ? "DEFECTIVE" : "AVAILABLE" });
    if (r.ok) router.refresh();
  };

  const SlotCard = ({ kind, label, optional }: { kind: string; label: string; optional?: boolean }) => {
    const parts = kind === "__other" ? others : d.parts.filter((p) => p.kind === kind);
    return (
      <div className={cn("rounded-[10px] border p-3", parts.length ? "border-line bg-surface" : "border-dashed border-line-strong bg-surface-2/40")}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[0.75rem] font-medium text-ink-3">
            {label}
            {optional && " (opcional)"}
          </span>
          {open && (
            <button onClick={() => setPicker(kind === "__other" ? "OTHER" : kind)} className="text-[0.75rem] font-medium text-accent-text hover:underline">
              {parts.length ? "+ outra" : "+ escolher"}
            </button>
          )}
        </div>
        {parts.length === 0 ? (
          <p className="text-sm text-ink-3">—</p>
        ) : (
          parts.map((p) => (
            <div key={p.partId} className="group flex items-start justify-between gap-2 py-0.5">
              <Link href={`/estoque/${p.itemId}`} className="min-w-0 text-sm text-ink no-underline hover:text-accent-text">
                <span className="block truncate">
                  {p.quantity > 1 ? `${p.quantity}× ` : ""}
                  {p.title}
                </span>
                <span className="code block text-ink-3">
                  {p.code}
                  {p.ownership !== "OWNED" ? ` · ${OWNERSHIP_LABEL[p.ownership]}` : ""}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                {seeCost && <Money cents={p.costCents} className="text-[0.8125rem] text-ink-2" unknown="?" />}
                {open && (
                  <button onClick={() => removePart(p)} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-negative" aria-label={`Retirar ${p.title}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="surface flex flex-wrap items-center gap-2 p-3">
          <ol className="flex flex-1 flex-wrap items-center gap-1">
            {STAGES.map((s, i) => (
              <li key={s.v} className="flex items-center gap-1">
                <button
                  disabled={!open || s.v === "COMPLETED" || s.v === b.status || stage.pending}
                  onClick={() => stage.run({ buildId: b.id, status: s.v as "PLANNING" | "ASSEMBLING" | "TESTING" })}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium transition-colors",
                    i < stageIdx || b.status === "COMPLETED" ? "text-positive" : i === stageIdx ? "bg-ink text-bg" : "text-ink-3 hover:bg-surface-2 disabled:hover:bg-transparent",
                  )}
                >
                  {(i < stageIdx || b.status === "COMPLETED") && <CircleCheck className="size-3.5" />}
                  {s.l}
                </button>
                {i < STAGES.length - 1 && <span className="h-px w-4 bg-line-strong" aria-hidden />}
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/imprimir/montagem/${b.id}`} target="_blank">
                <Printer /> Ficha técnica
              </Link>
            </Button>
            {open && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                  <Pencil /> Dados
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={cancel.pending}
                  onClick={async () => {
                    const c = await confirmDialog({ title: "Cancelar a montagem?", description: "As peças voltam ao estoque. Despesas já pagas viram perda no resultado.", input: { label: "Motivo", required: true }, confirmLabel: "Cancelar montagem", tone: "danger" });
                    if (c.ok) cancel.run({ buildId: b.id, reason: c.value });
                  }}
                >
                  <XCircle /> Cancelar
                </Button>
                <Button size="sm" variant="primary" disabled={!d.parts.length} onClick={() => setCompleteOpen(true)}>
                  <CheckCircle2 /> Concluir
                </Button>
              </>
            )}
          </div>
        </div>

        <Section
          title="Peças"
          description={open ? "Escolher uma peça a reserva: ela sai do estoque disponível até a montagem terminar ou ser cancelada." : undefined}
          actions={open ? <Button size="sm" onClick={() => setPicker("ANY")}><Plus /> Adicionar peça</Button> : undefined}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SLOTS.map((s) => (
              <SlotCard key={s.kind} {...s} />
            ))}
          </div>
          <div className="mt-3">
            <SlotCard kind="__other" label="Outros e insumos (pasta térmica, cabos, fans…)" optional />
          </div>
        </Section>

        <Section title="Compatibilidade" description="Avisos baseados nas especificações cadastradas. Não substituem a conferência na hora de montar.">
          {d.compat.length === 0 ? (
            <p className="text-sm text-ink-3">Adicione peças para ver as verificações.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {d.compat.map((c, i) => {
                const Icon = c.level === "ok" ? CircleCheck : c.level === "error" ? CircleAlert : c.level === "warn" ? TriangleAlert : CircleHelp;
                return (
                  <li key={i} className="flex gap-2 text-sm">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", c.level === "ok" ? "text-positive" : c.level === "error" ? "text-negative" : c.level === "warn" ? "text-warning-text" : "text-ink-3")} />
                    <span className={c.level === "error" ? "text-ink" : "text-ink-2"}>{c.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <TestNotes d={d} disabled={b.status === "CANCELLED"} />

        {d.removed.length > 0 && (
          <Section title="Peças retiradas">
            <ul className="space-y-1.5 text-sm">
              {d.removed.map((r) => (
                <li key={r.id}>
                  {r.item ? (
                    <Link href={`/estoque/${r.item.id}`}>
                      {r.item.code} {r.item.title}
                    </Link>
                  ) : (
                    "Item"
                  )}{" "}
                  <span className="text-ink-3">
                    — {r.reason} · {r.at ? formatDateTime(r.at, tz) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <aside className="flex flex-col gap-5">
        {d.costing && (
          <Section title="Custo e preço">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-3">Peças próprias</dt>
                <dd>
                  <Money cents={d.costing.partsCostCents} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Despesas da montagem</dt>
                <dd>
                  <Money cents={d.costing.expensesCostCents} />
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <dt>Custo total do PC</dt>
                <dd>
                  <Money cents={d.costing.totalCostCents} />
                </dd>
              </div>
              {d.costing.costStatus === "UNKNOWN" && <p className="text-[0.8125rem] text-warning-text">Há peça com custo desconhecido: o custo acima está incompleto.</p>}
              {d.costing.ownLaborCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-3">Sua mão de obra (atribuída)</dt>
                  <dd>
                    <Money cents={d.costing.ownLaborCents} />
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-3">Preço sugerido ({formatPct(d.costing.targetMarginPct, 0)} de margem)</dt>
                <dd className="font-medium">
                  <Money cents={d.costing.suggestedPriceCents} />
                </dd>
              </div>
              {b.targetPriceCents ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Preço alvo</dt>
                    <dd>
                      <Money cents={b.targetPriceCents} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Margem esperada</dt>
                    <dd>
                      <Money cents={d.costing.expectedMarginCents} tone="auto" /> <span className="text-ink-3">({formatPct(d.costing.expectedMarginPct, 0)})</span>
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </Section>
        )}

        <Section title="Despesas" description="Mão de obra de terceiros, insumos comprados, testes… entram no custo do PC." actions={open && seeCost ? <Button size="sm" onClick={() => setExpenseOpen(true)}><Plus /> Despesa</Button> : undefined}>
          {d.expenses.length === 0 ? (
            <p className="text-sm text-ink-3">Nenhuma despesa.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.expenses.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <span>
                    {e.description}
                    <span className="block text-[0.75rem] text-ink-3">
                      {COST_KIND_LABEL[e.kind] ?? e.kind} · {e.paymentMode === "PAID" ? "pago" : "a pagar"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Money cents={e.amountCents} />
                    {open && seeCost && <RemoveExpense buildId={b.id} expense={e} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Registro">
          <ul className="space-y-2 text-[0.8125rem]">
            {d.history.map((h) => (
              <li key={h.id}>
                <span className="text-ink">{h.summary}</span>
                <span className="block text-ink-3">
                  {h.user ?? "—"} · {formatDateTime(h.at, tz)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </aside>

      <ItemPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        items={pickerItems}
        excludeIds={d.parts.map((p) => p.itemId)}
        seeCost={seeCost}
        groupBy="kind"
        title="Adicionar peça à montagem"
        onPick={async (it) => {
          let qty = 1;
          if (it.tracking === "LOT") {
            const c = await confirmDialog({ title: `Quantas unidades de ${it.title}?`, input: { label: `Quantidade (disponível: ${it.available})`, required: true, minLength: 1 }, confirmLabel: "Adicionar" });
            if (!c.ok) return;
            qty = Math.max(1, Math.min(it.available, Number(c.value.replace(/\D/g, "")) || 1));
          }
          const r = await add.run({ buildId: b.id, itemId: it.id, quantity: qty });
          if (r.ok) setPicker(null);
        }}
      />
      <ExpenseSheet open={expenseOpen} onClose={() => setExpenseOpen(false)} buildId={b.id} accounts={accounts} />
      <CompleteSheet open={completeOpen} onClose={() => setCompleteOpen(false)} d={d} locations={locations} />
      <Sheet open={editOpen} onOpenChange={setEditOpen} title="Dados da montagem" width="lg">
        <BuildForm
          contacts={contacts}
          defaultWarrantyDays={defaultWarrantyDays}
          ownLaborHourCents={0}
          onDone={() => {
            setEditOpen(false);
            router.refresh();
          }}
          initial={{
            id: b.id,
            name: b.name,
            purpose: b.purpose as "SALE" | "CUSTOMER_ORDER",
            contactId: b.contactId,
            description: b.description ?? "",
            targetPriceCents: b.targetPriceCents,
            warrantyDays: b.warrantyDays ? String(b.warrantyDays) : "",
            ownLaborCents: b.ownLaborCents,
            notes: b.notes ?? "",
            testNotes: b.testNotes ?? "",
            benchmarks: b.benchmarks ?? "",
          }}
        />
      </Sheet>
    </div>
  );
}

function TestNotes({ d, disabled }: { d: BuildDetail; disabled: boolean }) {
  const b = d.build;
  const [tests, setTests] = React.useState(b.testNotes ?? "");
  const [bench, setBench] = React.useState(b.benchmarks ?? "");
  const { run, pending } = useAction(saveBuildAction);
  const dirty = tests !== (b.testNotes ?? "") || bench !== (b.benchmarks ?? "");
  return (
    <Section title="Testes e desempenho" description="Registre o que foi testado — vira argumento de venda e prova em caso de garantia.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Testes realizados">
          <Textarea value={tests} onChange={(e) => setTests(e.target.value)} rows={4} disabled={disabled} placeholder="Ex.: OCCT 1h sem erros, CPU máx. 72 °C, GPU 68 °C; memória 4 passadas MemTest" />
        </Field>
        <Field label="Benchmarks">
          <Textarea value={bench} onChange={(e) => setBench(e.target.value)} rows={4} disabled={disabled} placeholder="Ex.: Cinebench R23 11.200 pts; Fortnite 1080p épico 110 fps" />
        </Field>
      </div>
      {!disabled && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={!dirty}
            loading={pending}
            onClick={() =>
              run({
                id: b.id,
                name: b.name,
                purpose: b.purpose as "SALE" | "CUSTOMER_ORDER",
                contactId: b.contactId,
                description: b.description,
                targetPriceCents: b.targetPriceCents,
                warrantyDays: b.warrantyDays,
                ownLaborCents: b.ownLaborCents,
                notes: b.notes,
                testNotes: tests || null,
                benchmarks: bench || null,
              })
            }
          >
            <Wrench /> Salvar testes
          </Button>
        </div>
      )}
    </Section>
  );
}

function RemoveExpense({ buildId, expense }: { buildId: string; expense: { id: string; description: string; amountCents: number; paymentMode: string } }) {
  const { run, pending } = useAction(removeExpenseAction);
  return (
    <button
      disabled={pending}
      className="rounded p-1 text-ink-3 hover:text-negative"
      aria-label="Remover despesa"
      onClick={async () => {
        const c = await confirmDialog({
          title: `Remover “${expense.description}”?`,
          description: expense.paymentMode === "PAID" ? `O pagamento de ${formatBRL(expense.amountCents)} será registrado como estornado (devolvido).` : "A conta a pagar será cancelada.",
          input: { label: "Motivo", required: true },
          confirmLabel: "Remover",
          tone: "danger",
        });
        if (c.ok) run({ buildId, expenseId: expense.id, reason: c.value });
      }}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

function ExpenseSheet({ open, onClose, buildId, accounts }: { open: boolean; onClose: () => void; buildId: string; accounts: { id: string; name: string }[] }) {
  const [kind, setKind] = React.useState("LABOR");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<"PAID" | "PAYABLE">("PAID");
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [method, setMethod] = React.useState("PIX");
  const { run, pending } = useAction(addExpenseAction, {
    onSuccess: () => {
      onClose();
      setDescription("");
      setAmount(null);
    },
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Despesa da montagem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!amount || description.trim().length < 2} onClick={() => run((key) => ({ idempotencyKey: key, buildId, kind: kind as never, description, amountCents: amount!, paymentMode: mode, accountId, method: method as never }))}>
            Adicionar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="LABOR">Mão de obra (terceiro)</option>
              <option value="CONSUMABLE">Insumos comprados</option>
              <option value="TESTING">Testes</option>
              <option value="PARTS">Peça avulsa</option>
              <option value="OTHER">Outro</option>
            </Select>
          </Field>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
        </div>
        <Field label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: montagem e cable management — técnico João" />
        </Field>
        <Field label="Pagamento">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "PAID", label: "Já paguei" },
              { value: "PAYABLE", label: "A pagar" },
            ]}
          />
        </Field>
        {mode === "PAID" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Conta">
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
          </div>
        )}
      </div>
    </Sheet>
  );
}

function CompleteSheet({ open, onClose, d, locations }: { open: boolean; onClose: () => void; d: BuildDetail; locations: { id: string; path: string }[] }) {
  const router = useRouter();
  const b = d.build;
  const [title, setTitle] = React.useState(b.name);
  const [loc, setLoc] = React.useState<string | null>(locations[0]?.id ?? null);
  const [price, setPrice] = React.useState<number | null>(b.targetPriceCents ?? d.costing?.suggestedPriceCents ?? null);
  const { run, pending } = useAction(completeBuildAction, {
    onSuccess: (r) => {
      onClose();
      router.push(`/estoque/${r.pcItemId}`);
    },
  });
  const errors = d.compat.filter((c) => c.level === "error");
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Concluir montagem"
      description="Cria UM item vendável (o PC) com o custo somado. As peças passam a constar como instaladas nele — sem duplicar estoque."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="primary" loading={pending} disabled={title.trim().length < 2} onClick={() => run((key) => ({ idempotencyKey: key, buildId: b.id, title, locationId: loc, expectedPriceCents: price }))}>
            Concluir e criar o PC
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {errors.length > 0 && (
          <Callout tone="negative" title="Há incompatibilidades apontadas">
            {errors.map((e) => e.text).join(" ")} Confira antes de concluir.
          </Callout>
        )}
        <Field label="Nome do PC no estoque">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Onde o PC vai ficar">
          <LocationSelect value={loc} onChange={setLoc} options={locations} />
        </Field>
        <Field label="Preço de venda pretendido">
          <MoneyInput value={price} onChange={setPrice} />
        </Field>
        {d.costing && (
          <p className="text-sm text-ink-2">
            Custo do PC: <Money cents={d.costing.totalCostCents} className="font-semibold text-ink" /> ({d.parts.length} peças + despesas)
          </p>
        )}
        <Badge tone="info" className="self-start">
          Insumos (lotes) são consumidos; peças avulsas ficam instaladas no PC
        </Badge>
      </div>
    </Sheet>
  );
}
