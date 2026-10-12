import { can, type Permission, type Role } from "@/lib/permissions";
import { prisma, type Tx } from "./db";
import { ForbiddenError, translateDbError, DomainError } from "./errors";

/**
 * Contexto de execução de toda operação de negócio: quem está agindo e em qual
 * empresa. Toda leitura/escrita do domínio recebe um Ctx e filtra por ctx.orgId.
 */
export type Ctx = {
  orgId: string;
  userId: string;
  role: Role;
  ip?: string | null;
};

export function requirePerm(ctx: Ctx, permission: Permission) {
  if (!can(ctx.role, permission)) throw new ForbiddenError();
}

export function hasPerm(ctx: Ctx, permission: Permission) {
  return can(ctx.role, permission);
}

/**
 * Executa uma operação atômica. Erros de constraint viram mensagens de negócio.
 * READ COMMITTED + atualizações condicionais (UPDATE … WHERE status = …) garantem
 * que apenas uma de duas operações concorrentes sobre o mesmo item vença.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T> {
  try {
    return await prisma.$transaction(fn, { timeout: opts?.timeoutMs ?? 20_000, maxWait: 10_000 });
  } catch (err) {
    throw translateDbError(err);
  }
}

/**
 * Proteção contra duplo envio: a chave é gravada dentro da mesma transação.
 * Um segundo envio com a mesma chave espera o primeiro terminar e então falha
 * na unicidade — devolvemos o resultado já registrado em vez de repetir a operação.
 */
export async function withIdempotency<T extends Record<string, unknown>>(
  ctx: Ctx,
  key: string | null | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!key) return withTx(fn);
  try {
    return await withTx(async (tx) => {
      await tx.idempotencyKey.create({ data: { orgId: ctx.orgId, key } });
      const result = await fn(tx);
      await tx.idempotencyKey.update({
        where: { orgId_key: { orgId: ctx.orgId, key } },
        data: { result: JSON.parse(JSON.stringify(result)) },
      });
      return result;
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e?.code === "CONFLICT" || e?.code === "P2002") {
      const existing = await prisma.idempotencyKey.findUnique({ where: { orgId_key: { orgId: ctx.orgId, key } } });
      if (existing?.result) return existing.result as T;
      if (existing) throw new DomainError("Esta operação já foi enviada e está sendo processada.", "DUPLICATE");
    }
    throw err;
  }
}
