import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { saleDocument } from "@/server/queries/documents";
import { SaleDocument } from "@/components/app/sale-document";
import { PrintBar } from "../../imprimir/print-bar";

export const metadata: Metadata = { title: "Orçamento", robots: { index: false, follow: false } };

/** Link público de leitura (opt-in por venda). Mostra só o que o cliente deve ver: sem custos. */
export default async function PublicSale({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const sale = await prisma.sale.findUnique({ where: { shareToken: token }, select: { id: true, orgId: true } });
  if (!sale) notFound();
  const org = await prisma.organization.findUnique({ where: { id: sale.orgId }, select: { timezone: true, suspendedAt: true } });
  if (!org || org.suspendedAt) notFound();
  const doc = await saleDocument(sale.orgId, sale.id, org.timezone);
  if (!doc) notFound();
  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <PrintBar />
      <div className="mx-auto max-w-[820px] shadow-sm print:shadow-none">
        <SaleDocument d={{ ...doc, contact: doc.contact ? { name: doc.contact.name } : null }} />
      </div>
    </div>
  );
}
