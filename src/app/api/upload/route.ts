import { getSession } from "@/server/session";
import { storeAttachment, MAX_UPLOAD_BYTES } from "@/server/storage";
import { DomainError } from "@/server/errors";
import type { Ctx } from "@/server/context";

/**
 * Upload de anexos (fotos já comprimidas no navegador). Exige sessão, mesma origem e
 * tamanho máximo; o tipo real do arquivo é verificado pelos bytes no servidor.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ error: "Origem não permitida." }, { status: 403 });
  const session = await getSession();
  if (!session?.org || !session.role) return Response.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: "Arquivo grande demais (máximo 4 MB)." }, { status: 413 });
  const ctx: Ctx = { orgId: session.org.id, userId: session.user.id, role: session.role };
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    const r = await storeAttachment(ctx, {
      entityType: String(form.get("entityType") ?? ""),
      entityId: String(form.get("entityId") ?? ""),
      kind: String(form.get("kind") ?? "PHOTO"),
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      caption: (form.get("caption") as string) || null,
    });
    return Response.json(r);
  } catch (err) {
    if (err instanceof DomainError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[upload]", err);
    return Response.json({ error: "Falha ao salvar o arquivo. Tente novamente." }, { status: 500 });
  }
}
