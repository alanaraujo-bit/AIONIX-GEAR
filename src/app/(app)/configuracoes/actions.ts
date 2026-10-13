"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { act } from "@/server/action";
import { prisma } from "@/server/db";
import { requirePerm, withTx } from "@/server/context";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/domain/shared";
import { readSettings } from "@/server/domain/org";
import { inviteMember, revokeInvitation, changeMemberRole, removeMember, memberResetLink } from "@/server/domain/team";
import { changePassword } from "@/server/auth/core";
import { SESSION_COOKIE } from "@/server/session";
import { hashToken } from "@/server/auth/crypto";
import type { Role } from "@/lib/permissions";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional().nullable(),
  document: z.string().trim().max(20).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal("")),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(2).optional().nullable(),
  timezone: z.string().trim().max(60),
  settings: z.object({
    targetMarginPct: z.number().min(0).max(90),
    staleDays: z.number().int().min(7).max(720),
    reservationDays: z.number().int().min(1).max(60),
    defaultWarrantyDays: z.number().int().min(0).max(3650),
    ownLaborHourCents: z.number().int().min(0).max(10_000_00),
    documentFooter: z.string().max(1000),
  }),
});

export async function saveOrgAction(input: z.input<typeof profileSchema>) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "settings.manage");
    const v = profileSchema.parse(input);
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: v.timezone });
    } catch {
      throw new DomainError("Fuso horário inválido.");
    }
    return withTx(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
      await tx.organization.update({
        where: { id: ctx.orgId },
        data: {
          name: v.name,
          legalName: v.legalName || null,
          document: v.document?.replace(/\D/g, "") || null,
          phone: v.phone || null,
          email: v.email || null,
          city: v.city || null,
          state: v.state?.toUpperCase() || null,
          timezone: v.timezone,
          settings: { ...readSettings(org.settings), ...v.settings },
        },
      });
      await audit(tx, ctx, "settings.update", "Dados e preferências da empresa atualizados");
      return null;
    });
  }, "Configurações salvas");
}

export async function saveCategoryAction(input: { id?: string | null; name: string; kind: string; archived?: boolean }) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "settings.manage");
    const name = input.name.trim();
    if (name.length < 2) throw new DomainError("Dê um nome à categoria.");
    if (input.id) {
      const c = await prisma.category.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Categoria");
      await prisma.category.update({ where: { id: c.id }, data: { name, kind: input.kind as never, archived: input.archived ?? c.archived } });
      return { id: c.id };
    }
    const c = await prisma.category.create({ data: { orgId: ctx.orgId, name, kind: input.kind as never } });
    return { id: c.id };
  }, "Categoria salva");
}

export async function inviteAction(input: { email: string; name?: string; role: Role }) {
  return act(({ ctx }) => inviteMember(ctx, input), "Convite criado");
}
export async function revokeInviteAction(id: string) {
  return act(({ ctx }) => revokeInvitation(ctx, id), "Convite revogado");
}
export async function changeRoleAction(input: { membershipId: string; role: Role }) {
  return act(({ ctx }) => changeMemberRole(ctx, input), "Papel atualizado");
}
export async function removeMemberAction(membershipId: string) {
  return act(({ ctx }) => removeMember(ctx, membershipId), "Pessoa removida da equipe");
}
export async function resetLinkAction(membershipId: string) {
  return act(({ ctx }) => memberResetLink(ctx, membershipId));
}

export async function updateProfileAction(input: { name: string }) {
  return act(async ({ ctx }) => {
    const name = input.name.trim();
    if (name.length < 2) throw new DomainError("Informe seu nome.");
    await prisma.user.update({ where: { id: ctx.userId }, data: { name } });
    return null;
  }, "Perfil atualizado");
}

export async function changePasswordAction(input: { current: string; next: string }) {
  return act(async ({ ctx }) => {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    const session = token ? await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
    await changePassword(ctx.userId, input.current, input.next, session?.id);
    return null;
  }, "Senha alterada. Outras sessões foram encerradas.");
}

export async function endOtherSessionsAction() {
  return act(async ({ ctx }) => {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    const keep = token ? hashToken(token) : "";
    const r = await prisma.session.deleteMany({ where: { userId: ctx.userId, tokenHash: { not: keep } } });
    return { ended: r.count };
  }, "Outras sessões encerradas");
}
