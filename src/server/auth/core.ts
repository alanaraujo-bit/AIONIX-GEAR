import { prisma } from "../db";
import { DomainError, assert } from "../errors";
import { hashPassword, verifyPassword, randomToken, hashToken, passwordProblem } from "./crypto";
import type { Role } from "@/lib/permissions";

export const SESSION_DAYS = 30;
const LOGIN_WINDOW_MIN = 15;
const MAX_FAILS_PER_KEY = 8;

/**
 * Limite de tentativas: falhas recentes por e-mail e por IP. Bloqueia temporariamente
 * sem revelar se o e-mail existe.
 */
async function assertNotThrottled(keys: string[]) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000);
  for (const key of keys) {
    const fails = await prisma.loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } });
    if (fails >= MAX_FAILS_PER_KEY) {
      throw new DomainError(`Muitas tentativas. Aguarde ${LOGIN_WINDOW_MIN} minutos e tente novamente.`, "RATE_LIMIT");
    }
  }
}

export async function authenticate(email: string, password: string, ip: string | null) {
  const normalized = email.trim().toLowerCase();
  const keys = [`email:${normalized}`, ...(ip ? [`ip:${ip}`] : [])];
  await assertNotThrottled(keys);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  const ok = user && !user.disabledAt ? await verifyPassword(password, user.passwordHash) : false;
  await prisma.loginAttempt.createMany({ data: keys.map((key) => ({ key, success: !!ok })) });
  if (!ok || !user) throw new DomainError("E-mail ou senha incorretos.", "AUTH");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export async function createSession(userId: string, opts: { ip?: string | null; userAgent?: string | null; orgId?: string | null } = {}) {
  const token = randomToken();
  const memberships = await prisma.membership.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const activeOrgId = opts.orgId && memberships.some((m) => m.orgId === opts.orgId) ? opts.orgId : memberships[0]?.orgId ?? null;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      activeOrgId,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export type ResolvedSession = {
  sessionId: string;
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  org: { id: string; name: string; slug: string; isDemo: boolean; timezone: string; settings: unknown; onboardedAt: Date | null; suspendedAt: Date | null } | null;
  role: Role | null;
  orgs: { id: string; name: string; role: Role }[];
};

export async function resolveSession(token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return null;
  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  let active: (typeof memberships)[number] | null = memberships.find((m) => m.orgId === session.activeOrgId) ?? memberships[0] ?? null;
  if (active && active.org.suspendedAt) active = memberships.find((m) => !m.org.suspendedAt) ?? null;
  // Renovação deslizante (no máximo a cada 10 min para não escrever em toda requisição).
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000 || (active && active.orgId !== session.activeOrgId)) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000), activeOrgId: active?.orgId ?? null },
    });
  }
  return {
    sessionId: session.id,
    user: { id: session.user.id, email: session.user.email, name: session.user.name, isPlatformAdmin: session.user.isPlatformAdmin },
    org: active
      ? {
          id: active.org.id,
          name: active.org.name,
          slug: active.org.slug,
          isDemo: active.org.isDemo,
          timezone: active.org.timezone,
          settings: active.org.settings,
          onboardedAt: active.org.onboardedAt,
          suspendedAt: active.org.suspendedAt,
        }
      : null,
    role: (active?.role as Role) ?? null,
    orgs: memberships.filter((m) => !m.org.suspendedAt).map((m) => ({ id: m.orgId, name: m.org.name, role: m.role as Role })),
  };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function switchOrg(sessionId: string, userId: string, orgId: string) {
  const m = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  if (!m) throw new DomainError("Você não tem acesso a esta empresa.", "FORBIDDEN");
  await prisma.session.update({ where: { id: sessionId }, data: { activeOrgId: orgId } });
}

// ───────────── Links de definição de senha (sem e-mail: entregues pelo administrador) ─────────────

export async function createSetupLink(userId: string, purpose: "SETUP" | "RESET", hours = 72) {
  const token = randomToken();
  await prisma.setupToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.setupToken.create({
    data: { tokenHash: hashToken(token), userId, purpose, expiresAt: new Date(Date.now() + hours * 3_600_000) },
  });
  return token;
}

export async function inspectSetupToken(token: string) {
  const t = await prisma.setupToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return null;
  return { purpose: t.purpose, email: t.user.email, name: t.user.name };
}

export async function consumeSetupToken(token: string, password: string, name?: string | null) {
  const t = await prisma.setupToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new DomainError("Este link expirou ou já foi usado. Peça um novo ao administrador.");
  const problem = passwordProblem(password, t.user.email);
  if (problem) throw new DomainError(problem);
  const passwordHash = await hashPassword(password);
  const used = await prisma.setupToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) throw new DomainError("Este link já foi usado.");
  await prisma.user.update({ where: { id: t.userId }, data: { passwordHash, ...(name?.trim() ? { name: name.trim() } : {}) } });
  // Redefinição encerra sessões antigas.
  await prisma.session.deleteMany({ where: { userId: t.userId } });
  await prisma.auditLog.create({ data: { userId: t.userId, action: t.purpose === "RESET" ? "auth.password_reset" : "auth.password_setup", summary: "Senha definida via link" } });
  return t.user;
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert(await verifyPassword(current, user.passwordHash), "Senha atual incorreta.");
  const problem = passwordProblem(next, user.email);
  if (problem) throw new DomainError(problem);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await prisma.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  await prisma.auditLog.create({ data: { userId, action: "auth.password_change", summary: "Senha alterada" } });
}
