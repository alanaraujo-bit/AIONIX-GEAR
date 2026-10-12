"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine, Check, X, CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Section, Table, Th, Td, Callout } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/dialog";
import { LocationSelect } from "@/components/app/pickers";
import { useAction } from "@/components/ui/use-action";
import { confirmDialog } from "@/components/ui/confirm";
import { scanCountAction, setCountLineAction, closeCountAction, cancelCountAction } from "../actions";

type Line = {
  id: string;
  itemId: string | null;
  code: string;
  title: string;
  serial: string | null;
  tracking: string;
  expectedQty: number;
  countedQty: number | null;
  result: string;
  resolution: string | null;
  resolutionNote: string | null;
  expectedLocation: string;
  foundLocation: string | null;
  foundLocationId: string | null;
};

const RESULT: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "A conferir", tone: "neutral" },
  FOUND: { label: "Encontrado", tone: "positive" },
  MISSING: { label: "Não encontrado", tone: "negative" },
  WRONG_LOCATION: { label: "Lugar errado", tone: "warning" },
  QTY_DIFF: { label: "Quantidade diferente", tone: "warning" },
  UNEXPECTED: { label: "Inesperado", tone: "info" },
};

export function CountWorkspace({ countId, open, scopeLocationId, lines, locations }: { countId: string; open: boolean; scopeLocationId: string | null; lines: Line[]; locations: { id: string; path: string }[] }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [found, setFound] = React.useState<string | null>(scopeLocationId);
  const [closing, setClosing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [scanning, startScan] = React.useTransition();
  const done = lines.filter((l) => l.result !== "PENDING").length;
  const issues = lines.filter((l) => ["MISSING", "WRONG_LOCATION", "QTY_DIFF", "UNEXPECTED"].includes(l.result));

  const scan = () => {
    const c = code.trim();
    if (!c) return;
    startScan(async () => {
      const r = await scanCountAction({ countId, code: c, foundLocationId: found });
      if (!r.ok) toast.error(r.error);
      else if (r.data.result === "NOT_FOUND") toast.error(r.data.message);
      else {
        const res = RESULT[r.data.result];
        (r.data.result === "FOUND" ? toast.success : toast.warning)(`${r.data.code} — ${res?.label ?? r.data.result}`);
        router.refresh();
      }
      setCode("");
      inputRef.current?.focus();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {open && (
        <Section>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Onde você está contando agora">
              <LocationSelect value={found} onChange={setFound} options={locations} emptyLabel="Sem local" />
            </Field>
            <Field label="Código, QR ou série" hint="Use um leitor USB/Bluetooth, ou digite.">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                <Input
                  ref={inputRef}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      scan();
                    }
                  }}
                  className="code pl-9"
                  placeholder="GX-0001"
                />
              </div>
            </Field>
            <Button onClick={scan} loading={scanning} variant="primary">
              Registrar
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-ink-3">
              Conferidos <span className="num font-medium text-ink">{done}</span> de <span className="num font-medium text-ink">{lines.length}</span>
            </span>
            <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }} />
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const c = await confirmDialog({ title: "Cancelar esta contagem?", description: "Nada será ajustado. A contagem fica registrada como cancelada.", confirmLabel: "Cancelar contagem", tone: "danger" });
                if (!c.ok) return;
                const r = await cancelCountAction(countId);
                if (r.ok) router.refresh();
                else toast.error(r.error);
              }}
            >
              Cancelar contagem
            </Button>
            <Button size="sm" onClick={() => setClosing(true)}>
              Encerrar e revisar
            </Button>
          </div>
        </Section>
      )}

      <Section title="Itens" flush>
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Esperado em</Th>
              <Th>Resultado</Th>
              <Th align="right">Qtd.</Th>
              {open && <Th align="right">Marcar</Th>}
              {!open && <Th>Resolução</Th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={cn(l.result === "PENDING" && "opacity-80")}>
                <Td>
                  {l.itemId ? (
                    <Link href={`/estoque/${l.itemId}`} className="text-sm text-ink no-underline hover:text-accent-text">
                      {l.title}
                    </Link>
                  ) : (
                    <span className="text-sm">{l.title}</span>
                  )}
                  <span className="code block text-ink-3">
                    {l.code}
                    {l.serial ? ` · S/N ${l.serial}` : ""}
                  </span>
                </Td>
                <Td className="text-[0.8125rem] text-ink-2">
                  {l.expectedLocation}
                  {l.foundLocation && l.result === "WRONG_LOCATION" && <span className="block text-warning-text">achado em: {l.foundLocation}</span>}
                </Td>
                <Td>
                  <Badge tone={RESULT[l.result]?.tone ?? "neutral"}>{RESULT[l.result]?.label ?? l.result}</Badge>
                </Td>
                <Td align="right" className="num text-sm">
                  {l.tracking === "LOT" ? `${l.countedQty ?? "—"} / ${l.expectedQty}` : ""}
                </Td>
                {open && (
                  <Td align="right">
                    <LineButtons line={l} scope={found} />
                  </Td>
                )}
                {!open && (
                  <Td className="text-[0.8125rem] text-ink-2">
                    {l.resolution ? { MOVE: "Movido para o local encontrado", ADJUST: "Quantidade ajustada", DISPOSE: "Baixado", KEEP: "Mantido para investigação", IGNORE: "Ignorado" }[l.resolution] : "—"}
                    {l.resolutionNote && <span className="block text-ink-3">{l.resolutionNote}</span>}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <CloseSheet open={closing} onClose={() => setClosing(false)} countId={countId} lines={lines} issues={issues} />
    </div>
  );
}

function LineButtons({ line, scope }: { line: Line; scope: string | null }) {
  const [qty, setQty] = React.useState(String(line.countedQty ?? line.expectedQty));
  const { run, pending } = useAction(setCountLineAction);
  if (line.tracking === "LOT") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className="h-8 w-16 text-right text-sm" aria-label="Quantidade contada" />
        <Button size="sm" loading={pending} onClick={() => run({ lineId: line.id, countedQty: Number(qty), foundLocationId: scope ?? undefined })}>
          OK
        </Button>
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon-sm" variant="ghost" title="Encontrado aqui" aria-label="Encontrado" disabled={pending} onClick={() => run({ lineId: line.id, countedQty: 1, foundLocationId: scope ?? undefined })}>
        <Check className="text-positive" />
      </Button>
      <Button size="icon-sm" variant="ghost" title="Não encontrado" aria-label="Não encontrado" disabled={pending} onClick={() => run({ lineId: line.id, countedQty: 0 })}>
        <X className="text-negative" />
      </Button>
      <Button size="icon-sm" variant="ghost" title="Voltar para 'a conferir'" aria-label="Desmarcar" disabled={pending} onClick={() => run({ lineId: line.id, countedQty: null })}>
        <CircleHelp />
      </Button>
    </div>
  );
}

