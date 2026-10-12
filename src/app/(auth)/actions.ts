"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession, consumeSetupToken, switchOrg } from "@/server/auth/core";
import { acceptInvitation } from "@/server/domain/team";
import { SESSION_COOKIE, clientIp, getSession } from "@/server/session";
import { toActionError, type ActionResult } from "@/server/action";

async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function startSession(userId: string, orgId?: string | null) {
  const ua = (await headers()).get("user-agent");
  const s = await createSession(userId, { ip: await clientIp(), userAgent: ua, orgId });
  await setSessionCookie(s.token, s.expiresAt);
}

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(input: { email: string; password: string; next?: string }): Promise<ActionResult<{ next: string }>> {
  try {
    const user = await authenticate(input.email ?? "", input.password ?? "", await clientIp());
    await startSession(user.id);
    return { ok: true, data: { next: safeNext(input.next) } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function logoutAction() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/entrar");
}

export async function setPasswordAction(input: { token: string; password: string; name?: string }): Promise<ActionResult<{ next: string }>> {
  try {
    const user = await consumeSetupToken(input.token, input.password, input.name);
    await startSession(user.id);
    return { ok: true, data: { next: "/" } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function acceptInviteAction(input: { token: string; name?: string; password: string }): Promise<ActionResult<{ next: string }>> {
  try {
    const r = await acceptInvitation(input);
    await startSession(r.userId, r.orgId);
    return { ok: true, data: { next: "/" } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function switchOrgAction(orgId: string): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) redirect("/entrar");
    await switchOrg(session.sessionId, session.user.id, orgId);
    return { ok: true, data: null };
  } catch (err) {
    return toActionError(err);
  }
}
