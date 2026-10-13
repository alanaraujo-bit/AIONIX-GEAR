import type { Metadata } from "next";
import { requireApp } from "@/server/session";
import { prisma } from "@/server/db";
import { readSettings } from "@/server/domain/org";
import { OrgForm } from "./org-form";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const app = await requireApp();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: app.ctx.orgId } });
  const s = readSettings(org.settings);
  return (
    <OrgForm
      canEdit={app.can("settings.manage")}
      initial={{
        name: org.name,
        legalName: org.legalName ?? "",
        document: org.document ?? "",
        phone: org.phone ?? "",
        email: org.email ?? "",
        city: org.city ?? "",
        state: org.state ?? "",
        timezone: org.timezone,
        settings: s,
      }}
      plan={org.plan}
      slug={org.slug}
    />
  );
}
