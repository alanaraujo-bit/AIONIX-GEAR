import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireApp } from "@/server/session";
import { TitlesPage } from "../titles-page";

export const metadata: Metadata = { title: "A receber" };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ situacao?: string; q?: string }> }) {
  const app = await requireApp();
  if (!(app.can("finance.view") || app.can("sales.manage"))) redirect("/sem-permissao");
  return <TitlesPage app={app} direction="RECEIVABLE" sp={await searchParams} />;
}
