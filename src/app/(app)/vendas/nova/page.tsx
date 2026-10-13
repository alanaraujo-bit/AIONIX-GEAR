import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { pickableItems } from "@/server/queries/items";
import { contactOptions, accountOptions, categoryOptions, locationOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { todayInput } from "@/lib/dates";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ item?: string; contato?: string; oportunidade?: string }> }) {
  const app = await requirePage("sales.manage");
  const sp = await searchParams;
  const [items, contacts, accounts, categories, locations] = await Promise.all([
    pickableItems(app.ctx, "sale"),
    contactOptions(app.ctx),
    accountOptions(app.ctx),
    categoryOptions(app.ctx),
    locationOptions(app.ctx),
  ]);
  const preselect = sp.item ? items.filter((i) => i.id === sp.item) : [];
  return (
    <>
      <PageHeader title="Nova venda ou orçamento" description="Escolha os itens, o preço combinado e como o cliente vai pagar." back={{ href: "/vendas", label: "Vendas" }} />
      <SaleForm
        items={items}
        preselect={preselect}
        contacts={contacts}
        accounts={accounts}
        categories={categories}
        locations={locations.map((l) => ({ id: l.id, path: l.path }))}
        today={todayInput(app.tz)}
        defaultWarrantyDays={app.settings.defaultWarrantyDays}
        reservationDays={app.settings.reservationDays}
        seeCost={app.can("inventory.cost")}
        initialContactId={sp.contato ?? null}
        opportunityId={sp.oportunidade ?? null}
      />
    </>
  );
}
