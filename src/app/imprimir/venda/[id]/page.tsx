import { notFound } from "next/navigation";
import { requirePage } from "@/server/session";
import { saleDocument } from "@/server/queries/documents";
import { SaleDocument } from "@/components/app/sale-document";
import { PrintBar } from "../../print-bar";

export const metadata = { title: "Imprimir" };

export default async function PrintSale({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("sales.manage");
  const { id } = await params;
  const doc = await saleDocument(app.ctx.orgId, id, app.tz);
  if (!doc) notFound();
  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <PrintBar />
      <div className="mx-auto max-w-[820px] shadow-sm print:shadow-none">
        <SaleDocument d={doc} />
      </div>
    </div>
  );
}
