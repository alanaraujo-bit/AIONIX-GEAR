import { getSession } from "@/server/session";
import { readAttachment } from "@/server/storage";
import type { Ctx } from "@/server/context";

/** Entrega um anexo apenas para membros autenticados da empresa dona do arquivo. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.org || !session.role) return new Response("Não autorizado", { status: 401 });
  const { id } = await params;
  const ctx: Ctx = { orgId: session.org.id, userId: session.user.id, role: session.role };
  const file = await readAttachment(ctx, id);
  if (!file) return new Response("Não encontrado", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
