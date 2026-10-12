import { prisma } from "../db";
import { hasPerm, type Ctx } from "../context";
import { STATUS_LABEL } from "./shared";

export type SearchHit = { type: string; id: string; title: string; subtitle: string; href: string };

/**
 * Busca universal: itens (código, série, nome), contatos, vendas, compras, catiras,
 * montagens e anotações. Sempre restrita à empresa e às permissões do usuário.
 */
export async function searchAll(ctx: Ctx, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\D/g, "");
  const hits: SearchHit[] = [];
  const tasks: Promise<void>[] = [];

  if (hasPerm(ctx, "inventory.view")) {
    tasks.push(
      prisma.item
        .findMany({
          where: { orgId: ctx.orgId, status: { not: "VOID" }, OR: [{ code: like }, { serial: like }, { title: like }, { notes: like }, { tags: { has: q.toLowerCase() } }] },
          orderBy: [{ updatedAt: "desc" }],
          take: 8,
          select: { id: true, code: true, title: true, status: true, serial: true },
        })
        .then((rows) =>
          rows.forEach((r) =>
            hits.push({ type: "Item", id: r.id, title: r.title, subtitle: `${r.code}${r.serial ? ` · S/N ${r.serial}` : ""} · ${STATUS_LABEL[r.status]}`, href: `/estoque/${r.id}` }),
          ),
        ),
    );
  }
  if (hasPerm(ctx, "contacts.manage") || hasPerm(ctx, "purchases.manage") || hasPerm(ctx, "trades.manage")) {
    tasks.push(
      prisma.contact
        .findMany({
          where: {
            orgId: ctx.orgId,
            anonymizedAt: null,
            OR: [{ name: like }, { email: like }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { whatsapp: { contains: digits } }, { document: { contains: digits } }] : [])],
          },
          take: 5,
          select: { id: true, name: true, city: true, whatsapp: true, phone: true },
        })
        .then((rows) =>
          rows.forEach((r) => hits.push({ type: "Contato", id: r.id, title: r.name, subtitle: [r.city, r.whatsapp ?? r.phone].filter(Boolean).join(" · ") || "Contato", href: `/contatos/${r.id}` })),
        ),
    );
  }
  if (hasPerm(ctx, "sales.manage")) {
    tasks.push(
      prisma.sale
        .findMany({
          where: { orgId: ctx.orgId, OR: [{ code: like }, { notes: like }, { lines: { some: { description: like } } }] },
          orderBy: { date: "desc" },
          take: 5,
          select: { id: true, code: true, status: true, totalCents: true, lines: { select: { description: true }, take: 1 } },
        })
        .then((rows) =>
          rows.forEach((r) =>
            hits.push({
              type: r.status === "QUOTE" ? "Orçamento" : "Venda",
              id: r.id,
              title: `${r.code} — ${r.lines[0]?.description ?? ""}`,
              subtitle: `${(r.totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${r.status === "CANCELLED" ? " · cancelada" : ""}`,
              href: `/vendas/${r.id}`,
            }),
          ),
        ),
    );
  }
  if (hasPerm(ctx, "purchases.manage")) {
    tasks.push(
      prisma.purchase
        .findMany({
          where: { orgId: ctx.orgId, OR: [{ code: like }, { notes: like }, { lines: { some: { description: like } } }] },
          orderBy: { date: "desc" },
          take: 5,
          select: { id: true, code: true, totalCents: true, lines: { select: { description: true }, take: 1 } },
        })
        .then((rows) =>
          rows.forEach((r) =>
            hits.push({ type: "Compra", id: r.id, title: `${r.code} — ${r.lines[0]?.description ?? ""}`, subtitle: (r.totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), href: `/compras/${r.id}` }),
          ),
        ),
    );
  }
  if (hasPerm(ctx, "trades.manage")) {
    tasks.push(
      prisma.trade
        .findMany({ where: { orgId: ctx.orgId, OR: [{ code: like }, { title: like }, { notes: like }] }, orderBy: { date: "desc" }, take: 5, select: { id: true, code: true, title: true, status: true } })
        .then((rows) => rows.forEach((r) => hits.push({ type: "Catira", id: r.id, title: `${r.code} — ${r.title}`, subtitle: r.status === "CONFIRMED" ? "Confirmada" : r.status === "CANCELLED" ? "Cancelada" : "Em aberto", href: `/catiras/${r.id}` }))),
    );
  }
  if (hasPerm(ctx, "builds.manage")) {
    tasks.push(
      prisma.build
        .findMany({ where: { orgId: ctx.orgId, OR: [{ code: like }, { name: like }] }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, code: true, name: true } })
        .then((rows) => rows.forEach((r) => hits.push({ type: "Montagem", id: r.id, title: `${r.code} — ${r.name}`, subtitle: "Montagem", href: `/montagens/${r.id}` }))),
    );
  }
  tasks.push(
    prisma.note
      .findMany({ where: { orgId: ctx.orgId, body: like }, orderBy: { createdAt: "desc" }, take: 4 })
      .then((rows) =>
        rows.forEach((r) => {
          const href =
            r.entityType === "Item" ? `/estoque/${r.entityId}` : r.entityType === "Contact" ? `/contatos/${r.entityId}` : r.entityType === "Sale" ? `/vendas/${r.entityId}` : r.entityType === "Trade" ? `/catiras/${r.entityId}` : null;
          if (href) hits.push({ type: "Anotação", id: r.id, title: r.body.slice(0, 80), subtitle: "Anotação", href });
        }),
      ),
  );
  await Promise.all(tasks);
  // Correspondência exata de código/série primeiro.
  const exact = q.toUpperCase();
  return hits.sort((a, b) => Number(b.subtitle.toUpperCase().startsWith(exact) || b.subtitle.includes(`S/N ${exact}`)) - Number(a.subtitle.toUpperCase().startsWith(exact) || a.subtitle.includes(`S/N ${exact}`)));
}
