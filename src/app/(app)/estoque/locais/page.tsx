import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { locationOptions } from "@/server/queries/common";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/layout";
import { LocationsManager } from "./locations-manager";

export const metadata: Metadata = { title: "Locais" };

export default async function LocationsPage() {
  const app = await requirePage("inventory.view");
  const [locs, counts] = await Promise.all([
    locationOptions(app.ctx, true),
    prisma.item.groupBy({
      by: ["locationId"],
      where: { orgId: app.ctx.orgId, status: { in: ["AVAILABLE", "RESERVED", "INSPECTION", "DEFECTIVE", "IN_BUILD", "IN_NEGOTIATION", "SOLD", "RETURNED"] } },
      _count: { _all: true },
      _sum: { qtyOnHand: true },
    }),
  ]);
  const raw = await prisma.location.findMany({ where: { orgId: app.ctx.orgId }, select: { id: true, code: true, description: true } });
  const nodes = locs.map((l) => {
    const r = raw.find((x) => x.id === l.id);
    const c = counts.find((x) => x.locationId === l.id);
    return { ...l, code: r?.code ?? null, description: r?.description ?? null, items: c?._count._all ?? 0, units: c?._sum.qtyOnHand ?? 0 };
  });
  const noLocation = counts.find((c) => c.locationId === null)?._count._all ?? 0;
  return (
    <>
      <PageHeader
        title="Locais"
        description="Organize do jeito que o espaço é: cômodo › prateleira › caixa. Cada movimentação entre locais fica no histórico do item."
        back={{ href: "/estoque", label: "Estoque" }}
      />
      <LocationsManager nodes={nodes} noLocation={noLocation} canEdit={app.can("inventory.edit")} />
    </>
  );
}
