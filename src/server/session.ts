import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, type ResolvedSession } from "./auth/core";
import type { Ctx } from "./context";
import { can, type Permission } from "@/lib/permissions";
import { readSettings, type OrgSettings } from "./domain/org";
import { DEFAULT_TZ } from "@/lib/dates";

export const SESSION_COOKIE = "ag_session";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Sessão da requisição atual (memorizada por requisição). */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
});

export type AppContext = {
  ctx: Ctx;
  session: ResolvedSession;
  org: NonNullable<ResolvedSession["org"]>;
  settings: OrgSettings;
  tz: string;
  can: (p: Permission) => boolean;
};

/**
 * Contexto obrigatório para páginas e ações do app. Sem sessão → login.
 * Sem empresa → tela de "sem acesso". A empresa vem SEMPRE da sessão no servidor,
 * nunca de parâmetro enviado pelo navegador.
 */
export const requireApp = cache(async (): Promise<AppContext> => {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (!session.org || !session.role) redirect("/sem-empresa");
  const ip = await clientIp();
  const ctx: Ctx = { orgId: session.org.id, userId: session.user.id, role: session.role, ip };
  return {
    ctx,
    session,
    org: session.org,
    settings: readSettings(session.org.settings),
    tz: session.org.timezone || DEFAULT_TZ,
    can: (p: Permission) => can(session.role, p),
  };
});

/** Exige uma permissão para abrir a página; sem ela, mostra a tela de acesso negado. */
export async function requirePage(permission: Permission): Promise<AppContext> {
  const app = await requireApp();
  if (!app.can(permission)) redirect(`/sem-permissao?p=${permission}`);
  return app;
}

export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (!session.user.isPlatformAdmin) redirect("/");
  return session;
}
