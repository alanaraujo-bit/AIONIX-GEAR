import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { prisma } from "@/server/db";
import { appOrigin } from "@/server/qr";
import { TeamManager } from "./team-manager";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const app = await requirePage("team.manage");
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({ where: { orgId: app.ctx.orgId }, include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { orgId: app.ctx.orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <TeamManager
      origin={await appOrigin()}
      myUserId={app.ctx.userId}
      myRole={app.ctx.role}
      orgName={app.org.name}
      tz={app.tz}
      members={members.map((m) => ({ id: m.id, role: m.role, userId: m.user.id, name: m.user.name, email: m.user.email, lastLoginAt: m.user.lastLoginAt }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt }))}
    />
  );
}
