import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { pickableItems } from "@/server/queries/items";
import { contactOptions, categoryOptions, locationOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { todayInput } from "@/lib/dates";
import { TradeForm } from "../trade-form";

export const metadata: Metadata = { title: "Nova catira" };

export default async function NewTradePage({ searchParams }: { searchParams: Promise<{ sai?: string; contato?: string }> }) {
  const app = await requirePage("trades.manage");
  const sp = await searchParams;
  const [items, contacts, categories, locations] = await Promise.all([pickableItems(app.ctx, "trade"), contactOptions(app.ctx), categoryOptions(app.ctx), locationOptions(app.ctx)]);
  const pre = sp.sai ? items.filter((i) => i.id === sp.sai) : [];
  return (
    <>
      <PageHeader title="Nova catira" description="Monte a troca dos dois lados. Antes de confirmar, você vê o efeito real no caixa, no custo e no potencial de revenda." back={{ href: "/catiras", label: "Catiras" }} />
      <TradeForm
        initial={{
          id: null,
          title: "",
          contactId: sp.contato ?? null,
          date: todayInput(app.tz),
          notes: "",
          out: pre.map((i) => ({ item: i, quantity: 1, agreedValueCents: i.expectedPriceCents, estimatedValueCents: i.estimatedValueCents })),
          in: [],
          cashDir: "none",
          cashCents: null,
          feesCents: null,
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
