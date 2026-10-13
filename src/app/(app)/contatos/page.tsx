import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { requireApp } from "@/server/session";
import { listContacts } from "@/server/queries/contacts";
import { PageHeader, Section, EmptyState, Table, Th, Td, Money } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/app/list-search";
import { ContactSheetButton } from "./contact-sheet";

export const metadata: Metadata = { title: "Contatos" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; arquivados?: string }> }) {
  const app = await requireApp();
  if (!(app.can("contacts.manage") || app.can("purchases.manage") || app.can("trades.manage"))) redirect("/sem-permissao");
  const sp = await searchParams;
  const rows = await listContacts(app.ctx, sp);
  return (
    <>
      <PageHeader
        title="Contatos"
        description="Clientes, fornecedores e parceiros de catira — com histórico, saldo em aberto e preferências."
        actions={<ContactSheetButton />}
      />
      <ListSearch
        placeholder="Nome, telefone, cidade…"
        tabParam="tipo"
        tabs={[
          { value: "", label: "Todos" },
          { value: "clientes", label: "Clientes" },
          { value: "fornecedores", label: "Fornecedores" },
        ]}
        extra={
          <Link href={sp.arquivados === "1" ? "/contatos" : "/contatos?arquivados=1"} className="text-[0.8125rem] text-ink-3">
            {sp.arquivados === "1" ? "Ver ativos" : "Ver arquivados"}
          </Link>
        }
      />
      <Section flush>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title={sp.q ? "Ninguém encontrado" : "Nenhum contato ainda"}>
            Contatos são criados automaticamente quando você registra compras, vendas e catiras — ou cadastre agora.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th className="hidden md:table-cell">Contato</Th>
                <Th align="right" className="hidden sm:table-cell">Negócios</Th>
                <Th align="right">Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/contatos/${r.id}`} className="font-medium text-ink no-underline hover:text-accent-text">
                      {r.name}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {r.isCustomer && <Badge tone="accent">Cliente</Badge>}
                      {r.isSupplier && <Badge tone="info">Fornecedor</Badge>}
                      {r.anonymized && <Badge tone="muted">Anonimizado</Badge>}
                      {r.tags.map((t) => (
                        <Badge key={t}>#{t}</Badge>
                      ))}
                    </span>
                  </Td>
                  <Td className="hidden text-sm text-ink-2 md:table-cell">{[r.whatsapp ?? r.phone, r.city].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td align="right" className="hidden text-[0.8125rem] text-ink-3 sm:table-cell">
                    {r.salesCount ? `${r.salesCount} venda(s)` : ""}
                    {r.salesCount && r.purchasesCount ? " · " : ""}
                    {r.purchasesCount ? `${r.purchasesCount} compra(s)` : ""}
                    {!r.salesCount && !r.purchasesCount ? "—" : ""}
                  </Td>
                  <Td align="right" className="text-sm">
                    {r.receivableCents > 0 && (
                      <span className="block">
                        deve <Money cents={r.receivableCents} className="text-warning-text" />
                      </span>
                    )}
                    {r.payableCents > 0 && (
                      <span className="block">
                        a pagar <Money cents={r.payableCents} />
                      </span>
                    )}
                    {!r.receivableCents && !r.payableCents && <span className="text-ink-3">—</span>}
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
