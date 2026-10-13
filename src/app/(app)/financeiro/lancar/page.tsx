import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { accountOptions, contactOptions } from "@/server/queries/common";
import { listExpenses } from "@/server/queries/finance";
import { PageHeader, Section, Money, Table, Th, Td } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDate, todayInput, monthRange } from "@/lib/dates";
import { ExpenseForm } from "./expense-form";
import { CancelExpense } from "./cancel-expense";

export const metadata: Metadata = { title: "Lançar despesa ou receita" };

export default async function LaunchPage() {
  const app = await requirePage("finance.manage");
  const [accounts, contacts, categories] = await Promise.all([
    accountOptions(app.ctx),
    contactOptions(app.ctx),
    prisma.financeCategory.findMany({ where: { orgId: app.ctx.orgId, archived: false, group: { notIn: ["SYSTEM", "CAPITAL"] } }, orderBy: { name: "asc" } }),
  ]);
  const p = { from: monthRange(app.tz, -2).from, to: monthRange(app.tz, 0).to };
  const recent = await listExpenses(app.ctx, p);
  return (
    <>
      <PageHeader
        back={{ href: "/financeiro", label: "Financeiro" }}
        title="Lançar despesa ou receita"
        description="Gastos do negócio que não são estoque (aluguel, internet, embalagens, anúncios) e receitas avulsas (serviços). Entram no resultado na data informada."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ExpenseForm accounts={accounts} contacts={contacts} categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))} today={todayInput(app.tz)} />
        <Section title="Últimos lançamentos" description="Cancelar estorna o resultado e o dinheiro, mantendo o registro." flush>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-3">Nenhum lançamento nos últimos 3 meses.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Descrição</Th>
                  <Th align="right">Valor</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className={r.cancelled ? "opacity-50" : ""}>
                    <Td className="whitespace-nowrap text-[0.8125rem] text-ink-3">{formatDate(r.date, app.tz)}</Td>
                    <Td>
                      <span className="block text-sm">{r.description}</span>
                      <span className="text-[0.75rem] text-ink-3">
                        {r.category}
                        {r.cancelled && (
                          <Badge tone="muted" className="ml-2">
                            cancelado
                          </Badge>
                        )}
                      </span>
                    </Td>
                    <Td align="right">
                      <Money cents={r.type === "EXPENSE" ? -r.amountCents : r.amountCents} tone="auto" />
                    </Td>
                    <Td align="right">{!r.cancelled && <CancelExpense refId={r.refId} description={r.description} />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      </div>
    </>
  );
}
