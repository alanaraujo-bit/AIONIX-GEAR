"use server";

import { act } from "@/server/action";
import { prisma } from "@/server/db";
import { requirePerm, withTx } from "@/server/context";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/domain/shared";
import {
  registerSettlement,
  createExpenseOrIncome,
  cancelExpenseOrIncome,
  recordCapitalMovement,
  transferBetweenAccounts,
  reconcileAccount,
  createAccount,
  setOpeningBalance,
  cancelTitleRemainder,
} from "@/server/domain/finance";
import { parseDateInput } from "@/lib/dates";

export async function settleAction(input: { titleId: string; amountCents: number; accountId: string; method: string; dateInput?: string; note?: string | null; idempotencyKey?: string }) {
  return act(({ ctx, tz }) =>
    registerSettlement(ctx, {
      titleId: input.titleId,
      amountCents: input.amountCents,
      accountId: input.accountId,
      method: input.method as never,
      date: input.dateInput ? parseDateInput(input.dateInput, tz) ?? undefined : undefined,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    }), "Pagamento registrado");
}

export async function writeOffTitleAction(input: { titleId: string; reason: string }) {
  return act(async ({ ctx }) => {
    const t = await prisma.title.findFirst({ where: { id: input.titleId, orgId: ctx.orgId } });
    if (!t) throw new NotFoundError("Título");
    if (t.direction === "RECEIVABLE" && t.sourceType === "SALE") requirePerm(ctx, "sales.manage");
    requirePerm(ctx, "finance.manage");
    if ((input.reason ?? "").trim().length < 3) throw new DomainError("Informe o motivo.");
    return withTx(async (tx) => {
      await cancelTitleRemainder(tx, ctx, t.id, input.reason);
      await audit(tx, ctx, "finance.writeoff", `Saldo cancelado: ${t.description}`, { entityType: "Title", entityId: t.id, data: { reason: input.reason } });
      return null;
    });
  }, "Saldo em aberto cancelado");
}

export async function expenseAction(input: {
  kind: "EXPENSE" | "INCOME";
  categoryId: string;
  description: string;
  amountCents: number;
  dateInput: string;
  contactId?: string | null;
  paid: boolean;
  accountId?: string | null;
  method?: string | null;
  dueDateInput?: string | null;
  installments?: number;
  idempotencyKey?: string;
}) {
  return act(({ ctx, tz }) =>
    createExpenseOrIncome(ctx, {
      ...input,
      method: (input.method as never) ?? null,
      date: parseDateInput(input.dateInput, tz) ?? new Date(),
      dueDate: input.dueDateInput ? parseDateInput(input.dueDateInput, tz) : null,
    }), input.kind === "EXPENSE" ? "Despesa lançada" : "Receita lançada");
}

export async function cancelExpenseAction(input: { refId: string; reason: string }) {
  return act(({ ctx }) => cancelExpenseOrIncome(ctx, input), "Lançamento cancelado e estornado");
}

export async function capitalAction(input: { kind: "CAPITAL_IN" | "WITHDRAWAL"; accountId: string; amountCents: number; dateInput: string; description?: string; idempotencyKey?: string }) {
  return act(({ ctx, tz }) => recordCapitalMovement(ctx, { ...input, date: parseDateInput(input.dateInput, tz) ?? new Date() }), input.kind === "CAPITAL_IN" ? "Aporte registrado" : "Retirada registrada");
}

export async function transferAction(input: { fromAccountId: string; toAccountId: string; amountCents: number; dateInput: string; description?: string; idempotencyKey?: string }) {
  return act(({ ctx, tz }) => transferBetweenAccounts(ctx, { ...input, date: parseDateInput(input.dateInput, tz) ?? new Date() }), "Transferência registrada");
}

export async function reconcileAction(input: { accountId: string; actualBalanceCents: number; dateInput: string; note: string }) {
  return act(({ ctx, tz }) => reconcileAccount(ctx, { ...input, date: parseDateInput(input.dateInput, tz) ?? new Date() }));
}

export async function createAccountAction(input: { name: string; kind: "CASH" | "BANK" | "DIGITAL" | "OTHER"; openingBalanceCents?: number | null; openingDateInput?: string }) {
  return act(({ ctx, tz }) => createAccount(ctx, { ...input, openingDate: input.openingDateInput ? parseDateInput(input.openingDateInput, tz) ?? undefined : undefined }), "Conta criada");
}

export async function openingBalanceAction(input: { accountId: string; amountCents: number; dateInput: string }) {
  return act(({ ctx, tz }) => setOpeningBalance(ctx, { accountId: input.accountId, amountCents: input.amountCents, date: parseDateInput(input.dateInput, tz) ?? new Date() }), "Saldo inicial definido");
}

export async function renameAccountAction(input: { id: string; name: string; archived?: boolean }) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "finance.manage");
    const n = await prisma.moneyAccount.updateMany({ where: { id: input.id, orgId: ctx.orgId }, data: { name: input.name.trim(), archived: input.archived } });
    if (!n.count) throw new NotFoundError("Conta");
    return null;
  }, "Conta atualizada");
}

export async function saveFinanceCategoryAction(input: { id?: string | null; name: string; type: "INCOME" | "EXPENSE"; group: "OPERATING_EXPENSE" | "SALES_EXPENSE" | "OTHER_INCOME" | "OTHER_EXPENSE"; archived?: boolean }) {
  return act(async ({ ctx }) => {
    requirePerm(ctx, "finance.manage");
    const name = input.name.trim();
    if (name.length < 2) throw new DomainError("Dê um nome à categoria.");
    if (input.id) {
      const c = await prisma.financeCategory.findFirst({ where: { id: input.id, orgId: ctx.orgId } });
      if (!c) throw new NotFoundError("Categoria");
      if (c.group === "SYSTEM" || c.group === "CAPITAL") throw new DomainError("Categorias do sistema não podem ser alteradas.");
      await prisma.financeCategory.update({ where: { id: c.id }, data: { name, archived: input.archived ?? c.archived } });
      return { id: c.id };
    }
    const c = await prisma.financeCategory.create({ data: { orgId: ctx.orgId, name, type: input.type, group: input.group } });
    return { id: c.id };
  }, "Categoria salva");
}
