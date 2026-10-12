import "server-only";
import { z } from "zod";
import { DomainError } from "./errors";
import { requireApp, type AppContext } from "./session";

z.config(z.locales.pt());

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string>; code?: string };

function zodFields(err: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Envelope das server actions: resolve o contexto da sessão no servidor, chama o
 * domínio e converte erros em mensagens para a interface. Erros inesperados são
 * registrados e nunca vazam detalhes internos.
 */
export async function act<T>(fn: (app: AppContext) => Promise<T>, okMessage?: string): Promise<ActionResult<T>> {
  try {
    const app = await requireApp();
    const data = await fn(app);
    return { ok: true, data, message: okMessage };
  } catch (err) {
    return toActionError(err);
  }
}

export function toActionError(err: unknown): ActionResult<never> {
  // redirect()/notFound() do Next precisam continuar propagando.
  const digest = (err as { digest?: string })?.digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"))) throw err;
  if (err instanceof DomainError) return { ok: false, error: err.message, code: err.code, fields: err.fields };
  if (err instanceof z.ZodError) {
    const fields = zodFields(err);
    const first = err.issues[0];
    const label = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, error: `Revise os dados informados${label}: ${first?.message ?? "valor inválido"}.`, fields, code: "VALIDATION" };
  }
  console.error("[action] erro inesperado", err);
  return { ok: false, error: "Algo deu errado do nosso lado. Nada foi alterado — tente novamente em instantes.", code: "INTERNAL" };
}
