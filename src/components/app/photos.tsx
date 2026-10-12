"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, ImagePlus, Loader2, Star, Trash2, X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteAttachmentAction, setCoverAction } from "@/app/(app)/attachment-actions";

/** Reduz a foto no próprio aparelho (máx. 1600px, WEBP/JPEG) antes de enviar. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const type = canvas.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), type, 0.82));
  } catch {
    return file;
  }
}

export async function uploadFile(file: File, entityType: string, entityId: string, kind = "PHOTO") {
  const isImage = file.type.startsWith("image/");
  const body = isImage ? await compressImage(file) : file;
  const name = isImage ? file.name.replace(/\.[^.]+$/, "") + (body.type === "image/webp" ? ".webp" : ".jpg") : file.name;
  const fd = new FormData();
  fd.append("file", new File([body], name, { type: body.type || file.type }));
  fd.append("entityType", entityType);
  fd.append("entityId", entityId);
  fd.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Falha no envio.");
  return json;
}

export type GalleryItem = { id: string; fileName: string; contentType: string; kind: string; isCover: boolean };

export function Gallery({ entityType, entityId, items, canEdit, compact }: { entityType: string; entityId: string; items: GalleryItem[]; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(0);
  const [view, setView] = React.useState<number | null>(null);
  const photos = items.filter((i) => i.contentType.startsWith("image/"));
  const docs = items.filter((i) => !i.contentType.startsWith("image/"));
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!navigator.onLine) {
      toast.error("Sem conexão: as fotos não foram enviadas.");
      return;
    }
    setBusy(files.length);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadFile(f, entityType, entityId, f.type === "application/pdf" ? "DOCUMENT" : "PHOTO");
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
      setBusy((b) => b - 1);
    }
    if (ok) toast.success(ok === 1 ? "Arquivo enviado" : `${ok} arquivos enviados`);
    router.refresh();
  };

  return (
    <div>
      {photos.length > 0 ? (
        <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-4")}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setView(i)}
              className={cn("group relative aspect-square overflow-hidden rounded-[8px] border border-line bg-surface-2", i === 0 && !compact && "col-span-2 row-span-2")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p.id}`} alt={p.fileName} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              {p.isCover && photos.length > 1 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[0.6875rem] font-medium text-white">Capa</span>
              )}
            </button>
          ))}
          {canEdit && (
            <button
              onClick={() => cameraRef.current?.click()}
              className="grid aspect-square place-items-center rounded-[8px] border border-dashed border-line-strong text-ink-3 transition-colors hover:border-accent hover:text-accent-text"
              aria-label="Adicionar foto"
            >
              {busy > 0 ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-[10px] border border-dashed border-line-strong px-4 py-8 text-center">
          <Camera className="mb-2 size-6 text-ink-3" />
          <p className="text-sm text-ink-2">Sem fotos ainda</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink-3">Fotos ajudam a vender e a provar o estado do item.</p>
          {canEdit && (
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => cameraRef.current?.click()} loading={busy > 0}>
                <Camera /> Tirar foto
              </Button>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus /> Escolher arquivos
              </Button>
            </div>
          )}
        </div>
      )}
      {canEdit && photos.length > 0 && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> Adicionar fotos ou PDF
          </Button>
        </div>
      )}
      {docs.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-[8px] border border-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
              <FileText className="size-4 text-ink-3" />
              <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink">
                {d.fileName}
              </a>
              <a href={`/api/files/${d.id}?download=1`} className="text-ink-3 hover:text-ink" aria-label="Baixar">
                <Download className="size-4" />
              </a>
              {canEdit && <DeleteAttachment id={d.id} />}
            </li>
          ))}
        </ul>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
      {view !== null && photos[view] && <Lightbox photos={photos} index={view} onIndex={setView} onClose={() => setView(null)} canEdit={canEdit} />}
    </div>
  );
}

function DeleteAttachment({ id, onDone }: { id: string; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      className="text-ink-3 hover:text-negative"
      aria-label="Remover anexo"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const c = await confirmDialog({ title: "Remover este anexo?", description: "O arquivo será apagado. O registro de que ele existiu fica no histórico.", confirmLabel: "Remover", tone: "danger" });
          if (!c.ok) return;
          const r = await deleteAttachmentAction(id);
          if (r.ok) {
            toast.success("Anexo removido");
            onDone?.();
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}

function Lightbox({ photos, index, onIndex, onClose, canEdit }: { photos: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; canEdit: boolean }) {
  const router = useRouter();
  const p = photos[index];
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, photos.length, onClose, onIndex]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 animate-[ag-fade-in_150ms_ease-out]" role="dialog" aria-modal aria-label="Foto">
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <span className="text-sm text-white/70">
          {index + 1} de {photos.length}
        </span>
        <div className="flex items-center gap-1">
          {canEdit && !p.isCover && (
            <button
              className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-white/10"
              onClick={async () => {
                const r = await setCoverAction(p.id);
                if (r.ok) {
                  toast.success("Definida como capa");
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              <Star className="size-4" /> Usar como capa
            </button>
          )}
          {canEdit && (
            <span className="grid size-9 place-items-center rounded-md hover:bg-white/10 [&_button]:text-white">
              <DeleteAttachment id={p.id} onDone={onClose} />
            </span>
          )}
          <button className="grid size-9 place-items-center rounded-md hover:bg-white/10" onClick={onClose} aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/files/${p.id}`} alt={p.fileName} className="max-h-full max-w-full rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
        {photos.length > 1 && (
          <>
            <button className="absolute left-3 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), onIndex((index - 1 + photos.length) % photos.length))} aria-label="Anterior">
              <ChevronLeft className="size-5" />
            </button>
            <button className="absolute right-3 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), onIndex((index + 1) % photos.length))} aria-label="Próxima">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
