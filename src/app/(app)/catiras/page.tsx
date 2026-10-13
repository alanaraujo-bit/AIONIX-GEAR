import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { requirePage } from "@/server/session";
import { listTrades } from "@/server/queries/trades";
import { PageHeader, Section, EmptyState, Table, Th, Td, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/app/list-search";
import { TRADE_STATUS_LABEL, TRADE_STATUS_TONE } from "@/lib/labels";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Catiras" };

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const app = await requirePage("trades.manage");
  const sp = await searchParams;
  const rows = await listTrades(app.ctx, sp);
  return (
    <>
      <PageHeader
        title="Catiras"
        description="Trocas com itens e volta em dinheiro. A troca em si não vira receita: o custo do que sai passa para o que entra, e o lucro aparece na revenda."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/catiras/nova">
              <Plus /> Nova catira
            </Link>
          </Button>
        }
      />
      <ListSearch
        placeholder="Código ou descrição…"
        tabs={[
          { value: "", label: "Todas" },
          { value: "NEGOTIATING", label: "Em negociação" },
          { value: "DRAFT", label: "Rascunhos" },
          { value: "CONFIRMED", label: "Confirmadas" },
          { value: "CANCELLED", label: "Canceladas" },
        ]}
      />
      <Section flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Nenhuma catira registrada"
            action={
              <Button asChild variant="primary">
                <Link href="/catiras/nova">Montar uma catira</Link>
              </Button>
            }
          >
            Registre propostas, contrapropostas e a troca final. Você vê o efeito no caixa e no custo antes de fechar.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Catira</Th>
                <Th className="hidden md:table-cell">Com</Th>
                <Th>Situação</Th>
                <Th align="right">Entrega × recebe</Th>
                <Th align="right">Caixa</Th>
                <Th align="right" className="hidden lg:table-cell">Potencial</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/catiras/${r.id}`} className="block no-underline">
                      <span className="block max-w-[380px] truncate text-sm font-medium text-ink hover:text-accent-text">{r.title}</span>
                      <span className="code text-ink-3">
                        {r.code} · {formatDate(r.date, app.tz)}
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden text-sm text-ink-2 md:table-cell">{r.contact ?? "—"}</Td>
                  <Td>
                    <Badge tone={TRADE_STATUS_TONE[r.status]}>{TRADE_STATUS_LABEL[r.status]}</Badge>
                  </Td>
                  <Td align="right" className="text-[0.8125rem]">
                    <Money cents={r.outAgreedCents} /> <span className="text-ink-3">×</span> <Money cents={r.inAgreedCents} />
                  </Td>
                  <Td align="right">
                    <Money cents={r.netCashCents} tone="auto" signed />
                  </Td>
                  <Td align="right" className="hidden lg:table-cell">
                    {r.upsideCents !== null ? <Money cents={r.upsideCents} tone="auto" signed /> : <span className="text-ink-3">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
