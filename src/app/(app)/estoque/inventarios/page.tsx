import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { locationOptions } from "@/server/queries/common";
import { PageHeader, Section, EmptyState, Table, Th, Td } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { NewCount } from "./new-count";

export const metadata: Metadata = { title: "Inventário" };

export default async function CountsPage() {
  const app = await requirePage("inventory.adjust");
  const [counts, locations] = await Promise.all([
    prisma.stockCount.findMany({ where: { orgId: app.ctx.orgId }, orderBy: { startedAt: "desc" }, include: { _count: { select: { lines: true } }, lines: { select: { result: true } } } }),
    locationOptions(app.ctx),
  ]);
  const locName = new Map(locations.map((l) => [l.id, l.path]));
  return (
    <>
      <PageHeader
        title="Inventário físico"
        description="Conte o que existe de verdade em um local, compare com o sistema e corrija com motivo. O histórico original de cada item é preservado."
        back={{ href: "/estoque", label: "Estoque" }}
        actions={<NewCount locations={locations.map((l) => ({ id: l.id, path: l.path }))} />}
      />
      <Section flush>
        {counts.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nenhuma contagem ainda">
            Comece por um local pequeno — uma gaveta ou caixa. Escaneie as etiquetas e o sistema aponta o que falta, sobra ou está no lugar errado.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Contagem</Th>
                <Th>Local</Th>
                <Th>Situação</Th>
                <Th align="right">Itens</Th>
                <Th align="right">Divergências</Th>
                <Th>Início</Th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => {
                const div = c.lines.filter((l) => ["MISSING", "WRONG_LOCATION", "QTY_DIFF", "UNEXPECTED"].includes(l.result)).length;
                return (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/estoque/inventarios/${c.id}`} className="font-medium text-ink no-underline hover:text-accent-text">
                        {c.name}
                      </Link>
                      <span className="code ml-2 text-ink-3">{c.code}</span>
                    </Td>
                    <Td className="text-ink-2">{c.locationId ? locName.get(c.locationId) ?? "—" : "Todos os locais"}</Td>
                    <Td>
                      <Badge tone={c.status === "OPEN" ? "info" : c.status === "CLOSED" ? "positive" : "muted"}>{c.status === "OPEN" ? "Em andamento" : c.status === "CLOSED" ? "Encerrada" : "Cancelada"}</Badge>
                    </Td>
                    <Td align="right" className="num">
                      {c._count.lines}
                    </Td>
                    <Td align="right" className={div ? "num text-warning-text" : "num text-ink-3"}>
                      {div}
                    </Td>
                    <Td className="text-ink-3">{formatDateTime(c.startedAt, app.tz)}</Td>
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
