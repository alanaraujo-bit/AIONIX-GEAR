import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="surface mt-6">
      <EmptyState
        icon={SearchX}
        title="Não encontramos este registro"
        action={
          <Button asChild variant="primary">
            <Link href="/">Voltar ao início</Link>
          </Button>
        }
      >
        Ele pode ter sido removido, o link está incompleto, ou pertence a outra empresa — cada empresa só enxerga os próprios dados.
      </EmptyState>
    </div>
  );
}
