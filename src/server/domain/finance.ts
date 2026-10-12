import { z } from "zod";
import type { Tx } from "../db";
import { prisma } from "../db";
import { requirePerm, withIdempotency, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, ConflictError, assert } from "../errors";
import { audit, resultEntry, reverseResultEntries } from "./shared";
import { splitEven } from "@/lib/money";
import { systemCategoryId } from "./org";

export const PAYMENT_METHODS = ["PIX", "CASH", "DEBIT", "CREDIT", "TRANSFER", "BOLETO", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  TRANSFER: "Transferência",
  BOLETO: "Boleto",
  OTHER: "Outro",
};

type Direction = "IN" | "OUT";

async function assertAccount(tx: Tx, ctx: Ctx, accountId: string) {
  const acc = await tx.moneyAccount.findFirst({ where: { id: accountId, orgId: ctx.orgId } });
  if (!acc) throw new NotFoundError("Conta");
  if (acc.archived) throw new DomainError(`A conta "${acc.name}" está arquivada.`);
  return acc;
}

export async function recordTransaction(
  tx: Tx,
  ctx: Ctx,
  t: {
    accountId: string;
    direction: Direction;
    amountCents: number;
    date?: Date;
    kind: string;
    method?: string | null;
    categoryId?: string | null;
    contactId?: string | null;
    description: string;
    refType?: string | null;
    refId?: string | null;
    transferGroupId?: string | null;
  },
) {
  assert(Number.isInteger(t.amountCents) && t.amountCents > 0, "O valor do movimento deve ser maior que zero.");
  await assertAccount(tx, ctx, t.accountId);
  return tx.moneyTransaction.create({
    data: {
      orgId: ctx.orgId,
      createdById: ctx.userId,
      accountId: t.accountId,
      direction: t.direction,
      amountCents: t.amountCents,
      date: t.date ?? new Date(),
      kind: t.kind,
      method: t.method ?? undefined,
      categoryId: t.categoryId ?? undefined,
      contactId: t.contactId ?? undefined,
      description: t.description,
      refType: t.refType ?? undefined,
      refId: t.refId ?? undefined,
      transferGroupId: t.transferGroupId ?? undefined,
    },
  });
}

/** Estorno de movimento: cria um movimento oposto vinculado; nunca apaga o original. */
export async function reverseTransaction(tx: Tx, ctx: Ctx, transactionId: string, reason: string, date = new Date()) {
  const orig = await tx.moneyTransaction.findFirst({ where: { id: transactionId, orgId: ctx.orgId } });
  if (!orig) throw new NotFoundError("Movimento");
  const already = await tx.moneyTransaction.findUnique({ where: { reversalOfId: orig.id } });
  if (already) throw new ConflictError("Este movimento já foi estornado.");
  if (orig.reversalOfId) throw new DomainError("Não é possível estornar um estorno.");
  return tx.moneyTransaction.create({
    data: {
      orgId: ctx.orgId,
      createdById: ctx.userId,
      accountId: orig.accountId,
      direction: orig.direction === "IN" ? "OUT" : "IN",
      amountCents: orig.amountCents,
      date,
      kind: orig.kind,
      method: orig.method,
      categoryId: orig.categoryId,
      contactId: orig.contactId,
      description: `Estorno: ${orig.description} — ${reason}`,
      refType: orig.refType,
      refId: orig.refId,
      reversalOfId: orig.id,
    },
  });
}

