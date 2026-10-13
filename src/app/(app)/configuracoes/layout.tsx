import { requireApp } from "@/server/session";
import { PageHeader } from "@/components/ui/layout";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const app = await requireApp();
  const items = [
    { href: "/configuracoes", label: "Empresa", show: true },
    { href: "/configuracoes/categorias", label: "Categorias", show: app.can("settings.manage") },
    { href: "/configuracoes/equipe", label: "Equipe", show: app.can("team.manage") },
    { href: "/configuracoes/dados", label: "Dados e backup", show: app.can("data.export") || app.can("data.import") },
    { href: "/configuracoes/auditoria", label: "Auditoria", show: app.can("audit.view") },
    { href: "/configuracoes/conta", label: "Minha conta", show: true },
  ].filter((i) => i.show);
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav items={items.map(({ href, label }) => ({ href, label }))} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
