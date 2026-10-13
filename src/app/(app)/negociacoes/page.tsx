import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireApp } from "@/server/session";
import { prisma } from "@/server/db";
import { contactOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { toDateInput, todayInput } from "@/lib/dates";
import { Pipeline } from "./pipeline";

export const metadata: Metadata = { title: "Negociações" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const app = await requireApp();
  if (!(app.can("sales.manage") || app.can("trades.manage") || app.can("purchases.manage"))) redirect("/sem-permissao");
  const sp = await searchParams;
  const since = new Date(Date.now() - 45 * 86_400_000);
  const [opps, contacts, items] = await Promise.all([
    prisma.opportunity.findMany({
      where: { orgId: app.ctx.orgId, OR: [{ stage: { notIn: ["WON", "LOST"] } }, { closedAt: { gte: since } }] },
      orderBy: [{ nextActionAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    }),
    contactOptions(app.ctx),
    prisma.item.findMany({ where: { orgId: app.ctx.orgId, status: { in: ["AVAILABLE", "RESERVED", "IN_NEGOTIATION", "INSPECTION"] } }, select: { id: true, code: true, title: true }, orderBy: { title: "asc" }, take: 1000 }),
  ]);
  const cmap = new Map(contacts.map((c) => [c.id, c]));
  return (
    <>
      <PageHeader title="Negociações" description="Interessados, ofertas e propostas em andamento — com a próxima ação e a data para não deixar ninguém esfriar." />
      <Pipeline
        today={todayInput(app.tz)}
        openId={sp.abrir ?? null}
        contacts={contacts}
        items={items}
        canSell={app.can("sales.manage")}
        canTrade={app.can("trades.manage")}
        opps={opps.map((o) => ({
          id: o.id,
          title: o.title,
          type: o.type,
          stage: o.stage,
          contactId: o.contactId,
          contactName: o.contactId ? cmap.get(o.contactId)?.name ?? null : null,
          whatsapp: o.contactId ? cmap.get(o.contactId)?.whatsapp ?? null : null,
          valueCents: o.valueCents,
          itemIds: o.itemIds,
          source: o.source,
          nextAction: o.nextAction,
          nextActionAt: o.nextActionAt ? toDateInput(o.nextActionAt, app.tz) : null,
          notes: o.notes,
          lostReason: o.lostReason,
          linkType: o.linkType,
          linkId: o.linkId,
        }))}
      />
    </>
  );
}
