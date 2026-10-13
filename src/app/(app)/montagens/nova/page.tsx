import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { contactOptions } from "@/server/queries/common";
import { PageHeader } from "@/components/ui/layout";
import { BuildForm } from "../build-form";

export const metadata: Metadata = { title: "Nova montagem" };

export default async function NewBuildPage() {
  const app = await requirePage("builds.manage");
  const contacts = await contactOptions(app.ctx);
  return (
    <>
      <PageHeader title="Iniciar montagem" description="Dê um nome e um objetivo. As peças você escolhe na próxima tela." back={{ href: "/montagens", label: "Montagens" }} />
      <BuildForm contacts={contacts} defaultWarrantyDays={app.settings.defaultWarrantyDays} ownLaborHourCents={app.settings.ownLaborHourCents} />
    </>
  );
}
