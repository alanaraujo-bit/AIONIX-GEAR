"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, SegmentedControl } from "@/components/ui/field";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";

type Label = { id: string; code: string; title: string; serial: string | null; priceCents: number | null; location: string | null; qr: string };

/** Folha de etiquetas: rolo térmico 62×29 mm ou folha A4 (3 colunas). */
export function LabelSheet({ labels }: { labels: Label[] }) {
  const [format, setFormat] = React.useState<"roll" | "a4">("a4");
  const [showPrice, setShowPrice] = React.useState(false);
  const [showSerial, setShowSerial] = React.useState(true);
  return (
    <>
      <div className="no-print surface mb-5 flex flex-wrap items-center gap-4 p-4">
        <SegmentedControl
          value={format}
          onChange={setFormat}
          options={[
            { value: "a4", label: "Folha A4" },
            { value: "roll", label: "Rolo 62×29 mm" },
          ]}
        />
        <Checkbox label="Mostrar preço" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
        <Checkbox label="Mostrar nº de série" checked={showSerial} onChange={(e) => setShowSerial(e.target.checked)} />
        <span className="text-sm text-ink-3">{labels.length} etiqueta(s)</span>
        <Button variant="primary" className="ml-auto" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
      </div>
      <style>{`
        @media print {
          @page { size: ${format === "roll" ? "62mm 29mm" : "A4"}; margin: ${format === "roll" ? "0" : "8mm"}; }
          header, nav, aside, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .lg\\:pl-\\[244px\\], .lg\\:pl-\\[68px\\] { padding-left: 0 !important; }
        }
      `}</style>
      <div className={cn("bg-white text-black", format === "a4" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-[3mm]" : "flex flex-col items-start gap-2 print:gap-0")}>
        {labels.map((l) => (
          <div
            key={l.id}
            className={cn(
              "flex items-center gap-[2.5mm] overflow-hidden border border-dashed border-neutral-300 bg-white p-[2mm] print:border-neutral-200",
              format === "roll" ? "h-[29mm] w-[62mm] print:break-after-page print:border-0" : "h-[29mm]",
            )}
          >
            <div className="size-[23mm] shrink-0 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: l.qr }} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-mono text-[11pt] font-semibold tracking-tight">{l.code}</p>
              <p className="line-clamp-2 text-[7.5pt]">{l.title}</p>
              {showSerial && l.serial && <p className="truncate font-mono text-[6.5pt]">S/N {l.serial}</p>}
              {showPrice && l.priceCents ? <p className="mt-0.5 text-[9pt] font-semibold">{formatBRL(l.priceCents)}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
