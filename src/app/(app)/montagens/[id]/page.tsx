import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { getBuildDetail } from "@/server/queries/builds";
import { pickableItems } from "@/server/queries/items";
import { accountOptions, contactOptions, locationOptions } from "@/server/queries/common";
import { PageHeader, Callout } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { BUILD_STATUS_LABEL, BUILD_STATUS_TONE } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";
import { BuildWorkspace } from "./workspace";

export const metadata: Metadata = { title: "Montagem" };

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("builds.manage");
  const { id } = await params;
  const d = await getBuildDetail(app.ctx, id);
  if (!d) notFound();
  const open = ["PLANNING", "ASSEMBLING", "TESTING"].includes(d.build.status);
  const [items, accounts, contacts, locations] = await Promise.all([
    open ? pickableItems(app.ctx, "build", { contactId: d.build.contactId }) : Promise.resolve([]),
    accountOptions(app.ctx),
    contactOptions(app.ctx),
    locationOptions(app.ctx),
  ]);
  return (
    <>
      <PageHeader
        back={{ href: "/montagens", label: "Montagens" }}
        title={d.build.name}
        meta={
          <>
            <span className="code text-ink-3">{d.build.code}</span>
            <Badge tone={BUILD_STATUS_TONE[d.build.status]}>{BUILD_STATUS_LABEL[d.build.status]}</Badge>
            <span className="text-[0.8125rem] text-ink-3">{d.build.purpose === "CUSTOMER_ORDER" ? `Encomenda de ${d.contact?.name ?? "cliente"}` : "Para venda"}</span>
          </>
        }
      />
      {d.build.status === "COMPLETED" && d.result && (
        <Callout tone="positive" className="mb-5" action={<Link href={`/estoque/${d.result.id}`} className="text-sm font-medium">Abrir o PC</Link>}>
          Concluída em {formatDateTime(d.build.completedAt, app.tz)}. O PC <span className="code">{d.result.code}</span> está no estoque; as peças ficam registradas como instaladas nele.
        </Callout>
      )}
      {d.build.status === "CANCELLED" && (
        <Callout tone="neutral" className="mb-5">
          Cancelada: {d.build.cancelReason}. As peças foram liberadas.
        </Callout>
      )}
      <BuildWorkspace
        d={JSON.parse(JSON.stringify(d))}
        items={items}
        accounts={accounts}
        contacts={contacts}
        locations={locations.map((l) => ({ id: l.id, path: l.path }))}
        seeCost={app.can("inventory.cost")}
        defaultWarrantyDays={app.settings.defaultWarrantyDays}
        tz={app.tz}
      />
    </>
  );
}
