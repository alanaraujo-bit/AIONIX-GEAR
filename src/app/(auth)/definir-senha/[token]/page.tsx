import type { Metadata } from "next";
import Link from "next/link";
import { inspectSetupToken } from "@/server/auth/core";
import { PasswordForm } from "../../password-form";
import { setPasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Definir senha" };

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await inspectSetupToken(token);
  if (!info) {
    return (
      <>
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">Link inválido ou expirado</h1>
        <p className="mt-2 text-ink-2">Links de senha valem por tempo limitado e funcionam uma única vez. Peça um novo link a quem administra sua conta.</p>
        <Link href="/entrar" className="mt-6 inline-block text-accent-text">
          Ir para o login
        </Link>
      </>
    );
  }
  async function submit(input: { name?: string; password: string }) {
    "use server";
    return setPasswordAction({ token, ...input });
  }
  return (
    <>
      <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">{info.purpose === "RESET" ? "Redefinir senha" : "Boas-vindas"}</h1>
      <p className="mt-1.5 text-ink-2">
        {info.purpose === "RESET" ? "Crie uma nova senha para " : "Crie a senha de acesso para "}
        <span className="font-medium text-ink">{info.email}</span>.
      </p>
      <PasswordForm submit={submit} askName={info.purpose === "SETUP"} defaultName={info.name} cta={info.purpose === "RESET" ? "Salvar nova senha" : "Criar senha e entrar"} />
    </>
  );
}
