import Link from "next/link";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/server/session";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata = { title: "Acesso restrito" };

export default async function NoPermissionPage() {
  const app = await requireApp();
  return (
    <div className="surface mt-6">
      <EmptyState
        icon={Lock}
        title="Esta área não faz parte do seu acesso"
        action={
          <Button asChild variant="primary">
            <Link href="/">Voltar ao início</Link>
          </Button>
        }
      >
        Seu papel nesta empresa é <strong>{ROLE_LABEL[app.session.role!]}</strong>. Se precisar deste acesso, peça ao proprietário em Configurações › Equipe.
      </EmptyState>
    </div>
  );
}
