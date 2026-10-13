import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/session";
import { prisma } from "@/server/db";
import { appOrigin } from "@/server/qr";
import { PageHeader } from "@/components/ui/layout";
import { PlatformConsole } from "./console";

export const metadata: Metadata = { title: "Plataforma" };

/** Administração SaaS: só metadados e uso agregado — nunca os dados de negócio das empresas. */
export default async function PlatformPage() {
  await requirePlatformAdmin();
  const orgs = await prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
  const ids = orgs.map((o) => o.id);
  const [members, items, sales, lastActivity, owners] = await Promise.all([
    prisma.membership.groupBy({ by: ["orgId"], where: { orgId: { in: ids } }, _count: true }),
    prisma.item.groupBy({ by: ["orgId"], where: { orgId: { in: ids }, status: { not: "VOID" } }, _count: true }),
    prisma.sale.groupBy({ by: ["orgId"], where: { orgId: { in: ids }, status: "CONFIRMED" }, _count: true }),
    prisma.auditLog.groupBy({ by: ["orgId"], where: { orgId: { in: ids } }, _max: { createdAt: true } }),
    prisma.membership.findMany({ where: { orgId: { in: ids }, role: "OWNER" }, include: { user: { select: { email: true, name: true, lastLoginAt: true } } } }),
  ]);
  const storage = await prisma.attachment.groupBy({ by: ["orgId"], where: { orgId: { in: ids } }, _sum: { sizeBytes: true } });
  return (
    <>
      <PageHeader title="Plataforma" description="Empresas clientes, planos e uso. Daqui não é possível ver estoque, clientes ou finanças de nenhuma empresa — o isolamento vale também para a administração." />
      <PlatformConsole
        origin={await appOrigin()}
        orgs={orgs.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          isDemo: o.isDemo,
          suspended: !!o.suspendedAt,
          createdAt: o.createdAt,
          members: members.find((m) => m.orgId === o.id)?._count ?? 0,
          items: items.find((m) => m.orgId === o.id)?._count ?? 0,
          sales: sales.find((m) => m.orgId === o.id)?._count ?? 0,
          storageBytes: storage.find((m) => m.orgId === o.id)?._sum.sizeBytes ?? 0,
          lastActivity: lastActivity.find((m) => m.orgId === o.id)?._max.createdAt ?? null,
          owners: owners.filter((w) => w.orgId === o.id).map((w) => ({ email: w.user.email, name: w.user.name, lastLoginAt: w.user.lastLoginAt })),
        }))}
      />
    </>
  );
}
