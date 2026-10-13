import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag, Plus } from "lucide-react";
import { requirePage } from "@/server/session";
import { listPurchases } from "@/server/queries/commerce";
import { PageHeader, Section, EmptyState, Table, Th, Td, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/app/list-search";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Compras" };

const STATUS: Record<string, { label: string; tone: "neutral" | "positive" | "muted" }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  CONFIRMED: { label: "Confirmada", tone: "positive" },
  CANCELLED: { label: "Cancelada", tone: "muted" },
};

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const app = await requirePage("purchases.manage");
  const sp = await searchParams;
  const data = await listPurchases(app.ctx, { q: sp.q, status: sp.status, page: Number(sp.page ?? 1) });
  return (
    <>
      <PageHeader
        title="Compras"
        description="Tudo o que entrou comprado: de quem, quanto custou de verdade (com frete e taxas) e quanto ainda falta pagar."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/compras/nova">
              <Plus /> Nova compra
            </Link>
          </Button>
        }
      />
      <ListSearch
        placeholder="Código ou peça…"
        tabs={[
          { value: "", label: "Todas" },
          { value: "DRAFT", label: "Rascunhos" },
          { value: "CONFIRMED", label: "Confirmadas" },
          { value: "CANCELLED", label: "Canceladas" },
        ]}
        tabParam="status"
      />
      <Section flush>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={sp.q || sp.status ? "Nenhuma compra encontrada" : "Nenhuma compra registrada"}
            action={
              <Button asChild variant="primary">
                <Link href="/compras/nova">Registrar compra</Link>
              </Button>
            }
          >
            Registre compras de pessoas, lojas ou lotes. Frete, comissão e taxas entram no custo de cada peça — rateados com centavos exatos.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Compra</Th>
                <Th className="hidden md:table-cell">Fornecedor</Th>
                <Th>Situação</Th>
                <Th align="right">Total</Th>
                <Th align="right">A pagar</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/compras/${r.id}`} className="block no-underline">
                      <span className="block max-w-[420px] truncate text-sm font-medium text-ink hover:text-accent-text">{r.description || "Sem itens"}</span>
                      <span className="code text-ink-3">
                        {r.code} · {formatDate(r.date, app.tz)} · {r.units} un.
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden text-sm text-ink-2 md:table-cell">{r.contact ?? <span className="text-ink-3">—</span>}</Td>
                  <Td>
                    <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label}</Badge>
                  </Td>
                  <Td align="right">
                    <Money cents={r.totalCents} />
                  </Td>
                  <Td align="right">{r.openCents > 0 ? <Money cents={r.openCents} className="text-warning-text" /> : <span className="text-ink-3">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
