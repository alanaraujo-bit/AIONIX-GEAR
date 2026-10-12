import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { PageHeader, Section, Table, Th, Td } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { Importer } from "./importer";
import { RevertButton } from "./revert-button";

export const metadata: Metadata = { title: "Importar estoque" };

export default async function ImportPage() {
  const app = await requirePage("data.import");
  const batches = await prisma.importBatch.findMany({ where: { orgId: app.ctx.orgId }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <PageHeader
        title="Importar estoque"
        description="Traga a planilha que você já usa (CSV ou Excel). Nada é gravado antes da prévia; custos vazios entram como desconhecidos, nunca como zero."
        back={{ href: "/estoque", label: "Estoque" }}
      />
      <Importer />
      {batches.length > 0 && (
        <Section title="Importações anteriores" description="Uma importação pode ser desfeita enquanto nenhum item dela tiver sido usado." className="mt-6" flush>
          <Table>
            <thead>
              <tr>
                <Th>Arquivo</Th>
                <Th>Data</Th>
                <Th align="right">Linhas</Th>
                <Th align="right">Itens criados</Th>
                <Th>Situação</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <Td className="text-sm">{b.fileName}</Td>
                  <Td className="text-ink-3">{formatDateTime(b.createdAt, app.tz)}</Td>
                  <Td align="right" className="num">
                    {b.rowCount}
                  </Td>
                  <Td align="right" className="num">
                    {b.createdCount}
                  </Td>
                  <Td>
                    <Badge tone={b.status === "APPLIED" ? "positive" : "muted"}>{b.status === "APPLIED" ? "Aplicada" : "Desfeita"}</Badge>
                  </Td>
                  <Td align="right">{b.status === "APPLIED" && <RevertButton id={b.id} name={b.fileName} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}
    </>
  );
}
