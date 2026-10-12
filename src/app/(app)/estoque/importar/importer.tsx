"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { FileSpreadsheet, Upload, CircleAlert, TriangleAlert, CircleCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Section, Callout, Table, Th, Td, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Select, Checkbox } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { CONDITION_LABEL } from "@/lib/labels";
import { previewImportAction, applyImportAction } from "./actions";
import type { PreviewRow, ImportMapping } from "@/server/domain/imports";

type Fields = { key: string; label: string; required: boolean }[];

const TEMPLATE = "Nome;Categoria;Marca;Modelo;Série;Condição;Quantidade;Custo;Custo estimado;Preço;Valor de mercado;Local;Defeitos;Observações;Data de compra\nRTX 3060 12GB;Placas de vídeo;MSI;Ventus 2X;ABC123;usado;1;1500,00;não;2100,00;2000,00;Prateleira A;;Sem caixa;10/09/2026\n";

export function Importer() {
  const router = useRouter();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<ImportMapping>({});
  const [fields, setFields] = React.useState<Fields>([]);
  const [preview, setPreview] = React.useState<{ rows: PreviewRow[]; summary: { total: number; valid: number; invalid: number; withWarnings: number; unknownCost: number; units: number } } | null>(null);
  const [skipDup, setSkipDup] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "issues">("issues");
  const dropRef = React.useRef<HTMLInputElement>(null);

  const runPreview = async (h: string[], r: Record<string, string>[], m?: ImportMapping) => {
    setBusy(true);
    const res = await previewImportAction({ headers: h, rows: r, mapping: m ?? null });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMapping(res.data.mapping);
    setFields(res.data.fields);
    setPreview(res.data.preview);
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setPreview(null);
    try {
      let h: string[] = [];
      let r: Record<string, string>[] = [];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const data = (await readSheet(file)) as unknown[][];
        h = (data[0] ?? []).map((c, i) => String(c ?? `Coluna ${i + 1}`).trim());
        r = data.slice(1).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] instanceof Date ? (row[i] as Date).toISOString().slice(0, 10) : String(row[i] ?? "")])));
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (x) => x.trim() });
        h = parsed.meta.fields ?? [];
        r = parsed.data;
      }
      r = r.filter((row) => Object.values(row).some((v) => String(v).trim() !== ""));
      if (!r.length) {
        toast.error("Não encontramos linhas com dados nesta planilha.");
        return;
      }
      setHeaders(h);
      setRows(r);
      await runPreview(h, r);
    } catch {
      toast.error("Não foi possível ler o arquivo. Salve como .xlsx ou .csv e tente novamente.");
    }
  };

  const shown = preview ? (filter === "issues" ? preview.rows.filter((r) => !r.ok || r.warnings.length) : preview.rows) : [];

  return (
    <div className="flex flex-col gap-5">
      <Section>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <button
            onClick={() => dropRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className="flex w-full flex-1 items-center gap-4 rounded-[10px] border border-dashed border-line-strong p-5 text-left transition-colors hover:border-accent"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
              {fileName ? <FileSpreadsheet className="size-5" /> : <Upload className="size-5" />}
            </span>
            <span>
              <span className="block font-medium text-ink">{fileName ?? "Escolher planilha (.xlsx ou .csv)"}</span>
              <span className="block text-[0.8125rem] text-ink-3">{fileName ? `${rows.length} linhas lidas — clique para trocar` : "Ou arraste o arquivo para cá. Até 2.000 linhas por vez."}</span>
            </span>
          </button>
          <Button variant="ghost" asChild>
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + TEMPLATE)}`} download="modelo-estoque-aionix.csv">
              <Download /> Baixar modelo
            </a>
          </Button>
          <input ref={dropRef} type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
      </Section>

      {preview && (
        <>
          <Section title="Colunas" description="Conferimos os nomes das colunas automaticamente. Ajuste se algo estiver trocado.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {fields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-[0.8125rem] text-ink-2">
                  <span>
                    {f.label}
                    {f.required && <span className="text-negative"> *</span>}
                  </span>
                  <Select
                    value={mapping[f.key as keyof ImportMapping] ?? ""}
                    onChange={(e) => {
                      const m = { ...mapping, [f.key]: e.target.value || undefined };
                      setMapping(m);
                      runPreview(headers, rows, m);
                    }}
                    className="h-9 text-sm"
                  >
                    <option value="">— não usar</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Prévia"
            actions={
              <div className="flex gap-1">
                <Button size="sm" variant={filter === "issues" ? "secondary" : "ghost"} onClick={() => setFilter("issues")}>
                  Com avisos
                </Button>
                <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>
                  Todas
                </Button>
              </div>
            }
            flush
          >
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line px-4 py-3 text-sm sm:px-5">
              <span>
                <CircleCheck className="mr-1 inline size-4 text-positive" />
                <span className="num font-medium">{preview.summary.valid}</span> linhas válidas ({preview.summary.units} unidades)
              </span>
              <span>
                <TriangleAlert className="mr-1 inline size-4 text-warning-text" />
                <span className="num font-medium">{preview.summary.withWarnings}</span> com avisos
              </span>
              <span>
                <CircleAlert className="mr-1 inline size-4 text-negative" />
                <span className="num font-medium">{preview.summary.invalid}</span> com erro (serão ignoradas)
              </span>
              {preview.summary.unknownCost > 0 && (
                <span className="text-ink-3">
                  <span className="num font-medium text-ink">{preview.summary.unknownCost}</span> sem custo → entram como custo desconhecido
                </span>
              )}
            </div>
            <div className="max-h-[480px] overflow-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Linha</Th>
                    <Th>Item</Th>
                    <Th>Categoria</Th>
                    <Th align="right">Qtd.</Th>
                    <Th align="right">Custo</Th>
                    <Th align="right">Preço</Th>
                    <Th>Observações da validação</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.row} className={cn(!r.ok && "bg-negative-soft/40")}>
                      <Td className="num text-ink-3">{r.row}</Td>
                      <Td>
                        <span className="text-sm">{r.data.title || <em className="text-ink-3">sem nome</em>}</span>
                        {r.data.serial && <span className="code block text-ink-3">S/N {r.data.serial}</span>}
                        <span className="block text-[0.75rem] text-ink-3">{CONDITION_LABEL[r.data.condition]}</span>
                      </Td>
                      <Td className="text-sm text-ink-2">{r.data.categoryName}</Td>
                      <Td align="right" className="num">
                        {r.data.quantity}
                      </Td>
                      <Td align="right">{r.data.costMode === "UNKNOWN" ? <Badge tone="warning">Desconhecido</Badge> : <Money cents={r.data.costCents} />}</Td>
                      <Td align="right">
                        <Money cents={r.data.priceCents} />
                      </Td>
                      <Td className="max-w-[340px] text-[0.8125rem]">
                        {r.errors.map((e, i) => (
                          <p key={i} className="text-negative">
                            {e}
                          </p>
                        ))}
                        {r.warnings.map((w, i) => (
                          <p key={i} className="text-warning-text">
                            {w}
                          </p>
                        ))}
                        {r.ok && !r.warnings.length && <span className="text-ink-3">OK</span>}
                      </Td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <Td colSpan={7} className="py-8 text-center text-ink-3">
                        Nenhuma linha com avisos. Tudo pronto para importar.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Section>

          <Section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2">
                <Checkbox checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} label="Pular linhas que parecem duplicadas" description="Mesmo número de série de um item já cadastrado." />
                <Callout tone="neutral" className="max-w-xl">
                  A importação não mexe no caixa nem no resultado: ela registra o estoque que você já tinha. Você poderá desfazê-la enquanto nenhum item for usado.
                </Callout>
              </div>
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                disabled={preview.summary.valid === 0}
                onClick={async () => {
                  setBusy(true);
                  const r = await applyImportAction({ fileName: fileName ?? "planilha", rows, mapping, skipDuplicates: skipDup });
                  setBusy(false);
                  if (r.ok) {
                    toast.success(`${r.data.created} item(ns) importado(s)${r.data.skipped ? ` · ${r.data.skipped} linha(s) ignorada(s)` : ""}`);
                    router.push("/estoque?sort=recent");
                  } else toast.error(r.error);
                }}
              >
                Importar {preview.summary.valid} linha(s)
              </Button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
