import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { categoryOptions, locationOptions, contactOptions, accountOptions, productOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { todayInput } from "@/lib/dates";
import { NewItemForm } from "./new-item-form";

export const metadata: Metadata = { title: "Cadastrar item" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ modo?: string; local?: string }> }) {
  const app = await requirePage("inventory.edit");
  const sp = await searchParams;
  const [categories, locations, contacts, accounts, products] = await Promise.all([
    categoryOptions(app.ctx),
    locationOptions(app.ctx),
    contactOptions(app.ctx),
    accountOptions(app.ctx),
    productOptions(app.ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Cadastrar item"
        description="Registre a peça com o que você sabe agora. Custo desconhecido fica marcado — você completa depois."
        back={{ href: "/estoque", label: "Estoque" }}
      />
      <NewItemForm
        categories={categories}
        locations={locations.map((l) => ({ id: l.id, path: l.path }))}
        contacts={contacts}
        accounts={accounts}
        products={products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, model: p.model, categoryId: p.categoryId, tracking: p.tracking, specs: p.specs as Record<string, unknown> }))}
        canPurchase={app.can("purchases.manage")}
        seeCost={app.can("inventory.cost")}
        targetMarginPct={app.settings.targetMarginPct}
        today={todayInput(app.tz)}
        initialMode={sp.modo === "inicial" ? "MIGRATION" : undefined}
        initialLocationId={sp.local ?? null}
      />
    </>
  );
}
