import Link from "next/link";
import { HandCoins } from "lucide-react";
import type { AppContext } from "@/server/session";
import { listTitles } from "@/server/queries/finance";
import { accountOptions } from "@/server/queries/common";
import { PageHeader, Section, Money, EmptyState } from "@/components/ui/layout";
import { ListSearch } from "@/components/app/list-search";
import { TitlesTable } from "./titles-table";

const SOURCE_HREF: Record<string, string> = { SALE: "/vendas/", PURCHASE: "/compras/", TRADE: "/catiras/", CONSIGNMENT: "/vendas/" };

export async function TitlesPage({ app, direction, sp }: { app: AppContext; direction: "RECEIVABLE" | "PAYABLE"; sp: { situacao?: string; q?: string } }) {
  const [data, accounts] = await Promise.all([listTitles(app.ctx, direction, sp), accountOptions(app.ctx)]);
  const receiving = direction === "RECEIVABLE";
  return (
    <>
      <PageHeader
        back={{ href: app.can("finance.view") ? "/financeiro" : "/", label: app.can("finance.view") ? "Financeiro" : "Início" }}
        title={receiving ? "Contas a receber" : "Contas a pagar"}
        description={receiving ? "Parcelas e saldos que clientes ainda devem. Registrar o recebimento lança a entrada na conta escolhida." : "O que você ainda deve a fornecedores, catiras, despesas e repasses."}
      />
      <div className="mb-5 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-box)] border border-line bg-line [&>*]:bg-surface">
        <div className="px-4 py-3">
          <p className="text-[0.8125rem] text-ink-3">Em aberto</p>
          <Money cents={data.openCents} className="text-lg font-semibold" />
        </div>
        <div className="px-4 py-3">
          <p className="text-[0.8125rem] text-ink-3">{receiving ? "Atrasado" : "Vencido"}</p>
          <Money cents={data.overdueCents} className={data.overdueCents ? "text-lg font-semibold text-negative" : "text-lg font-semibold"} />
        </div>
        <div className="px-4 py-3">
          <p className="text-[0.8125rem] text-ink-3">Vence em 7 dias</p>
          <Money cents={data.next7Cents} className="text-lg font-semibold" />
        </div>
      </div>
      <ListSearch
        placeholder="Descrição…"
        tabs={[
          { value: "", label: "Em aberto" },
          { value: "atrasados", label: receiving ? "Atrasados" : "Vencidos" },
          { value: "quitados", label: "Quitados" },
          { value: "todos", label: "Todos" },
        ]}
      />
      <Section flush>
        {data.rows.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nada por aqui" compact>
            {receiving ? "Nenhum valor a receber nesta situação." : "Nenhuma conta a pagar nesta situação."}
          </EmptyState>
        ) : (
          <TitlesTable rows={data.rows.map((r) => ({ ...r, href: r.sourceId && SOURCE_HREF[r.sourceType] ? `${SOURCE_HREF[r.sourceType]}${r.sourceId}` : null }))} accounts={accounts} canSettle={receiving ? app.can("sales.manage") || app.can("finance.manage") : app.can("finance.manage")} canWriteOff={app.can("finance.manage")} tz={app.tz} />
        )}
      </Section>
      {!receiving && (
        <p className="mt-4 text-[0.8125rem] text-ink-3">
          Despesa nova? <Link href="/financeiro/lancar">Lance aqui</Link> — paga agora ou a pagar.
        </p>
      )}
    </>
  );
}
