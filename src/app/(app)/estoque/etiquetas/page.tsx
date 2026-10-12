import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { appOrigin, qrSvg } from "@/server/qr";
import { PageHeader, EmptyState } from "@/components/ui/layout";
import { LabelSheet } from "./label-sheet";
import { QrCode } from "lucide-react";

export const metadata: Metadata = { title: "Etiquetas" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const app = await requirePage("inventory.view");
  const { ids } = await searchParams;
  const list = (ids ?? "").split(",").filter(Boolean).slice(0, 200);
  const items = list.length
    ? await prisma.item.findMany({ where: { orgId: app.ctx.orgId, id: { in: list } }, include: { location: true }, orderBy: { code: "asc" } })
    : [];
  const origin = await appOrigin();
  const labels = await Promise.all(
    items.map(async (i) => ({
      id: i.id,
      code: i.code,
      title: i.title,
      serial: i.serial,
      priceCents: i.expectedPriceCents,
      location: i.location?.name ?? null,
      qr: await qrSvg(`${origin}/i/${i.code}`),
    })),
  );
  return (
    <>
      <div className="no-print">
        <PageHeader title="Etiquetas" description="Cole a etiqueta na peça ou na embalagem. O QR abre a ficha do item direto pelo celular (para quem tem acesso à empresa)." back={{ href: "/estoque", label: "Estoque" }} />
      </div>
      {labels.length === 0 ? (
        <div className="surface">
          <EmptyState icon={QrCode} title="Selecione itens para gerar etiquetas">
            No Estoque, marque os itens e clique em “Etiquetas”, ou use o menu “Imprimir etiqueta” na ficha do item.
          </EmptyState>
        </div>
      ) : (
        <LabelSheet labels={labels} />
      )}
    </>
  );
}
