import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { getBuildDetail } from "@/server/queries/builds";
import { readSettings } from "@/server/domain/org";
import { CATEGORY_KIND_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PrintBar } from "../../print-bar";

export const metadata = { title: "Ficha técnica" };

const ORDER = ["CPU", "COOLER", "MOTHERBOARD", "RAM", "GPU", "STORAGE", "PSU", "CASE"];

export default async function BuildSheet({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("builds.manage");
  const { id } = await params;
  const d = await getBuildDetail(app.ctx, id);
  if (!d) notFound();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: app.ctx.orgId } });
  const settings = readSettings(org.settings);
  const parts = [...d.parts].filter((p) => p.kind !== "CONSUMABLE").sort((a, b) => (ORDER.indexOf(a.kind) + 99) % 99 - (ORDER.indexOf(b.kind) + 99) % 99);
  const price = d.result?.expectedPriceCents ?? d.build.targetPriceCents;
  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <PrintBar />
      <article className="mx-auto max-w-[780px] bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">{org.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.build.name}</h1>
            {d.build.description && <p className="mt-2 max-w-[60ch] text-neutral-700">{d.build.description}</p>}
          </div>
          <div className="text-right">
            <p className="font-mono">{d.result?.code ?? d.build.code}</p>
            <p className="text-neutral-600">{formatDate(new Date(), app.tz)}</p>
            {price ? <p className="mt-2 text-xl font-semibold">{formatBRL(price)}</p> : null}
          </div>
        </header>
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Configuração</h2>
          <table className="w-full">
            <tbody>
              {parts.map((p) => (
                <tr key={p.partId} className="border-b border-neutral-200">
                  <td className="w-40 py-2 text-neutral-500">{CATEGORY_KIND_LABEL[p.kind] ?? p.category}</td>
                  <td className="py-2 font-medium">
                    {p.quantity > 1 ? `${p.quantity}× ` : ""}
                    {p.title}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {(d.build.testNotes || d.build.benchmarks) && (
          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            {d.build.testNotes && (
              <div>
                <h2 className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">Testes realizados</h2>
                <p className="whitespace-pre-line">{d.build.testNotes}</p>
              </div>
            )}
            {d.build.benchmarks && (
              <div>
                <h2 className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">Desempenho</h2>
                <p className="whitespace-pre-line">{d.build.benchmarks}</p>
              </div>
            )}
          </section>
        )}
        {d.build.warrantyDays ? <p className="mt-6">Garantia da montagem: {d.build.warrantyDays} dias, cobrindo defeitos de funcionamento.</p> : null}
        {settings.documentFooter && <p className="mt-4 whitespace-pre-line text-neutral-600">{settings.documentFooter}</p>}
        <footer className="mt-10 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">
          Ficha técnica informativa. Especificações conforme peças registradas; desempenho pode variar. Não é documento fiscal.
        </footer>
      </article>
    </div>
  );
}
