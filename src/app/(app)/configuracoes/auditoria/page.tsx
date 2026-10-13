import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { userNames } from "@/server/queries/common";
import { Section, Table, Th, Td } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { ListSearch } from "@/components/app/list-search";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Auditoria" };

const HREF: Record<string, string> = { Item: "/estoque/", Sale: "/vendas/", Purchase: "/compras/", Trade: "/catiras/", Build: "/montagens/", Contact: "/contatos/", StockCount: "/estoque/inventarios/" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const app = await requirePage("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where = { orgId: app.ctx.orgId, ...(sp.q ? { OR: [{ summary: { contains: sp.q, mode: "insensitive" as const } }, { action: { contains: sp.q, mode: "insensitive" as const } }] } : {}) };
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100 }), prisma.auditLog.count({ where })]);
  const names = await userNames(rows.map((r) => r.userId));
  return (
    <Section title="Registro de auditoria" description="Toda operação sensível fica registrada: quem, quando e o quê. Não pode ser editado." actions={<Button asChild size="sm" variant="ghost"><a href="/api/export/auditoria">Exportar CSV</a></Button>} flush>
      <div className="px-4 pt-3 sm:px-5">
        <ListSearch placeholder="Buscar no registro…" />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Quando</Th>
            <Th>Quem</Th>
            <Th>O quê</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-[0.8125rem] text-ink-3">{formatDateTime(r.createdAt, app.tz)}</Td>
              <Td className="text-sm text-ink-2">{r.userId ? names.get(r.userId) ?? "—" : "Sistema"}</Td>
              <Td className="text-sm">
                {r.entityType && r.entityId && HREF[r.entityType] ? <Link href={`${HREF[r.entityType]}${r.entityId}`}>{r.summary}</Link> : r.summary}
                <span className="code ml-2 text-[0.6875rem] text-ink-3">{r.action}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-ink-3">
        <span>
          {total} registro(s) · página {page}
        </span>
        <div className="flex gap-2">
          {page > 1 && <Link href={`/configuracoes/auditoria?page=${page - 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}>Anterior</Link>}
          {page * 100 < total && <Link href={`/configuracoes/auditoria?page=${page + 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}>Próxima</Link>}
        </div>
      </div>
    </Section>
  );
}
