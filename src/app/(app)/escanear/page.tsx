import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { locationOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Escanear" };

export default async function ScanPage() {
  const app = await requirePage("inventory.view");
  const locations = await locationOptions(app.ctx);
  return (
    <>
      <PageHeader title="Escanear código" description="Aponte a câmera para o QR da etiqueta ou para o código de barras/série da peça. Também dá para digitar." />
      <Scanner locations={locations.map((l) => ({ id: l.id, path: l.path }))} canMove={app.can("inventory.edit")} />
    </>
  );
}
