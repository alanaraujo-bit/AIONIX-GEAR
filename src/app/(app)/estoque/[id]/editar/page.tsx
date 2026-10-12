import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { getItemDetail } from "@/server/queries/items";
import { PageHeader } from "@/components/ui/layout";
import { toDateInput } from "@/lib/dates";
import { EditItemForm } from "./edit-form";

export const metadata: Metadata = { title: "Editar item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("inventory.edit");
  const { id } = await params;
  const item = await getItemDetail(app.ctx, id);
  if (!item) notFound();
  return (
    <>
      <PageHeader title={`Editar ${item.code}`} description="Alterações ficam registradas no histórico do item." back={{ href: `/estoque/${item.id}`, label: item.title }} />
      <EditItemForm
        kind={item.product.kind}
        seeCost={app.can("inventory.cost")}
        initial={{
          id: item.id,
          version: item.version,
          title: item.title,
          serial: item.serial ?? "",
          condition: item.condition,
          defects: item.defects ?? "",
          completeness: item.completeness ?? {},
          accessories: item.accessories ?? "",
          specs: Object.fromEntries(Object.entries(item.itemSpecs ?? {}).map(([k, v]) => [k, String(v ?? "")])),
          productSpecs: Object.fromEntries(Object.entries(item.specs ?? {}).map(([k, v]) => [k, String(v ?? "")])),
          expectedPriceCents: item.expectedPriceCents,
          minPriceCents: item.minPriceCents ?? null,
          estimatedValueCents: item.estimatedValueCents,
          estimatedValueNote: item.estimatedValueNote ?? "",
          warrantyUntil: toDateInput(item.warrantyUntil, app.tz),
          warrantyNotes: item.warrantyNotes ?? "",
          tags: item.tags.join(", "),
          notes: item.notes ?? "",
          tracking: item.tracking,
        }}
      />
    </>
  );
}
