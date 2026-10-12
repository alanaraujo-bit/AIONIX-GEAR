import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";

/** Destino do QR da etiqueta: abre a ficha do item na empresa ativa. */
export default async function QrResolve({ params }: { params: Promise<{ code: string }> }) {
  const app = await requirePage("inventory.view");
  const { code } = await params;
  const item = await prisma.item.findFirst({ where: { orgId: app.ctx.orgId, code: decodeURIComponent(code).toUpperCase() }, select: { id: true } });
  if (!item) notFound();
  redirect(`/estoque/${item.id}`);
}
