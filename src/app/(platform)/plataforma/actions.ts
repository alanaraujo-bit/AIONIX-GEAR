"use server";

import { getSession } from "@/server/session";
import { prisma } from "@/server/db";
import { toActionError, type ActionResult } from "@/server/action";
import { provisionOrganization } from "@/server/domain/team";
import { createSetupLink } from "@/server/auth/core";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";

async function admin() {
  const s = await getSession();
  if (!s?.user.isPlatformAdmin) throw new ForbiddenError("Área restrita à administração da plataforma.");
  return s;
}

export async function createOrgAction(input: { orgName: string; ownerEmail: string; ownerName: string; isDemo?: boolean }): Promise<ActionResult<{ setupToken: string | null; orgId: string }>> {
  try {
    const s = await admin();
    const r = await provisionOrganization({ ...input, actorUserId: s.user.id });
    return { ok: true, data: { setupToken: r.setupToken, orgId: r.orgId }, message: "Empresa criada" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setOrgStateAction(input: { orgId: string; suspended?: boolean; plan?: string }): Promise<ActionResult<null>> {
  try {
    const s = await admin();
    const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
    if (!org) throw new NotFoundError("Empresa");
    if (input.plan !== undefined && !/^[a-z0-9-]{2,30}$/.test(input.plan)) throw new DomainError("Plano inválido (use letras minúsculas, números e hífen).");
    await prisma.organization.update({
      where: { id: org.id },
      data: { suspendedAt: input.suspended === undefined ? undefined : input.suspended ? new Date() : null, plan: input.plan ?? undefined },
    });
    if (input.suspended) await prisma.session.updateMany({ where: { activeOrgId: org.id }, data: { activeOrgId: null } });
    await prisma.auditLog.create({ data: { orgId: org.id, userId: s.user.id, action: "platform.org.update", summary: input.suspended !== undefined ? (input.suspended ? "Empresa suspensa pela plataforma" : "Empresa reativada pela plataforma") : `Plano alterado para ${input.plan}` } });
    return { ok: true, data: null, message: "Empresa atualizada" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function ownerResetLinkAction(orgId: string): Promise<ActionResult<{ token: string; email: string }>> {
  try {
    const s = await admin();
    const owner = await prisma.membership.findFirst({ where: { orgId, role: "OWNER" }, include: { user: true }, orderBy: { createdAt: "asc" } });
    if (!owner) throw new NotFoundError("Proprietário");
    const token = await createSetupLink(owner.userId, owner.user.passwordHash ? "RESET" : "SETUP", 48);
    await prisma.auditLog.create({ data: { orgId, userId: s.user.id, action: "platform.reset_link", summary: `Link de acesso gerado pela plataforma para ${owner.user.email}` } });
    return { ok: true, data: { token, email: owner.user.email } };
  } catch (e) {
    return toActionError(e);
  }
}
