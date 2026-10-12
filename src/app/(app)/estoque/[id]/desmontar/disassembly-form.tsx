"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Info } from "lucide-react";
import { Section, Callout, Money, Table, Th, Td } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { planDisassembly } from "@/lib/disassembly-plan";
import { formatBRL } from "@/lib/money";
import { disassembleAction } from "../../../montagens/actions";

type Outcome = "AVAILABLE" | "DEFECTIVE" | "SCRAP";
type Child = { id: string; code: string; title: string; category: string; unitCostCents: number | null };
type NewComp = { key: string; categoryId: string; title: string; serial: string; outcome: Outcome; estimatedValueCents: number | null };

const OUTCOME: Record<Outcome, string> = { AVAILABLE: "Volta ao estoque", DEFECTIVE: "Volta com defeito", SCRAP: "Descartar" };

export function DisassemblyForm({
  pc,
  installed,
  categories,
  locations,
  seeCost,
}: {
  pc: { id: string; code: string; title: string; unitCostCents: number | null; costStatus: string; locationId: string | null };
  installed: Child[];
  categories: { id: string; name: string; kind: string }[];
  locations: { id: string; path: string }[];
  seeCost: boolean;
}) {
  const router = useRouter();
  const hasChildren = installed.length > 0;
  const [method, setMethod] = React.useState<"ORIGINAL_COST" | "BY_VALUE">(hasChildren && installed.every((c) => c.unitCostCents !== null) ? "ORIGINAL_COST" : "BY_VALUE");
  const [remainder, setRemainder] = React.useState<"ALLOCATE" | "WRITE_OFF">("ALLOCATE");
  const [children, setChildren] = React.useState(installed.map((c) => ({ ...c, outcome: "AVAILABLE" as Outcome, estimatedValueCents: null as number | null })));
  const [comps, setComps] = React.useState<NewComp[]>(hasChildren ? [] : [{ key: crypto.randomUUID(), categoryId: "", title: "", serial: "", outcome: "AVAILABLE", estimatedValueCents: null }]);
  const [locationId, setLocationId] = React.useState(pc.locationId ?? "");
  const [notes, setNotes] = React.useState("");
  const { run, pending } = useAction(disassembleAction, { onSuccess: () => router.push(`/estoque/${pc.id}`) });

  const pcCost = pc.unitCostCents ?? 0;
  let plan: ReturnType<typeof planDisassembly> | null = null;
  let planError: string | null = null;
  try {
    plan = planDisassembly(pcCost, hasChildren && comps.length === 0 ? method : "BY_VALUE", remainder, [
      ...children.map((c) => ({ key: c.id, originalCostCents: c.unitCostCents, estimatedValueCents: c.estimatedValueCents, scrap: c.outcome === "SCRAP" })),
      ...comps.map((c) => ({ key: c.key, originalCostCents: null, estimatedValueCents: c.estimatedValueCents, scrap: c.outcome === "SCRAP" })),
    ]);
  } catch (e) {
    planError = (e as Error).message;
  }
  const alloc = (key: string) => plan?.rows.find((r) => r.key === key)?.allocatedCents ?? null;
  const effectiveMethod = hasChildren && comps.length === 0 ? method : "BY_VALUE";

  const submit = async () => {
    const c = await confirmDialog({
      title: `Desmontar ${pc.code}?`,
      description: `O PC sai do estoque e ${children.filter((c) => c.outcome !== "SCRAP").length + comps.filter((c) => c.outcome !== "SCRAP").length} peça(s) entram com o custo rateado.${plan?.writeOffCents ? ` Perda declarada: ${formatBRL(plan.writeOffCents)}.` : ""}`,
      confirmLabel: "Desmontar",
    });
    if (!c.ok) return;
    run((key) => ({
      idempotencyKey: key,
      itemId: pc.id,
      method: effectiveMethod,
      remainder,
      children: children.map((c) => ({ itemId: c.id, outcome: c.outcome, estimatedValueCents: c.estimatedValueCents, locationId: locationId || null })),
      newComponents: comps.map((c) => ({
        categoryId: c.categoryId,
        title: c.title,
        serial: c.serial || null,
        outcome: c.outcome,
        estimatedValueCents: c.estimatedValueCents ?? 0,
        locationId: locationId || null,
      })),
      notes: notes || null,
    }));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {hasChildren && (
          <Section title="Peças instaladas" description="Peças montadas aqui voltam com o histórico completo, incluindo a compra original." flush>
            <Table>
              <thead>
                <tr>
                  <Th>Peça</Th>
                  <Th>Destino</Th>
                  {effectiveMethod === "BY_VALUE" && <Th align="right">Valor estimado</Th>}
                  {seeCost && <Th align="right">Custo original</Th>}
                  {seeCost && <Th align="right">Custo após rateio</Th>}
                </tr>
              </thead>
              <tbody>
                {children.map((c, i) => (
                  <tr key={c.id}>
                    <Td>
                      <span className="block text-sm text-ink">{c.title}</span>
                      <span className="code text-ink-3">
                        {c.code} · {c.category}
                      </span>
                    </Td>
                    <Td>
                      <Select value={c.outcome} onChange={(e) => setChildren((s) => s.map((x, j) => (j === i ? { ...x, outcome: e.target.value as Outcome } : x)))} wrapperClassName="w-44">
                        {Object.entries(OUTCOME).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    {effectiveMethod === "BY_VALUE" && (
                      <Td align="right">
                        <MoneyInput value={c.estimatedValueCents} onChange={(v) => setChildren((s) => s.map((x, j) => (j === i ? { ...x, estimatedValueCents: v } : x)))} className="ml-auto w-36" />
                      </Td>
                    )}
                    {seeCost && (
                      <Td align="right">
                        <Money cents={c.unitCostCents} />
                      </Td>
                    )}
                    {seeCost && (
                      <Td align="right">
                        {c.outcome === "SCRAP" ? <span className="text-[0.8125rem] text-negative">perda</span> : <Money cents={alloc(c.id)} className="font-medium" />}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        )}

        {(!hasChildren || comps.length > 0) && (
          <Section title={hasChildren ? "Outras peças encontradas" : "Peças que saem do PC"} description={hasChildren ? undefined : "PC recebido pronto (catira/compra): informe as peças e quanto cada uma vale para revenda — o custo do PC é rateado por esses valores."}>
            <div className="flex flex-col gap-3">
              {comps.map((c, i) => (
                <div key={c.key} className="grid gap-3 rounded-[10px] border border-line p-3 sm:grid-cols-[1fr_1.4fr_1fr_1fr_auto] sm:items-end">
                  <Field label="Categoria">
                    <Select value={c.categoryId} onChange={(e) => setComps((s) => s.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}>
                      <option value="">Escolha…</option>
                      {categories
                        .filter((k) => k.kind !== "PC")
                        .map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Peça">
                    <Input value={c.title} placeholder="Ex.: GTX 1660 Super" onChange={(e) => setComps((s) => s.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  </Field>
                  <Field label="Valor estimado">
                    <MoneyInput value={c.estimatedValueCents} onChange={(v) => setComps((s) => s.map((x, j) => (j === i ? { ...x, estimatedValueCents: v } : x)))} />
                  </Field>
                  <Field label="Destino">
                    <Select value={c.outcome} onChange={(e) => setComps((s) => s.map((x, j) => (j === i ? { ...x, outcome: e.target.value as Outcome } : x)))}>
                      {Object.entries(OUTCOME).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
                    {seeCost && <Money cents={c.outcome === "SCRAP" ? null : alloc(c.key)} unknown={c.outcome === "SCRAP" ? "perda" : "—"} className="text-sm font-medium" />}
                    <Button size="icon-sm" variant="ghost" aria-label="Remover peça" onClick={() => setComps((s) => s.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
        <div>
          <Button variant="ghost" onClick={() => setComps((s) => [...s, { key: crypto.randomUUID(), categoryId: "", title: "", serial: "", outcome: "AVAILABLE", estimatedValueCents: null }])}>
            <Plus /> Adicionar peça
          </Button>
        </div>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <Section title="Rateio do custo">
          {hasChildren && comps.length === 0 && (
            <Field label="Método">
              <SegmentedControl
                size="sm"
                value={method}
                onChange={setMethod}
                options={[
                  { value: "ORIGINAL_COST", label: "Custo original" },
                  { value: "BY_VALUE", label: "Por valor" },
                ]}
              />
            </Field>
          )}
          {effectiveMethod === "ORIGINAL_COST" && (
            <Field label="Despesas da montagem (mão de obra, insumos)" className="mt-3">
              <SegmentedControl
                size="sm"
                value={remainder}
                onChange={setRemainder}
                options={[
                  { value: "ALLOCATE", label: "Ratear nas peças" },
                  { value: "WRITE_OFF", label: "Lançar como perda" },
                ]}
              />
            </Field>
          )}
          {seeCost && (
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-3">Custo do PC</dt>
                <dd>
                  <Money cents={pc.unitCostCents} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Vai para as peças</dt>
                <dd>
                  <Money cents={plan ? pcCost - plan.writeOffCents : null} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Perda declarada</dt>
                <dd className={plan?.writeOffCents ? "text-negative" : ""}>
                  <Money cents={plan?.writeOffCents ?? null} />
                </dd>
              </div>
            </dl>
          )}
          {planError && (
            <Callout tone="warning" icon={Info} className="mt-3">
              {planError}
            </Callout>
          )}
          {pc.costStatus === "UNKNOWN" && (
            <Callout tone="warning" className="mt-3">
              O PC tem custo desconhecido; as peças herdarão essa marcação.
            </Callout>
          )}
        </Section>
        <Section title="Para onde vão as peças">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Local das peças">
            <option value="">Mesmo local do PC</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </Select>
          <Field label="Observações" className="mt-3">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Section>
        <Button variant="primary" size="lg" loading={pending} disabled={!!planError || (comps.some((c) => !c.categoryId || c.title.trim().length < 2))} onClick={submit}>
          Desmontar e registrar peças
        </Button>
      </aside>
    </div>
  );
}
