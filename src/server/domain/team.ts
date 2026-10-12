import { z } from "zod";
import { prisma } from "../db";
import { requirePerm, withTx, type Ctx } from "../context";
import { DomainError, ForbiddenError, NotFoundError, assert } from "../errors";
import { audit } from "./shared";
import { createOrganization } from "./org";
import { randomToken, hashToken, hashPassword, verifyPassword, passwordProblem } from "../auth/crypto";
import { createSetupLink } from "../auth/core";
import type { Role } from "@/lib/permissions";

const INVITE_DAYS = 7;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["OWNER", "ADMIN", "SALES", "INVENTORY"]),
});

/** Convite por link (entregue por WhatsApp/mensagem). O token só é mostrado uma vez. */
export async function inviteMember(ctx: Ctx, raw: z.input<typeof inviteSchema>) {
  requirePerm(ctx, "team.manage");
  const input = inviteSchema.parse(raw);
  if (input.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError("Só o proprietário pode convidar outro proprietário.");
  return withTx(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      const m = await tx.membership.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: existingUser.id } } });
      if (m) throw new DomainError("Esta pessoa já faz parte da equipe.");
    }
    await tx.invitation.updateMany({
      where: { orgId: ctx.orgId, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const token = randomToken();
    const inv = await tx.invitation.create({
      data: {
        orgId: ctx.orgId,
        email: input.email,
        name: input.name ?? null,
        role: input.role,
        tokenHash: hashToken(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
    });
    await audit(tx, ctx, "team.invite", `Convite enviado para ${input.email} (${input.role})`, { entityType: "Invitation", entityId: inv.id });
    return { id: inv.id, token };
  });
}

export async function revokeInvitation(ctx: Ctx, id: string) {
  requirePerm(ctx, "team.manage");
  return withTx(async (tx) => {
    const n = await tx.invitation.updateMany({ where: { id, orgId: ctx.orgId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (n.count !== 1) throw new NotFoundError("Convite");
    await audit(tx, ctx, "team.invite.revoke", "Convite revogado", { entityType: "Invitation", entityId: id });
    return { ok: true };
  });
}

export async function inspectInvitation(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { org: true } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  return { email: inv.email, name: inv.name, role: inv.role as Role, orgName: inv.org.name, hasAccount: !!user?.passwordHash };
}

/**
 * Aceita convite. Se a pessoa já tem conta, precisa confirmar com a senha dela;
 * senão, cria a conta com a senha escolhida agora.
 */
export async function acceptInvitation(input: { token: string; name?: string | null; password: string }) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    throw new DomainError("Este convite expirou ou já foi usado. Peça um novo.");
  }
  let user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (user?.passwordHash) {
    assert(await verifyPassword(input.password, user.passwordHash), "Senha incorreta para a conta existente.");
  } else {
    const problem = passwordProblem(input.password, inv.email);
    if (problem) throw new DomainError(problem);
    assert(input.name?.trim() || inv.name || user?.name, "Informe seu nome.");
  }
  const passwordHash = user?.passwordHash ? undefined : await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) throw new DomainError("Este convite já foi usado.");
    if (!user) {
      user = await tx.user.create({ data: { email: inv.email, name: (input.name?.trim() || inv.name || inv.email).slice(0, 120), passwordHash } });
    } else if (passwordHash) {
      user = await tx.user.update({ where: { id: user.id }, data: { passwordHash, name: input.name?.trim() || user.name } });
    }
    await tx.membership.upsert({
      where: { orgId_userId: { orgId: inv.orgId, userId: user.id } },
      create: { orgId: inv.orgId, userId: user.id, role: inv.role },
      update: {},
    });
    await tx.auditLog.create({ data: { orgId: inv.orgId, userId: user.id, action: "team.join", summary: `${user.email} entrou na equipe (${inv.role})` } });
    return { userId: user.id, orgId: inv.orgId };
  });
}

async function ownersCount(orgId: string) {
  return prisma.membership.count({ where: { orgId, role: "OWNER" } });
}

