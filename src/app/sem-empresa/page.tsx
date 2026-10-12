import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { logoutAction } from "../(auth)/actions";

export const metadata = { title: "Sem empresa" };

export default function NoOrgPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Logo />
      <h1 className="mt-10 text-[1.5rem] font-semibold">Sua conta não está ligada a nenhuma empresa</h1>
      <p className="mt-2 text-ink-2">Peça um convite a quem administra a empresa, ou fale com o suporte da plataforma. Se você foi removido de uma equipe, seu acesso a ela foi encerrado.</p>
      <div className="mt-6 flex gap-3">
        <form action={logoutAction}>
          <button className="text-sm font-medium text-accent-text">Sair desta conta</button>
        </form>
        <Link href="/plataforma" className="text-sm text-ink-3">
          Painel da plataforma
        </Link>
      </div>
    </main>
  );
}
