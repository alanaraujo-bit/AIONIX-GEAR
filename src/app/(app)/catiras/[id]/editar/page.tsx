import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/session";
import { getTradeDetail } from "@/server/queries/trades";
import { pickableItems } from "@/server/queries/items";
import { contactOptions, categoryOptions, locationOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { todayInput, toDateInput } from "@/lib/dates";
import { TradeForm } from "../../trade-form";

export const metadata: Metadata = { title: "Editar catira" };

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("trades.manage");
  const { id } = await params;
  const t = await getTradeDetail(app.ctx, id);
  if (!t) notFound();
  if (!["DRAFT", "NEGOTIATING"].includes(t.status)) redirect(`/catiras/${t.id}`);
  const [items, contacts, categories, locations] = await Promise.all([
    pickableItems(app.ctx, "trade", { includeIds: t.outLines.map((l) => l.itemId) }),
    contactOptions(app.ctx),
    categoryOptions(app.ctx),
    locationOptions(app.ctx),
  ]);
  return (
    <>
      <PageHeader title={`Editar ${t.code}`} description="Mudar a proposta libera e bloqueia de novo os seus itens. Registre como contraproposta para guardar o histórico." back={{ href: `/catiras/${t.id}`, label: t.title }} />
      <TradeForm
        initial={{
          id: t.id,
          title: t.title,
          contactId: t.contactId,
          date: toDateInput(t.date, app.tz),
          notes: t.notes ?? "",
          out: t.outLines.map((l) => ({ item: items.find((i) => i.id === l.itemId)!, quantity: l.quantity, agreedValueCents: l.agreedValueCents, estimatedValueCents: l.estimatedValueCents })).filter((o) => o.item),
          in: t.inLines.map((l) => ({
            key: l.id,
            categoryId: l.categoryId,
            title: l.title,
            brand: l.brand ?? "",
            model: l.model ?? "",
            serial: l.serial ?? "",
            condition: l.condition,
            conditionReport: l.conditionReport ?? "",
            quantity: l.quantity,
            agreedValueCents: l.agreedValueCents,
            estimatedValueCents: l.estimatedValueCents,
            expectedPriceCents: l.expectedPriceCents,
            locationId: l.locationId,
            specs: Object.fromEntries(Object.entries((l.specs as Record<string, unknown>) ?? {}).map(([k, v]) => [k, String(v ?? "")])),
          })),
          cashDir: t.cashInCents > 0 ? "in" : t.cashOutCents > 0 ? "out" : "none",
          cashCents: t.cashInCents || t.cashOutCents || null,
          feesCents: t.feesCents || null,
        }}
        items={items}
        contacts={contacts}
        categories={categories}
        locations={locations.map((l) => ({ id: l.id, path: l.path }))}
        today={todayInput(app.tz)}
      />
    </>
  );
}
