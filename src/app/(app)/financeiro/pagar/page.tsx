import type { Metadata } from "next";
import { requirePage } from "@/server/session";
import { TitlesPage } from "../titles-page";

export const metadata: Metadata = { title: "A pagar" };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ situacao?: string; q?: string }> }) {
  const app = await requirePage("finance.view");
  return <TitlesPage app={app} direction="PAYABLE" sp={await searchParams} />;
}
