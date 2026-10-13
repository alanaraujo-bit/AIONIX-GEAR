/** Erro de regra de negócio com mensagem pronta para o usuário (pt-BR). */
export class DomainError extends Error {
  readonly code: string;
  readonly fields?: Record<string, string>;
  constructor(message: string, code = "DOMAIN", fields?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fields = fields;
  }
}

/** Conflito de concorrência: outra operação mudou o registro antes desta. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

const FEMININE = new Set(["Conta", "Compra", "Venda", "Catira", "Montagem", "Categoria", "Linha", "Peça", "Despesa", "Contagem", "Importação", "Negociação", "Empresa"]);

export class NotFoundError extends DomainError {
  constructor(what = "Registro") {
    super(`${what} não ${FEMININE.has(what) ? "encontrada" : "encontrado"}.`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export function assert(condition: unknown, message: string, code = "DOMAIN"): asserts condition {
  if (!condition) throw new DomainError(message, code);
}

/** Traduz violações de constraint do Postgres em mensagens úteis. */
export function translateDbError(err: unknown): unknown {
  const e = err as { code?: string; message?: string; meta?: { constraint?: string; code?: string; message?: string }; cause?: unknown };
  const text = `${e?.message ?? ""} ${JSON.stringify(e?.meta ?? {})}`;
  if (/out of range for type integer|value out of range|integer out of range/i.test(text)) {
    return new DomainError("Valor acima do limite permitido (máximo R$ 9.999.999,99 por campo).", "VALIDATION");
  }
  if (text.includes("item_qty_nonneg")) return new ConflictError("Quantidade insuficiente em estoque para esta operação.");
  if (text.includes("buildpart_active_unit")) return new ConflictError("Esta unidade já está em outra montagem.");
  if (text.includes("title_amounts")) return new ConflictError("O valor informado ultrapassa o saldo em aberto.");
  if (e?.code === "P2002") return new ConflictError("Registro duplicado: já existe um registro com estes dados.");
  if (e?.code === "P2034" || text.includes("could not serialize")) {
    return new ConflictError("Outra operação alterou estes dados ao mesmo tempo. Tente novamente.");
  }
  return err;
}