export async function createTitle(
  tx: Tx,
  ctx: Ctx,
  t: {
    direction: "RECEIVABLE" | "PAYABLE";
    contactId?: string | null;
    description: string;
    amountCents: number;
    dueDate: Date;
    sourceType: string;
    sourceId?: string | null;
    categoryId?: string | null;
    method?: string | null;
    installmentNo?: number;
    installmentCount?: number;
  },
) {
  assert(t.amountCents > 0, "O valor do título deve ser maior que zero.");
  return tx.title.create({
    data: {
      orgId: ctx.orgId,
      direction: t.direction,
      contactId: t.contactId ?? undefined,
      description: t.description,
      amountCents: t.amountCents,
      dueDate: t.dueDate,
      sourceType: t.sourceType,
      sourceId: t.sourceId ?? undefined,
      categoryId: t.categoryId ?? undefined,
      method: t.method ?? undefined,
      installmentNo: t.installmentNo,
      installmentCount: t.installmentCount,
    },
  });
}

function txKindFor(title: { direction: string; sourceType: string }): string {
  const map: Record<string, [string, string]> = {
    SALE: ["SALE_RECEIPT", "REFUND_OUT"],
    PURCHASE: ["REFUND_IN", "PURCHASE_PAYMENT"],
    TRADE: ["TRADE_CASH_IN", "TRADE_CASH_OUT"],
    EXPENSE: ["INCOME_RECEIPT", "EXPENSE_PAYMENT"],
    INCOME: ["INCOME_RECEIPT", "EXPENSE_PAYMENT"],
    BUILD: ["INCOME_RECEIPT", "BUILD_EXPENSE"],
    ITEM_COST: ["INCOME_RECEIPT", "ITEM_COST"],
    CONSIGNMENT: ["INCOME_RECEIPT", "CONSIGNMENT_PAYOUT"],
    SALE_REFUND: ["SALE_RECEIPT", "REFUND_OUT"],
    MANUAL: ["INCOME_RECEIPT", "EXPENSE_PAYMENT"],
  };
  const pair = map[title.sourceType] ?? ["INCOME_RECEIPT", "EXPENSE_PAYMENT"];
  return title.direction === "RECEIVABLE" ? pair[0] : pair[1];
}

/**
 * Baixa (total ou parcial) de um título. Atualização condicional: nunca permite
 * baixar mais que o saldo, mesmo com duas baixas simultâneas.
 */
export async function settleTitle(
  tx: Tx,
  ctx: Ctx,
  s: {
    titleId: string;
    amountCents: number;
    kind?: "PAYMENT" | "TRADE_IN" | "CANCELLATION" | "FEE";
    accountId?: string | null;
    method?: string | null;
    date?: Date;
    note?: string | null;
  },
) {
  const kind = s.kind ?? "PAYMENT";
  assert(Number.isInteger(s.amountCents) && s.amountCents > 0, "Informe um valor maior que zero.");
  const title = await tx.title.findFirst({ where: { id: s.titleId, orgId: ctx.orgId } });
  if (!title) throw new NotFoundError("Título");
  if (title.status === "CANCELLED") throw new DomainError("Este título está cancelado.");
  const n = await tx.$executeRaw`
    UPDATE "Title" SET "settledCents" = "settledCents" + ${s.amountCents},
      "status" = CASE WHEN "settledCents" + ${s.amountCents} >= "amountCents" THEN 'PAID' ELSE 'PARTIAL' END
    WHERE "id" = ${title.id} AND "orgId" = ${ctx.orgId} AND "status" IN ('OPEN','PARTIAL')
      AND "settledCents" + ${s.amountCents} <= "amountCents"`;
  if (n !== 1) {
    throw new ConflictError(
      `O valor ultrapassa o saldo em aberto deste título (${((title.amountCents - title.settledCents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`,
    );
  }
  let transactionId: string | null = null;
  if (kind === "PAYMENT") {
    assert(s.accountId, "Escolha a conta em que o dinheiro entrou ou saiu.");
    const t = await recordTransaction(tx, ctx, {
      accountId: s.accountId,
      direction: title.direction === "RECEIVABLE" ? "IN" : "OUT",
      amountCents: s.amountCents,
      date: s.date,
      kind: txKindFor(title),
      method: s.method ?? title.method,
      categoryId: title.categoryId,
      contactId: title.contactId,
      description: title.description,
      refType: title.sourceType,
      refId: title.sourceId,
    });
    transactionId = t.id;
  }
  const settlement = await tx.settlement.create({
    data: {
      orgId: ctx.orgId,
      titleId: title.id,
      amountCents: s.amountCents,
      kind,
      transactionId,
      date: s.date ?? new Date(),
      note: s.note ?? undefined,
      createdById: ctx.userId,
    },
  });
  return { settlement, transactionId };
}

