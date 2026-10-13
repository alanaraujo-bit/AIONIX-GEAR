import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { financeOverview } from "@/server/queries/finance";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/layout";
import { todayInput } from "@/lib/dates";
import { AccountsManager } from "./accounts-manager";

export const metadata: Metadata = { title: "Contas e categorias" };

export default async function AccountsPage() {
  const app = await requirePage("finance.view");
  const ov = await financeOverview(app.ctx);
  const openings = await prisma.moneyTransaction.findMany({ where: { orgId: app.ctx.orgId, kind: "OPENING", reversalOfId: null }, select: { id: true, accountId: true, amountCents: true, direction: true } });
  const reversed = new Set((await prisma.moneyTransaction.findMany({ where: { orgId: app.ctx.orgId, reversalOfId: { in: openings.map((o) => o.id) } }, select: { reversalOfId: true } })).map((r) => r.reversalOfId));
  return (
    <>
      <PageHeader back={{ href: "/financeiro", label: "Financeiro" }} title="Contas e categorias" description="Onde o dinheiro fica (caixa, banco, carteiras) e como despesas e receitas são classificadas." />
      <AccountsManager
        canManage={app.can("finance.manage")}
        today={todayInput(app.tz)}
        accounts={ov.balances.map((b) => {
          const op = openings.find((o) => o.accountId === b.id && !reversed.has(o.id));
          return { id: b.id, name: b.name, kind: b.kind, archived: b.archived, balanceCents: b.balanceCents, openingCents: op ? (op.direction === "IN" ? op.amountCents : -op.amountCents) : null };
        })}
        categories={ov.categories.map((c) => ({ id: c.id, name: c.name, type: c.type, group: c.group, archived: c.archived }))}
      />
    </>
  );
}
