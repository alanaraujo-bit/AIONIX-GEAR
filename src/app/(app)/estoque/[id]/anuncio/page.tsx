import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { getItemDetail } from "@/server/queries/items";
import { PageHeader, Section } from "@/components/ui/layout";
import { ShareButtons } from "@/components/app/share";
import { SPEC_FIELDS } from "@/server/domain/compat";
import { CONDITION_LABEL, COMPLETENESS_FIELDS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Texto para anúncio" };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("inventory.view");
  const { id } = await params;
  const item = await getItemDetail(app.ctx, id);
  if (!item) notFound();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: app.ctx.orgId }, select: { name: true, phone: true, city: true, state: true } });
  const specFields = SPEC_FIELDS[item.product.kind] ?? [];
  const specs = specFields.filter((f) => item.specs[f.key] !== undefined && item.specs[f.key] !== "").map((f) => `• ${f.label}: ${item.specs[f.key]}`);
  const children = item.children.filter((c) => c.status === "INSTALLED").map((c) => `• ${c.category}: ${c.title}`);
  const includes = COMPLETENESS_FIELDS.filter((c) => item.completeness?.[c.key]).map((c) => c.label.toLowerCase());
  const lines = [
    `${item.title.toUpperCase()}`,
    "",
    `Estado: ${CONDITION_LABEL[item.condition]}`,
    ...(children.length ? ["", "Configuração:", ...children] : specs.length ? ["", "Especificações:", ...specs] : []),
    ...(includes.length ? ["", `Acompanha: ${includes.join(", ")}${item.accessories ? `, ${item.accessories}` : ""}`] : item.accessories ? ["", `Acompanha: ${item.accessories}`] : []),
    ...(item.defects ? ["", `Observações honestas: ${item.defects}`] : []),
    ...(item.warrantyUntil && new Date(item.warrantyUntil) > new Date() ? ["", `Garantia até ${formatDate(item.warrantyUntil, app.tz)}`] : []),
    "",
    item.expectedPriceCents ? `Valor: ${formatBRL(item.expectedPriceCents)}` : "Valor: a combinar",
    ...(org.city ? [`Retirada/entrega: ${org.city}${org.state ? `/${org.state}` : ""}`] : []),
    "",
    `Ref.: ${item.code} · ${org.name}`,
  ];
  const text = lines.join("\n");
  return (
    <>
      <PageHeader title="Texto para anúncio" description="Pronto para colar na OLX, Marketplace, grupos ou status. Revise antes de publicar — a publicação é sempre feita por você." back={{ href: `/estoque/${item.id}`, label: item.title }} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section title="Texto">
          <pre className="whitespace-pre-wrap rounded-[8px] border border-line bg-surface-2 p-4 font-sans text-[0.9375rem] leading-relaxed text-ink">{text}</pre>
          <div className="mt-4">
            <ShareButtons text={text} />
          </div>
        </Section>
        <Section title="Dicas para vender mais rápido">
          <ul className="list-disc space-y-2 pl-4 text-sm text-ink-2">
            <li>Use 4 a 6 fotos com boa luz: frente, verso, conectores e o número de série.</li>
            <li>Ser honesto sobre defeitos evita devoluções e gera reputação.</li>
            {!item.expectedPriceCents && <li>Defina o preço pretendido na ficha do item para ele aparecer aqui.</li>}
            {item.attachments.filter((a) => a.kind === "PHOTO").length === 0 && <li>Este item ainda não tem fotos.</li>}
          </ul>
        </Section>
      </div>
    </>
  );
}
