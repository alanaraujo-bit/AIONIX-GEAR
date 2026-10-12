import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { locationOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { CountWorkspace } from "./count-workspace";

export const metadata: Metadata = { title: "Contagem" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("inventory.adjust");
  const { id } = await params;
  const count = await prisma.stockCount.findFirst({ where: { id, orgId: app.ctx.orgId }, include: { lines: { orderBy: { updatedAt: "desc" } } } });
  if (!count) notFound();
  const [locations, items] = await Promise.all([
    locationOptions(app.ctx, true),
    prisma.item.findMany({ where: { orgId: app.ctx.orgId, id: { in: count.lines.map((l) => l.itemId!).filter(Boolean) } }, select: { id: true, code: true, title: true, serial: true, tracking: true, unitCostCents: true, status: true } }),
  ]);
  const locPath = new Map(locations.map((l) => [l.id, l.path]));
  const lines = count.lines.map((l) => {
    const it = items.find((i) => i.id === l.itemId);
    return {
      id: l.id,
      itemId: l.itemId,
      code: it?.code ?? l.scannedCode ?? "",
      title: it?.title ?? "Item desconhecido",
      serial: it?.serial ?? null,
      tracking: it?.tracking ?? "UNIT",
      expectedQty: l.expectedQty,
      countedQty: l.countedQty,
      result: l.result,
      resolution: l.resolution,
      resolutionNote: l.resolutionNote,
      expectedLocation: l.expectedLocationId ? locPath.get(l.expectedLocationId) ?? "—" : "sem local",
      foundLocation: l.foundLocationId ? locPath.get(l.foundLocationId) ?? "—" : null,
      foundLocationId: l.foundLocationId,
    };
  });
  return (
    <>
      <PageHeader
        title={count.name}
        back={{ href: "/estoque/inventarios", label: "Inventário" }}
        meta={
          <>
            <span className="code text-ink-3">{count.code}</span>
            <Badge tone={count.status === "OPEN" ? "info" : count.status === "CLOSED" ? "positive" : "muted"}>{count.status === "OPEN" ? "Em andamento" : count.status === "CLOSED" ? "Encerrada" : "Cancelada"}</Badge>
            <span className="text-[0.8125rem] text-ink-3">
              {count.locationId ? locPath.get(count.locationId) : "Todos os locais"} · iniciada em {formatDateTime(count.startedAt, app.tz)}
            </span>
          </>
        }
      />
      <CountWorkspace countId={count.id} open={count.status === "OPEN"} scopeLocationId={count.locationId} lines={lines} locations={locations.filter((l) => !l.archived).map((l) => ({ id: l.id, path: l.path }))} />
    </>
  );
}