function CloseSheet({ open, onClose, countId, lines, issues }: { open: boolean; onClose: () => void; countId: string; lines: Line[]; issues: Line[] }) {
  const router = useRouter();
  const pending = lines.filter((l) => l.result === "PENDING");
  const all = [...issues, ...pending];
  const [res, setRes] = React.useState<Record<string, { action: string; note: string }>>({});
  React.useEffect(() => {
    if (open) {
      setRes(
        Object.fromEntries(
          all.map((l) => [
            l.id,
            {
              action: l.result === "WRONG_LOCATION" || l.result === "UNEXPECTED" ? "MOVE" : l.result === "QTY_DIFF" ? "ADJUST" : "KEEP",
              note: "",
            },
          ]),
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const { run, pending: busy } = useAction(closeCountAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const invalid = all.some((l) => res[l.id]?.action === "DISPOSE" && (res[l.id]?.note ?? "").trim().length < 3);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title="Encerrar contagem"
      description="Decida o que fazer com cada divergência. Itens ainda 'a conferir' serão considerados não encontrados."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="primary" loading={busy} disabled={invalid} onClick={() => run({ countId, resolutions: all.map((l) => ({ lineId: l.id, action: res[l.id]?.action as never, note: res[l.id]?.note || null })) })}>
            Aplicar e encerrar
          </Button>
        </>
      }
    >
      {all.length === 0 ? (
        <Callout tone="positive">Nenhuma divergência: o sistema bate com o que está no local.</Callout>
      ) : (
        <ul className="flex flex-col gap-3">
          {all.map((l) => {
            const options =
              l.result === "WRONG_LOCATION" || l.result === "UNEXPECTED"
                ? [
                    ["MOVE", "Corrigir o local no sistema"],
                    ["IGNORE", "Ignorar"],
                  ]
                : l.result === "QTY_DIFF"
                  ? [
                      ["ADJUST", "Ajustar quantidade"],
                      ["KEEP", "Manter e investigar"],
                    ]
                  : [
                      ["KEEP", "Manter e procurar depois"],
                      ["DISPOSE", "Dar baixa (perda)"],
                    ];
            return (
              <li key={l.id} className="rounded-[10px] border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{l.title}</p>
                    <p className="code text-ink-3">{l.code}</p>
                  </div>
                  <Badge tone={RESULT[l.result === "PENDING" ? "MISSING" : l.result].tone}>{RESULT[l.result === "PENDING" ? "MISSING" : l.result].label}</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Select value={res[l.id]?.action ?? options[0][0]} onChange={(e) => setRes((s) => ({ ...s, [l.id]: { ...s[l.id], action: e.target.value } }))}>
                    {options.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder={res[l.id]?.action === "DISPOSE" ? "Motivo (obrigatório)" : "Observação (opcional)"}
                    value={res[l.id]?.note ?? ""}
                    onChange={(e) => setRes((s) => ({ ...s, [l.id]: { ...s[l.id], note: e.target.value } }))}
                    aria-invalid={res[l.id]?.action === "DISPOSE" && (res[l.id]?.note ?? "").trim().length < 3}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