/** Cancela o saldo em aberto de um título (o que já foi pago continua registrado). */
export async function cancelTitleRemainder(tx: Tx, ctx: Ctx, titleId: string, reason: string) {
  const title = await tx.title.findFirst({ where: { id: titleId, orgId: ctx.orgId } });
  if (!title) throw new NotFoundError("Título");
  if (title.status === "CANCELLED" || title.status === "PAID") return title;
  const open = title.amountCents - title.settledCents;
  if (title.settledCents === 0) {
    return tx.title.update({
      where: { id: title.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
  }
  // Parcialmente pago: o saldo restante é baixado como cancelamento, preservando o pago.
  await settleTitle(tx, ctx, { titleId: title.id, amountCents: open, kind: "CANCELLATION", note: reason });
  return tx.title.update({ where: { id: title.id }, data: { cancelReason: reason } });
}

export type PaymentNow = { amountCents: number; accountId: string; method: string; date?: Date };
export type RemainderPlan = { installments: number; firstDueDate: Date; intervalDays?: number; method?: string | null };

/**
 * Plano de pagamento usado por vendas, compras e catiras.
 * - Pagamentos "agora" viram um título liquidado na hora (dinheiro rastreável).
 * - O restante vira N parcelas em aberto.
 */
export async function applyPaymentPlan(
  tx: Tx,
  ctx: Ctx,
  p: {
    direction: "RECEIVABLE" | "PAYABLE";
    totalCents: number;
    contactId?: string | null;
    sourceType: string;
    sourceId: string;
    description: string;
    categoryId?: string | null;
    now: PaymentNow[];
    remainder?: RemainderPlan | null;
    date?: Date;
  },
) {
  const nowTotal = p.now.reduce((a, b) => a + b.amountCents, 0);
  for (const pay of p.now) assert(pay.amountCents > 0, "Pagamentos devem ter valor maior que zero.");
  assert(nowTotal <= p.totalCents, "Os pagamentos informados ultrapassam o total.");
  const remaining = p.totalCents - nowTotal;
  const titles: string[] = [];
  if (nowTotal > 0) {
    const t = await createTitle(tx, ctx, {
      direction: p.direction,
      contactId: p.contactId,
      description: p.description,
      amountCents: nowTotal,
      dueDate: p.date ?? new Date(),
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      categoryId: p.categoryId,
      method: p.now[0]?.method,
    });
    titles.push(t.id);
    for (const pay of p.now) {
      await settleTitle(tx, ctx, {
        titleId: t.id,
        amountCents: pay.amountCents,
        accountId: pay.accountId,
        method: pay.method,
        date: pay.date ?? p.date,
      });
    }
  }
  if (remaining > 0) {
    const n = Math.max(1, Math.min(48, p.remainder?.installments ?? 1));
    const parts = splitEven(remaining, n);
    const first = p.remainder?.firstDueDate ?? p.date ?? new Date();
    const interval = p.remainder?.intervalDays ?? 30;
    for (let i = 0; i < n; i++) {
      const due = new Date(first.getTime() + i * interval * 86_400_000);
      const t = await createTitle(tx, ctx, {
        direction: p.direction,
        contactId: p.contactId,
        description: n > 1 ? `${p.description} — parcela ${i + 1}/${n}` : p.description,
        amountCents: parts[i],
        dueDate: due,
        sourceType: p.sourceType,
        sourceId: p.sourceId,
        categoryId: p.categoryId,
        method: p.remainder?.method,
        installmentNo: n > 1 ? i + 1 : undefined,
        installmentCount: n > 1 ? n : undefined,
      });
      titles.push(t.id);
    }
  }
  return { titles, paidNowCents: nowTotal, openCents: remaining };
}

/**
 * Desfaz os efeitos financeiros de uma origem (venda, compra, catira):
 * estorna os pagamentos efetivos, cancela saldos em aberto e devolve
 * o total que havia sido efetivamente pago/recebido.
 */
export async function unwindSourceFinance(
  tx: Tx,
  ctx: Ctx,
  src: { sourceType: string; sourceId: string },
  reason: string,
  opts: { refundAccountId?: string | null; date?: Date; direction?: "RECEIVABLE" | "PAYABLE" } = {},
) {
  const titles = await tx.title.findMany({
    where: {
      orgId: ctx.orgId,
      sourceType: src.sourceType,
      sourceId: src.sourceId,
      status: { not: "CANCELLED" },
      ...(opts.direction ? { direction: opts.direction } : {}),
    },
    include: { settlements: true },
  });
  let moneyReversedCents = 0;
  for (const t of titles) {
    const payments = t.settlements.filter((s) => s.kind === "PAYMENT" && s.transactionId && !s.reversalOfId);
    for (const pay of payments) {
      const reversed = await tx.settlement.findUnique({ where: { reversalOfId: pay.id } });
      if (reversed) continue;
      const orig = await tx.moneyTransaction.findUniqueOrThrow({ where: { id: pay.transactionId! } });
      // Devolve o dinheiro pela conta escolhida (ou pela mesma conta do pagamento original).
      const accountId = opts.refundAccountId ?? orig.accountId;
      const rev = await recordTransaction(tx, ctx, {
        accountId,
        direction: orig.direction === "IN" ? "OUT" : "IN",
        amountCents: orig.amountCents,
        date: opts.date,
        kind: orig.direction === "IN" ? "REFUND_OUT" : "REFUND_IN",
        method: orig.method,
        categoryId: orig.categoryId,
        contactId: orig.contactId,
        description: `Estorno: ${orig.description} — ${reason}`,
        refType: orig.refType,
        refId: orig.refId,
      });
      await tx.settlement.create({
        data: {
          orgId: ctx.orgId,
          titleId: t.id,
          amountCents: -pay.amountCents,
          kind: "PAYMENT",
          transactionId: rev.id,
          reversalOfId: pay.id,
          note: reason,
          createdById: ctx.userId,
          date: opts.date ?? new Date(),
        },
      });
      moneyReversedCents += orig.amountCents;
    }
    await tx.title.update({
      where: { id: t.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
  }
  return { moneyReversedCents };
}

// ───────────────────────── Operações expostas ao usuário ─────────────────────────

const settleSchema = z.object({
  titleId: z.string().min(1),
  amountCents: z.number().int().positive(),
  accountId: z.string().min(1),
  method: z.enum(PAYMENT_METHODS),
  date: z.coerce.date().optional(),
  note: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().optional(),
});

export async function registerSettlement(ctx: Ctx, raw: z.input<typeof settleSchema>) {
  const input = settleSchema.parse(raw);
  const title = await prisma.title.findFirst({ where: { id: input.titleId, orgId: ctx.orgId } });
  if (!title) throw new NotFoundError("Título");
  // Vendas podem receber pagamentos de vendas; o resto exige o financeiro.
  if (title.direction === "RECEIVABLE" && title.sourceType === "SALE") requirePerm(ctx, "sales.manage");
  else requirePerm(ctx, "finance.manage");
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const r = await settleTitle(tx, ctx, {
      titleId: input.titleId,
      amountCents: input.amountCents,
      accountId: input.accountId,
      method: input.method,
      date: input.date,
      note: input.note,
    });
    await audit(tx, ctx, "finance.settle", `Baixa de ${input.amountCents / 100} em "${title.description}"`, {
      entityType: "Title",
      entityId: title.id,
    });
    return { transactionId: r.transactionId };
  });
}

const expenseSchema = z.object({
  kind: z.enum(["EXPENSE", "INCOME"]),
  categoryId: z.string().min(1),
  description: z.string().trim().min(2).max(200),
  amountCents: z.number().int().positive(),
  date: z.coerce.date(),
  contactId: z.string().optional().nullable(),
  paid: z.boolean(),
  accountId: z.string().optional().nullable(),
  method: z.enum(PAYMENT_METHODS).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  installments: z.number().int().min(1).max(48).optional(),
  idempotencyKey: z.string().optional(),
});

/** Despesa ou receita operacional (não ligada a estoque). Reconhecida no resultado na data informada. */
export async function createExpenseOrIncome(ctx: Ctx, raw: z.input<typeof expenseSchema>) {
  requirePerm(ctx, "finance.manage");
  const input = expenseSchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const cat = await tx.financeCategory.findFirst({ where: { id: input.categoryId, orgId: ctx.orgId } });
    if (!cat) throw new NotFoundError("Categoria");
    if (cat.group === "SYSTEM" || cat.group === "CAPITAL") {
      throw new DomainError("Esta categoria é usada automaticamente pelo sistema. Escolha outra.");
    }
    const isExpense = input.kind === "EXPENSE";
    assert((cat.type === "EXPENSE") === isExpense, "A categoria não corresponde ao tipo do lançamento.");
    const sourceId = crypto.randomUUID();
    const kind =
      cat.group === "SALES_EXPENSE"
        ? "SALES_EXPENSE"
        : cat.group === "OTHER_EXPENSE"
          ? "OTHER_EXPENSE"
          : isExpense
            ? "OPERATING_EXPENSE"
            : "OTHER_INCOME";
    const entry = await resultEntry(tx, ctx, {
      date: input.date,
      kind,
      amountCents: input.amountCents,
      description: input.description,
      refType: input.kind,
      refId: sourceId,
      contactId: input.contactId,
      categoryId: cat.id,
    });
    if (input.paid) assert(input.accountId, "Escolha a conta usada no pagamento.");
    await applyPaymentPlan(tx, ctx, {
      direction: isExpense ? "PAYABLE" : "RECEIVABLE",
      totalCents: input.amountCents,
      contactId: input.contactId,
      sourceType: input.kind,
      sourceId,
      description: input.description,
      categoryId: cat.id,
      date: input.date,
      now: input.paid ? [{ amountCents: input.amountCents, accountId: input.accountId!, method: input.method ?? "PIX", date: input.date }] : [],
      remainder: input.paid ? null : { installments: input.installments ?? 1, firstDueDate: input.dueDate ?? input.date },
    });
    await audit(tx, ctx, `finance.${input.kind.toLowerCase()}`, `${isExpense ? "Despesa" : "Receita"}: ${input.description}`, {
      entityType: "ResultEntry",
      entityId: entry?.id,
    });
    return { id: sourceId };
  });
}

/** Cancela uma despesa/receita: estorna o resultado e o dinheiro já movimentado. */
export async function cancelExpenseOrIncome(ctx: Ctx, input: { refId: string; reason: string }) {
  requirePerm(ctx, "finance.manage");
  assert(input.reason?.trim().length >= 3, "Informe o motivo do cancelamento.");
  return withTx(async (tx) => {
    const entry = await tx.resultEntry.findFirst({
      where: { orgId: ctx.orgId, refId: input.refId, refType: { in: ["EXPENSE", "INCOME"] }, reversalOfId: null },
    });
    if (!entry) throw new NotFoundError("Lançamento");
    await reverseResultEntries(tx, ctx, { refType: entry.refType!, refId: entry.refId! }, new Date(), input.reason);
    await unwindSourceFinance(tx, ctx, { sourceType: entry.refType!, sourceId: entry.refId! }, input.reason);
    await audit(tx, ctx, "finance.cancel", `Lançamento cancelado: ${entry.description}`, { data: { reason: input.reason } });
    return { ok: true };
  });
}

const capitalSchema = z.object({
  kind: z.enum(["CAPITAL_IN", "WITHDRAWAL"]),
  accountId: z.string().min(1),
  amountCents: z.number().int().positive(),
  date: z.coerce.date(),
  description: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().optional(),
});

/** Aporte do dono ou retirada: mexe no caixa, não no lucro. */
export async function recordCapitalMovement(ctx: Ctx, raw: z.input<typeof capitalSchema>) {
  requirePerm(ctx, "finance.manage");
  const input = capitalSchema.parse(raw);
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const categoryId = await systemCategoryId(tx, ctx.orgId, input.kind);
    const t = await recordTransaction(tx, ctx, {
      accountId: input.accountId,
      direction: input.kind === "CAPITAL_IN" ? "IN" : "OUT",
      amountCents: input.amountCents,
      date: input.date,
      kind: input.kind,
      categoryId,
      description: input.description || (input.kind === "CAPITAL_IN" ? "Aporte de capital" : "Retirada do dono"),
    });
    await audit(tx, ctx, "finance.capital", `${input.kind === "CAPITAL_IN" ? "Aporte" : "Retirada"} registrado`, {
      entityType: "MoneyTransaction",
      entityId: t.id,
    });
    return { id: t.id };
  });
}

const transferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountCents: z.number().int().positive(),
  date: z.coerce.date(),
  description: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().optional(),
});

export async function transferBetweenAccounts(ctx: Ctx, raw: z.input<typeof transferSchema>) {
  requirePerm(ctx, "finance.manage");
  const input = transferSchema.parse(raw);
  assert(input.fromAccountId !== input.toAccountId, "Escolha contas diferentes.");
  return withIdempotency(ctx, input.idempotencyKey, async (tx) => {
    const group = crypto.randomUUID();
    const desc = input.description || "Transferência entre contas";
    await recordTransaction(tx, ctx, {
      accountId: input.fromAccountId,
      direction: "OUT",
      amountCents: input.amountCents,
      date: input.date,
      kind: "TRANSFER",
      description: desc,
      transferGroupId: group,
    });
    await recordTransaction(tx, ctx, {
      accountId: input.toAccountId,
      direction: "IN",
      amountCents: input.amountCents,
      date: input.date,
      kind: "TRANSFER",
      description: desc,
      transferGroupId: group,
    });
    await audit(tx, ctx, "finance.transfer", desc);
    return { id: group };
  });
}

export async function accountBalances(orgId: string, until?: Date) {
  const accounts = await prisma.moneyAccount.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  const sums = await prisma.moneyTransaction.groupBy({
    by: ["accountId", "direction"],
    where: { orgId, ...(until ? { date: { lte: until } } : {}) },
    _sum: { amountCents: true },
  });
  return accounts.map((a) => {
    const inn = sums.find((s) => s.accountId === a.id && s.direction === "IN")?._sum.amountCents ?? 0;
    const out = sums.find((s) => s.accountId === a.id && s.direction === "OUT")?._sum.amountCents ?? 0;
    return { ...a, balanceCents: inn - out };
  });
}

