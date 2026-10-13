import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { categoryOptions, locationOptions, contactOptions, accountOptions, productOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { todayInput } from "@/lib/dates";
import { PurchaseForm } from "./purchase-form";

export const metadata: Metadata = { title: "Nova compra" };

export default async function NewPurchasePage() {
  const app = await requirePage("purchases.manage");
  const [categories, locations, contacts, accounts, products] = await Promise.all([
    categoryOptions(app.ctx),
    locationOptions(app.ctx),
    contactOptions(app.ctx),
    accountOptions(app.ctx),
    productOptions(app.ctx),
  ]);
  return (
    <>
      <PageHeader title="Nova compra" description="Uma peça ou um lote inteiro. O custo real de cada unidade inclui frete, taxas e comissão — rateados pelo valor." back={{ href: "/compras", label: "Compras" }} />
      <PurchaseForm
        categories={categories}
        locations={locations.map((l) => ({ id: l.id, path: l.path }))}
        contacts={contacts}
        accounts={accounts}
        products={products.map((p) => ({ ...p, specs: p.specs as Record<string, unknown> }))}
        today={todayInput(app.tz)}
      />
    </>
  );
}
