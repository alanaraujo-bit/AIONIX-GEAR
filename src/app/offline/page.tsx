import { WifiOff } from "lucide-react";
import { Logo } from "@/components/app/logo";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Logo />
      <div className="mt-10 grid size-12 place-items-center rounded-[12px] border border-line bg-surface-2 text-ink-3">
        <WifiOff className="size-5" />
      </div>
      <h1 className="mt-4 text-[1.5rem] font-semibold">Sem conexão com a internet</h1>
      <p className="mt-2 text-ink-2">Esta página ainda não foi aberta neste aparelho, então não há uma cópia para mostrar.</p>
      <p className="mt-2 text-ink-2">
        Estoque, vendas e financeiro só são alterados com conexão — assim nenhum registro fica pela metade ou duplicado. Quando a internet voltar, é só recarregar.
      </p>
    </main>
  );
}
