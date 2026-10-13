import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, Plus } from "lucide-react";
import { requirePage } from "@/server/session";
import { listBuilds } from "@/server/queries/builds";
import { PageHeader, Section, EmptyState, Table, Th, Td, Money } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/app/list-search";
import { BUILD_STATUS_LABEL, BUILD_STATUS_TONE } from "@/lib/labels";
import { formatRelative } from "@/lib/dates";

export const metadata: Metadata = { title: "Montagens" };

export default async function BuildsPage({ searchParams }: { searchParams: Promise<{ situacao?: string; q?: string }> }) {
  const app = await requirePage("builds.manage");
  const sp = await searchParams;
  const rows = await listBuilds(app.ctx, sp);
  return (
    <>
      <PageHeader
        title="Montagens"
        description="PCs montados com peças do estoque. Peças reservadas não podem ser vendidas avulsas; ao concluir, o PC vira um item vendável com custo somado — sem duplicar as peças."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/montagens/nova">
              <Plus /> Iniciar montagem
            </Link>
          </Button>
        }
      />
      <ListSearch
        placeholder="Código ou nome…"
        tabs={[
          { value: "", label: "Todas" },
          { value: "abertas", label: "Em andamento" },
          { value: "COMPLETED", label: "Concluídas" },
          { value: "CANCELLED", label: "Canceladas" },
        ]}
      />
      <Section flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="Nenhuma montagem"
            action={
              <Button asChild variant="primary">
                <Link href="/montagens/nova">Iniciar a primeira</Link>
              </Button>
            }
          >
            Escolha as peças do estoque, acompanhe compatibilidade, custos e testes, e transforme tudo em um PC pronto para vender.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Montagem</Th>
                <Th>Situação</Th>
                <Th align="right">Peças</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Preço alvo</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/montagens/${r.id}`} className="block no-underline">
                      <span className="block text-sm font-medium text-ink hover:text-accent-text">{r.name}</span>
                      <span className="code text-ink-3">
                        {r.code} · {r.purpose === "CUSTOMER_ORDER" ? `encomenda${r.contact ? ` de ${r.contact}` : ""}` : "para venda"} · {formatRelative(r.updatedAt)}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={BUILD_STATUS_TONE[r.status]}>{BUILD_STATUS_LABEL[r.status]}</Badge>
                  </Td>
                  <Td align="right" className="num">
                    {r.parts}
                  </Td>
                  <Td align="right">
                    <Money cents={r.totalCostCents} />
                  </Td>
                  <Td align="right">
                    <Money cents={r.targetPriceCents} />
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
