"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="surface mt-6">
      <EmptyState
        icon={TriangleAlert}
        title="Não foi possível carregar esta tela"
        action={
          <>
            <Button variant="primary" onClick={reset}>
              Tentar de novo
            </Button>
            <Button onClick={() => (window.location.href = "/")}>Ir para o início</Button>
          </>
        }
      >
        {typeof navigator !== "undefined" && !navigator.onLine
          ? "Você está sem conexão. Os dados não puderam ser buscados; nada foi alterado."
          : "Houve uma falha ao buscar os dados. Nenhuma informação foi perdida."}
        {error.digest && <span className="mt-2 block text-[0.75rem] text-ink-3">Código para suporte: {error.digest}</span>}
      </EmptyState>
    </div>
  );
}
