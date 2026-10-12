import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session?.org) redirect("/");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">Entrar</h1>
      <p className="mt-1.5 text-ink-2">Acesse a operação da sua empresa.</p>
      <LoginForm next={next} />
      <p className="mt-8 text-sm text-ink-3">
        Esqueceu a senha? Peça ao proprietário da empresa um link de redefinição em <span className="text-ink-2">Configurações › Equipe</span>.
      </p>
    </>
  );
}
