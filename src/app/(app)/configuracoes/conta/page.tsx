import type { Metadata } from "next";
import { requireApp } from "@/server/session";
import { prisma } from "@/server/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { AccountForms } from "./account-forms";

export const metadata: Metadata = { title: "Minha conta" };

export default async function MyAccountPage() {
  const app = await requireApp();
  const sessions = await prisma.session.count({ where: { userId: app.ctx.userId, expiresAt: { gt: new Date() } } });
  return <AccountForms name={app.session.user.name} email={app.session.user.email} role={ROLE_LABEL[app.session.role!]} sessions={sessions} />;
}
