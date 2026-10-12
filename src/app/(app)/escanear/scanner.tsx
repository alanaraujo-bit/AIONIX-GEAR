"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, CameraOff, Keyboard, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, SegmentedControl } from "@/components/ui/field";
import { Section, Callout, EmptyState } from "@/components/ui/layout";
import { LocationSelect } from "@/components/app/pickers";
import { ItemStatusBadge } from "@/components/app/status";
import { lookupCodeAction } from "./actions";
import { moveItemsAction } from "../estoque/actions";

type Hit = { id: string; code: string; title: string; status: string; serial: string | null; location: string | null; locationId: string | null };

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function Scanner({ locations, canMove }: { locations: { id: string; path: string }[]; canMove: boolean }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [mode, setMode] = React.useState<"find" | "move">("find");
  const [target, setTarget] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Hit[] | null>(null);
  const [log, setLog] = React.useState<{ code: string; ok: boolean; text: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const lastRef = React.useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const stopRef = React.useRef<() => void>(() => {});

  const handle = React.useCallback(
    async (text: string) => {
      const now = Date.now();
      if (text === lastRef.current.text && now - lastRef.current.at < 2500) return;
      lastRef.current = { text, at: now };
      setBusy(true);
      const r = await lookupCodeAction(text);
      setBusy(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (navigator.vibrate) navigator.vibrate(40);
      if (mode === "move" && target) {
        if (r.data.length !== 1) {
          setLog((l) => [{ code: text, ok: false, text: r.data.length ? "Mais de um item com essa série — abra e mova manualmente." : "Código não encontrado." }, ...l]);
          return;
        }
        const it = r.data[0];
        if (it.locationId === target) {
          setLog((l) => [{ code: it.code, ok: true, text: `${it.title} já está neste local.` }, ...l]);
          return;
        }
        const m = await moveItemsAction({ itemIds: [it.id], locationId: target, reason: "Movido pelo leitor de código" });
        setLog((l) => [{ code: it.code, ok: m.ok, text: m.ok ? `${it.title} movido.` : m.error }, ...l]);
        return;
      }
      setResults(r.data);
    },
    [mode, target],
  );

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      let stopped = false;
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (BD) {
        const det = new BD({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "data_matrix"] });
        const loop = async () => {
          if (stopped) return;
          try {
            const codes = await det.detect(video);
            if (codes[0]?.rawValue) await handle(codes[0].rawValue);
          } catch {}
          setTimeout(loop, 250);
        };
        loop();
        stopRef.current = () => {
          stopped = true;
          stream.getTracks().forEach((t) => t.stop());
        };
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (res) => {
          if (res) handle(res.getText());
        });
        stopRef.current = () => {
          controls.stop();
          stream.getTracks().forEach((t) => t.stop());
        };
      }
    } catch (e) {
      const name = (e as Error).name;
      setError(
        name === "NotAllowedError"
          ? "Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador, ou digite o código abaixo."
          : name === "NotFoundError"
            ? "Nenhuma câmera encontrada neste aparelho. Digite o código abaixo."
            : "Não foi possível abrir a câmera neste navegador. Digite o código abaixo.",
      );
      setActive(false);
    }
  };
  const stop = () => {
    stopRef.current();
    setActive(false);
  };
  React.useEffect(() => () => stopRef.current(), []);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        {canMove && (
          <SegmentedControl
            value={mode}
            onChange={(v) => {
              setMode(v);
              setResults(null);
            }}
            options={[
              { value: "find", label: "Encontrar item" },
              { value: "move", label: "Mover para um local" },
            ]}
          />
        )}
        {mode === "move" && (
          <Field label="Mover tudo que eu escanear para" hint="Ótimo para organizar uma prateleira ou guardar uma remessa.">
            <LocationSelect value={target} onChange={setTarget} options={locations} emptyLabel="Escolha o local…" />
          </Field>
        )}
        <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] border border-line bg-black">
          <video ref={videoRef} className="size-full object-cover" playsInline muted />
          {!active && (
            <div className="absolute inset-0 grid place-items-center bg-panel">
              <div className="text-center">
                <Camera className="mx-auto mb-3 size-8 text-ink-3" />
                <Button variant="primary" onClick={start} disabled={mode === "move" && !target}>
                  Ligar câmera
                </Button>
                {mode === "move" && !target && <p className="mt-2 text-[0.8125rem] text-ink-3">Escolha o local de destino primeiro.</p>}
              </div>
            </div>
          )}
          {active && (
            <>
              <div className="pointer-events-none absolute inset-[18%] rounded-[14px] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              <Button size="sm" className="absolute right-3 top-3" onClick={stop}>
                <CameraOff /> Desligar
              </Button>
              {busy && <Loader2 className="absolute bottom-3 left-3 size-5 animate-spin text-white" />}
            </>
          )}
        </div>
        {error && <Callout tone="warning">{error}</Callout>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) handle(manual.trim());
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Digite GX-0001 ou o número de série" className="code pl-9" aria-label="Código ou série" />
          </div>
          <Button type="submit" disabled={mode === "move" && !target}>
            Buscar
          </Button>
        </form>
      </div>
      <aside>
        {mode === "find" ? (
          <Section title="Resultado">
            {results === null ? (
              <p className="text-sm text-ink-3">Nenhuma leitura ainda.</p>
            ) : results.length === 0 ? (
              <EmptyState title="Nada encontrado" compact>
                Este código não corresponde a nenhum item da empresa. Se for uma peça nova, cadastre-a.
                <div className="mt-3">
                  <Link href="/estoque/novo">Cadastrar item</Link>
                </div>
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {results.map((r) => (
                  <li key={r.id}>
                    <Link href={`/estoque/${r.id}`} className="group block rounded-[10px] border border-line p-3 no-underline hover:border-line-strong">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{r.title}</span>
                        <ArrowRight className="size-4 text-ink-3 group-hover:text-ink" />
                      </div>
                      <p className="code mt-0.5 text-ink-3">
                        {r.code}
                        {r.serial ? ` · S/N ${r.serial}` : ""}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <ItemStatusBadge status={r.status} />
                        <span className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-3">
                          <MapPin className="size-3.5" /> {r.location ?? "sem local"}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : (
          <Section title="Movimentações desta sessão">
            {log.length === 0 ? (
              <p className="text-sm text-ink-3">Escaneie as peças; cada uma é movida e registrada no histórico.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {log.map((l, i) => (
                  <li key={i} className={l.ok ? "text-ink" : "text-negative"}>
                    <span className="code text-ink-3">{l.code}</span> — {l.text}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </aside>
    </div>
  );
}
