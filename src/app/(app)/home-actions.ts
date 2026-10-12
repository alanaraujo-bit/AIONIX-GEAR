"use server";

import { act } from "@/server/action";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/context";

export async function finishOnboardingAction() {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "settings.manage");
    await prisma.organization.update({ where: { id: ctx.orgId }, data: { onboardedAt: new Date() } });
    return null;
  });
}
