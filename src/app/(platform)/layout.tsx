import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { requirePlatformAdmin } from "@/server/session";
import { logoutAction } from "../(auth)/actions";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
        <Link href="/plataforma" className="no-underline">
          <Logo />
        </Link>
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[0.75rem] font-medium text-bg">Administração da plataforma</span>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {s.org && <Link href="/">Voltar para {s.org.name}</Link>}
          <form action={logoutAction}>
            <button className="text-ink-3 hover:text-ink">Sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
