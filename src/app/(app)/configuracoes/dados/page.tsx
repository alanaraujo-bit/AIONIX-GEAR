import type { Metadata } from "next";
import { DownloadLink } from "@/components/ui/download-link";
import Link from "next/link";
import { Download, Upload, DatabaseBackup, ShieldCheck } from "lucide-react";
import { requireApp } from "@/server/session";
import { redirect } from "next/navigation";
import { Section, Callout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dados e backup" };

const EXPORTS = [
  { kind: "estoque", label: "Estoque completo", perm: "inventory.view" },
  { kind: "vendas", label: "Vendas (todas)", perm: "sales.manage" },
  { kind: "compras", label: "Compras (todas)", perm: "purchases.manage" },
  { kind: "movimentos", label: "Movimentos de caixa", perm: "finance.view" },
  { kind: "titulos", label: "Contas a receber e a pagar", perm: "finance.view" },
  { kind: "resultado", label: "Lançamentos de resultado", perm: "reports.view" },
  { kind: "contatos", label: "Contatos", perm: "contacts.manage" },
  { kind: "auditoria", label: "Registro de auditoria", perm: "audit.view" },
] as const;

export default async function DataPage() {
  const app = await requireApp();
  if (!(app.can("data.export") || app.can("data.import"))) redirect("/sem-permissao");
  return (
    <div className="flex flex-col gap-5">
      {app.can("data.export") && (
        <Section title="Backup completo" description="Um arquivo JSON com todos os registros da empresa (estoque, histórico, vendas, catiras, financeiro). Guarde em local seguro — contém dados de clientes.">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="primary">
              <DownloadLink href="/api/export/backup">
                <DatabaseBackup /> Baixar backup (JSON)
              </DownloadLink>
            </Button>
            <span className="text-[0.8125rem] text-ink-3">Fotos e documentos não vão no JSON; eles ficam no banco de dados e entram no backup do servidor.</span>
          </div>
          <Callout tone="neutral" icon={ShieldCheck} className="mt-4">
            Além deste arquivo, a plataforma faz cópias do banco de dados inteiro. O procedimento de restauração está documentado (docs/BACKUP.md).
          </Callout>
        </Section>
      )}
      <Section title="Exportar planilhas (CSV)" description="Abrem direto no Excel ou Google Planilhas (separador ponto e vírgula, vírgula decimal).">
        <ul className="grid gap-2 sm:grid-cols-2">
          {EXPORTS.filter((e) => app.can(e.perm)).map((e) => (
            <li key={e.kind}>
              <DownloadLink href={`/api/export/${e.kind}`} className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2.5 text-sm text-ink no-underline hover:border-line-strong hover:bg-surface-2/60">
                {e.label}
                <Download className="size-4 text-ink-3" />
              </DownloadLink>
            </li>
          ))}
        </ul>
      </Section>
      {app.can("data.import") && (
        <Section title="Importar">
          <p className="text-sm text-ink-2">Traga sua planilha de estoque com prévia, avisos e possibilidade de desfazer.</p>
          <Button asChild className="mt-3">
            <Link href="/estoque/importar">
              <Upload /> Importar estoque
            </Link>
          </Button>
        </Section>
      )}
      <Section title="Privacidade">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Cada empresa só enxerga os próprios dados; o acesso é verificado no servidor em todas as operações.</li>
          <li>Guarde apenas o necessário dos contatos. Se alguém pedir exclusão, use “Remover dados pessoais” na ficha do contato: os registros comerciais permanecem sem os dados pessoais.</li>
          <li>Fotos e documentos só abrem para usuários logados da empresa.</li>
        </ul>
      </Section>
    </div>
  );
}
