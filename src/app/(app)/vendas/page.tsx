import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Plus } from "lucide-react";
import { requirePage } from "@/server/session";
import { listSales } from "@/server/queries/commerce";
import { PageHeader, Section, EmptyState, Table, Th, Td, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/app/list-search";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string; entrega?: string; page?: string }> }) {
  const app = await requirePage("sales.manage");
  const sp = await searchParams;
  const data = await listSales(app.ctx, { q: sp.q, situacao: sp.situacao, entrega: sp.entrega, page: Number(sp.page ?? 1) });
  const seeCost = app.can("inventory.cost");
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Vendas"
        description="Orçamento não é venda, venda não é dinheiro recebido, e recebido não é entregue — cada etapa aparece separada."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/vendas/nova">
              <Plus /> Nova venda ou orçamento
            </Link>
          </Button>
        }
      />
      <ListSearch
        placeholder="Código ou item…"
        tabs={[
          { value: "", label: "Todas" },
          { value: "orcamentos", label: "Orçamentos" },
          { value: "vendas", label: "Vendas fechadas" },
          { value: "canceladas", label: "Canceladas" },
        ]}
      />
      {sp.entrega === "pendente" && <p className="mb-3 text-sm text-ink-2">Mostrando vendas aguardando entrega. <Link href="/vendas">Ver todas</Link></p>}
      <Section flush>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={sp.q || sp.situacao ? "Nada encontrado" : "Nenhuma venda ainda"}
            action={
              <Button asChild variant="primary">
                <Link href="/vendas/nova">Fazer a primeira venda</Link>
              </Button>
            }
          >
            Monte um orçamento (pode reservar os itens) ou feche a venda direto, com recebimento parcial ou parcelado.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Venda</Th>
                <Th className="hidden md:table-cell">Cliente</Th>
                <Th>Situação</Th>
                <Th align="right">Total</Th>
                <Th align="right">A receber</Th>
                {seeCost && <Th align="right" className="hidden lg:table-cell">Lucro bruto</Th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const expired = r.status === "QUOTE" && r.quoteValidUntil && new Date(r.quoteValidUntil) < now;
                return (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/vendas/${r.id}`} className="block no-underline">
                        <span className="block max-w-[420px] truncate text-sm font-medium text-ink hover:text-accent-text">{r.description}</span>
                        <span className="text-[0.8125rem] text-ink-3">
                          <span className="code">{r.code}</span> · {formatDate(r.date, app.tz)}
                        </span>
                      </Link>
                    </Td>
                    <Td className="hidden text-sm text-ink-2 md:table-cell">{r.contact ?? <span className="text-ink-3">—</span>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.status === "QUOTE" && <Badge tone={expired ? "muted" : "info"}>{expired ? "Orçamento vencido" : "Orçamento"}</Badge>}
                        {r.status === "CONFIRMED" && <Badge tone="positive">Fechada</Badge>}
                        {r.status === "CANCELLED" && <Badge tone="muted">Cancelada</Badge>}
                        {r.status === "CONFIRMED" && r.deliveryStatus === "PENDING" && <Badge tone="warning">A entregar</Badge>}
                      </div>
                    </Td>
                    <Td align="right">
                      <Money cents={r.totalCents} />
                    </Td>
                    <Td align="right">{r.openCents > 0 ? <Money cents={r.openCents} className="text-warning-text" /> : <span className="text-ink-3">—</span>}</Td>
                    {seeCost && (
                      <Td align="right" className="hidden lg:table-cell">
                        {r.grossCents !== null ? <Money cents={r.grossCents} tone="auto" /> : <span className="text-ink-3">—</span>}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
