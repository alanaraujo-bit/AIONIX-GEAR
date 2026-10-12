"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fields?: Record<string, string>; code?: string };

/**
 * Executa uma server action com:
 * - chave de idempotência estável por formulário (duplo clique não duplica operação);
 * - aviso de conectividade (sem rede, nada é enviado e o usuário sabe disso);
 * - toast de sucesso/erro e atualização da página.
 */
export function useAction<I, T>(
  action: (input: I) => Promise<Result<T>>,
  opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; refresh?: boolean } = {},
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string>(crypto.randomUUID());

  const run = useCallback(
    (input: I | ((key: string) => I)) =>
      new Promise<Result<T>>((resolve) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const r: Result<T> = { ok: false, error: "Você está sem conexão. Nada foi enviado — tente de novo quando a internet voltar." };
          toast.error(r.error);
          setError(r.error);
          resolve(r);
          return;
        }
        startTransition(async () => {
          let r: Result<T>;
          try {
            const payload = typeof input === "function" ? (input as (key: string) => I)(keyRef.current) : input;
            r = await action(payload);
          } catch {
            r = { ok: false, error: "Não foi possível falar com o servidor. Verifique a conexão; se a operação já tiver sido registrada, ela aparecerá ao recarregar." };
          }
          if (r.ok) {
            setFields({});
            setError(null);
            keyRef.current = crypto.randomUUID();
            const msg = typeof opts.success === "function" ? opts.success(r.data) : opts.success ?? r.message;
            if (msg) toast.success(msg);
            opts.onSuccess?.(r.data);
            if (opts.refresh !== false) router.refresh();
          } else {
            setFields(r.fields ?? {});
            setError(r.error);
            toast.error(r.error);
          }
          resolve(r);
        });
      }),
    [action, opts, router],
  );

  return { run, pending, fields, error, setError };
}
