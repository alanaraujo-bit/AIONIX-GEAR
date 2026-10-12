"use server";

import { act } from "@/server/action";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/context";

/** Resolve o texto lido (QR da etiqueta, código GX-…, ou número de série) para itens da empresa. */
export async function lookupCodeAction(raw: string) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "inventory.view");
    let text = raw.trim();
    const m = text.match(/\/i\/([^/?#\s]+)/);
    if (m) text = decodeURIComponent(m[1]);
    if (!text) return [];
    const rows = await prisma.item.findMany({
      where: {
        orgId: ctx.orgId,
        status: { not: "VOID" },
        OR: [{ code: { equals: text, mode: "insensitive" } }, { serial: { equals: text, mode: "insensitive" } }],
      },
      include: { location: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return rows.map((r) => ({ id: r.id, code: r.code, title: r.title, status: r.status, serial: r.serial, location: r.location?.name ?? null, locationId: r.locationId }));
  });
}
