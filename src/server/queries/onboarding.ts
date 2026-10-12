import "server-only";
import { prisma } from "../db";
import { hasPerm, type Ctx } from "../context";

export type OnboardingStatus = Awaited<ReturnType<typeof onboardingStatus>>;

/** Primeiros passos derivados dos dados reais (sem checklist manual). */
export async function onboardingStatus(ctx: Ctx) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { onboardedAt: true } });
  const [locations, items, opening, members] = await Promise.all([
    prisma.location.count({ where: { orgId: ctx.orgId } }),
    prisma.item.count({ where: { orgId: ctx.orgId, status: { not: "VOID" } } }),
    prisma.moneyTransaction.count({ where: { orgId: ctx.orgId } }),
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
  ]);
  const owner = hasPerm(ctx, "settings.manage");
  const steps = [
    { key: "accounts", label: "Informe o saldo atual das suas contas", detail: "Dinheiro em espécie e conta PIX — o caixa começa certo.", href: "/financeiro/contas", done: opening > 0, show: hasPerm(ctx, "finance.manage") },
    { key: "locations", label: "Cadastre onde as peças ficam", detail: "Quarto, prateleira, gaveta, caixa… locais dentro de locais.", href: "/estoque/locais", done: locations > 1, show: hasPerm(ctx, "inventory.edit") },
    { key: "items", label: "Coloque seu estoque no sistema", detail: "Item a item com foto, ou importe a planilha que você já tem.", href: items ? "/estoque" : "/estoque/novo?modo=inicial", done: items > 0, show: hasPerm(ctx, "inventory.edit") },
    { key: "team", label: "Convide quem ajuda (opcional)", detail: "Cada pessoa com acesso só ao que precisa.", href: "/configuracoes/equipe", done: members > 1, show: hasPerm(ctx, "team.manage") },
  ].filter((s) => s.show);
  return { done: !!org.onboardedAt || !owner || steps.every((s) => s.done), steps, canDismiss: owner };
}
