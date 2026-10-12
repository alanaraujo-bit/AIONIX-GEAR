import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { getItemDetail } from "@/server/queries/items";
import { categoryOptions, locationOptions } from "@/server/queries/common";
import { PageHeader, Callout } from "@/components/ui/layout";
import { DisassemblyForm } from "./disassembly-form";

export const metadata: Metadata = { title: "Desmontar PC" };

export default async function DisassemblePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("builds.manage");
  const { id } = await params;
  const item = await getItemDetail(app.ctx, id);
  if (!item) notFound();
  const [categories, locations] = await Promise.all([categoryOptions(app.ctx), locationOptions(app.ctx)]);
  const installed = item.children.filter((c) => c.status === "INSTALLED");
  const allowed = ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED"].includes(item.status) && item.ownership === "OWNED";
  return (
    <>
      <PageHeader
        title={`Desmontar ${item.code}`}
        description="O custo do PC é redistribuído entre as peças que voltam ao estoque. Você vê o rateio antes de confirmar; nada é escondido."
        back={{ href: `/estoque/${item.id}`, label: item.title }}
      />
      {!allowed ? (
        <Callout tone="warning">Este item não pode ser desmontado agora (situação atual ou posse). Libere-o de vendas, reservas ou negociações antes.</Callout>
      ) : (
        <DisassemblyForm
          pc={{ id: item.id, code: item.code, title: item.title, unitCostCents: item.unitCostCents ?? null, costStatus: item.costStatus ?? "KNOWN", locationId: item.locationId }}
          installed={installed.map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.category, unitCostCents: c.unitCostCents ?? null }))}
          categories={categories}
          locations={locations.map((l) => ({ id: l.id, path: l.path }))}
          seeCost={app.can("inventory.cost")}
        />
      )}
    </>
  );
}