export async function changeMemberRole(ctx: Ctx, input: { membershipId: string; role: Role }) {
  requirePerm(ctx, "team.manage");
  return withTx(async (tx) => {
    const m = await tx.membership.findFirst({ where: { id: input.membershipId, orgId: ctx.orgId }, include: { user: true } });
    if (!m) throw new NotFoundError("Membro");
    if ((m.role === "OWNER" || input.role === "OWNER") && ctx.role !== "OWNER") throw new ForbiddenError("Só o proprietário pode alterar proprietários.");
    if (m.role === "OWNER" && input.role !== "OWNER" && (await ownersCount(ctx.orgId)) <= 1) {
      throw new DomainError("A empresa precisa de pelo menos um proprietário.");
    }
    await tx.membership.update({ where: { id: m.id }, data: { role: input.role } });
    await audit(tx, ctx, "team.role", `${m.user.email}: ${m.role} → ${input.role}`, { entityType: "Membership", entityId: m.id });
    return { ok: true };
  });
}

export async function removeMember(ctx: Ctx, membershipId: string) {
  requirePerm(ctx, "team.manage");
  return withTx(async (tx) => {
    const m = await tx.membership.findFirst({ where: { id: membershipId, orgId: ctx.orgId }, include: { user: true } });
    if (!m) throw new NotFoundError("Membro");
    if (m.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError();
    if (m.role === "OWNER" && (await ownersCount(ctx.orgId)) <= 1) throw new DomainError("A empresa precisa de pelo menos um proprietário.");
    await tx.membership.delete({ where: { id: m.id } });
    // Encerra sessões dessa pessoa que estavam nesta empresa.
    await tx.session.deleteMany({ where: { userId: m.userId, activeOrgId: ctx.orgId } });
    await audit(tx, ctx, "team.remove", `${m.user.email} removido da equipe`, { entityType: "Membership", entityId: m.id });
    return { ok: true };
  });
}

/** Link de redefinição de senha para um membro (sem envio de e-mail). */
export async function memberResetLink(ctx: Ctx, membershipId: string) {
  requirePerm(ctx, "team.manage");
  const m = await prisma.membership.findFirst({ where: { id: membershipId, orgId: ctx.orgId }, include: { user: true } });
  if (!m) throw new NotFoundError("Membro");
  if (m.role === "OWNER" && m.userId !== ctx.userId && ctx.role !== "OWNER") throw new ForbiddenError();
  // Pessoa que participa de outras empresas: a redefinição afetaria essas contas também.
  const others = await prisma.membership.count({ where: { userId: m.userId, orgId: { not: ctx.orgId } } });
  if (others > 0) throw new DomainError("Esta pessoa participa de outras empresas; ela mesma deve trocar a senha ou pedir ao suporte da plataforma.");
  const token = await createSetupLink(m.userId, "RESET", 24);
  await prisma.auditLog.create({ data: { orgId: ctx.orgId, userId: ctx.userId, action: "team.reset_link", summary: `Link de redefinição gerado para ${m.user.email}` } });
  return { token };
}

// ─────────────────────────── Plataforma (SaaS) ───────────────────────────

/** Cria uma empresa com seu proprietário, que define a própria senha pelo link. */
export async function provisionOrganization(input: { orgName: string; ownerEmail: string; ownerName: string; isDemo?: boolean; actorUserId?: string | null }) {
  const email = input.ownerEmail.trim().toLowerCase();
  assert(z.string().email().safeParse(email).success, "E-mail do proprietário inválido.");
  assert(input.orgName.trim().length >= 2, "Informe o nome da empresa.");
  const result = await prisma.$transaction(async (tx) => {
    const org = await createOrganization(tx, { name: input.orgName, isDemo: input.isDemo });
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) user = await tx.user.create({ data: { email, name: input.ownerName.trim() || email } });
    await tx.membership.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
    await tx.auditLog.create({
      data: { orgId: org.id, userId: input.actorUserId ?? null, action: "platform.org.create", summary: `Empresa criada: ${org.name} (proprietário ${email})` },
    });
    return { org, user };
  });
  const setupToken = result.user.passwordHash ? null : await createSetupLink(result.user.id, "SETUP", 72);
  return { orgId: result.org.id, orgSlug: result.org.slug, userId: result.user.id, setupToken };
}