const reconcileSchema = z.object({
  accountId: z.string().min(1),
  actualBalanceCents: z.number().int(),
  date: z.coerce.date(),
  note: z.string().trim().min(3).max(300),
});

/**
 * Conciliação: compara o saldo do sistema com o saldo real (extrato/contagem).
 * A diferença vira um ajuste explícito, com motivo e trilha — nunca uma edição silenciosa.
 */
export async function reconcileAccount(ctx: Ctx, raw: z.input<typeof reconcileSchema>) {
  requirePerm(ctx, "finance.manage");
  const input = reconcileSchema.parse(raw);
  return withTx(async (tx) => {
    await assertAccount(tx, ctx, input.accountId);
    const agg = await tx.moneyTransaction.groupBy({
      by: ["direction"],
      where: { orgId: ctx.orgId, accountId: input.accountId },
      _sum: { amountCents: true },
    });
    const system =
      (agg.find((a) => a.direction === "IN")?._sum.amountCents ?? 0) -
      (agg.find((a) => a.direction === "OUT")?._sum.amountCents ?? 0);
    const diff = input.actualBalanceCents - system;
    if (diff === 0) return { diffCents: 0 };
    const categoryId = await systemCategoryId(tx, ctx.orgId, "ADJUSTMENT");
    const t = await recordTransaction(tx, ctx, {
      accountId: input.accountId,
      direction: diff > 0 ? "IN" : "OUT",
      amountCents: Math.abs(diff),
      date: input.date,
      kind: "ADJUSTMENT",
      categoryId,
      description: `Ajuste de conciliação: ${input.note}`,
    });
    await resultEntry(tx, ctx, {
      date: input.date,
      kind: diff > 0 ? "OTHER_INCOME" : "OTHER_EXPENSE",
      amountCents: Math.abs(diff),
      description: `Ajuste de conciliação: ${input.note}`,
      refType: "RECONCILIATION",
      refId: t.id,
      categoryId,
    });
    await audit(tx, ctx, "finance.reconcile", `Conciliação com diferença de ${diff / 100}`, {
      entityType: "MoneyAccount",
      entityId: input.accountId,
      data: { systemCents: system, actualCents: input.actualBalanceCents, note: input.note },
    });
    return { diffCents: diff };
  });
}

const accountSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["CASH", "BANK", "DIGITAL", "OTHER"]),
  openingBalanceCents: z.number().int().optional().nullable(),
  openingDate: z.coerce.date().optional(),
});

export async function createAccount(ctx: Ctx, raw: z.input<typeof accountSchema>) {
  requirePerm(ctx, "finance.manage");
  const input = accountSchema.parse(raw);
  return withTx(async (tx) => {
    const acc = await tx.moneyAccount.create({ data: { orgId: ctx.orgId, name: input.name, kind: input.kind } });
    if (input.openingBalanceCents) {
      await recordTransaction(tx, ctx, {
        accountId: acc.id,
        direction: input.openingBalanceCents > 0 ? "IN" : "OUT",
        amountCents: Math.abs(input.openingBalanceCents),
        date: input.openingDate ?? new Date(),
        kind: "OPENING",
        description: "Saldo inicial",
      });
    }
    await audit(tx, ctx, "finance.account.create", `Conta criada: ${acc.name}`, { entityType: "MoneyAccount", entityId: acc.id });
    return { id: acc.id };
  });
}

export async function setOpeningBalance(ctx: Ctx, input: { accountId: string; amountCents: number; date: Date }) {
  requirePerm(ctx, "finance.manage");
  return withTx(async (tx) => {
    await assertAccount(tx, ctx, input.accountId);
    const existing = await tx.moneyTransaction.findFirst({
      where: { orgId: ctx.orgId, accountId: input.accountId, kind: "OPENING", reversalOfId: null },
    });
    if (existing) {
      const rev = await tx.moneyTransaction.findUnique({ where: { reversalOfId: existing.id } });
      if (!rev) await reverseTransaction(tx, ctx, existing.id, "Saldo inicial corrigido", input.date);
    }
    if (input.amountCents !== 0) {
      await recordTransaction(tx, ctx, {
        accountId: input.accountId,
        direction: input.amountCents > 0 ? "IN" : "OUT",
        amountCents: Math.abs(input.amountCents),
        date: input.date,
        kind: "OPENING",
        description: "Saldo inicial",
      });
    }
    await audit(tx, ctx, "finance.opening", "Saldo inicial definido", { entityType: "MoneyAccount", entityId: input.accountId });
    return { ok: true };
  });
}
