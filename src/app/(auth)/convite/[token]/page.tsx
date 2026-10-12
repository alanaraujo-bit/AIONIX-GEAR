import type { Metadata } from "next";
import Link from "next/link";
import { inspectInvitation } from "@/server/domain/team";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { PasswordForm } from "../../password-form";
import { acceptInviteAction } from "../../actions";

export const metadata: Metadata = { title: "Convite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await inspectInvitation(token);
  if (!inv) {
    return (
      <>
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">Convite indisponível</h1>
        <p className="mt-2 text-ink-2">Este convite expirou, foi cancelado ou já foi usado. Peça um novo a quem convidou você.</p>
        <Link href="/entrar" className="mt-6 inline-block text-accent-text">
          Ir para o login
        </Link>
      </>
    );
  }
  async function submit(input: { name?: string; password: string }) {
    "use server";
    return acceptInviteAction({ token, ...input });
  }
  return (
    <>
      <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">Entrar para {inv.orgName}</h1>
      <p className="mt-1.5 text-ink-2">
        Convite para <span className="font-medium text-ink">{inv.email}</span> com acesso de <span className="font-medium text-ink">{ROLE_LABEL[inv.role]}</span>.
      </p>
      <p className="mt-2 text-sm text-ink-3">{ROLE_DESCRIPTION[inv.role]}</p>
      <PasswordForm submit={submit} askName defaultName={inv.name ?? ""} existingAccount={inv.hasAccount} cta="Aceitar convite" />
    </>
  );
}
