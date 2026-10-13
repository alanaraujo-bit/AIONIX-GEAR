"use client";

import * as React from "react";
import Link from "next/link";
import { HandCoins, MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money, Table, Th, Td } from "@/components/ui/layout";
import { SettleSheet, type TitleView } from "@/components/app/titles";
import { waLink } from "@/components/app/share";
import { TITLE_STATUS_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";

type Row = TitleView & { contact: string | null; contactId: string | null; whatsapp: string | null; href: string | null };

export function TitlesTable({ rows, accounts, canSettle, canWriteOff, tz }: { rows: Row[]; accounts: { id: string; name: string }[]; canSettle: boolean; canWriteOff: boolean; tz: string }) {
  const [settling, setSettling] = React.useState<Row | null>(null);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
  void canWriteOff;
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Vencimento</Th>
            <Th>Descrição</Th>
            <Th className="hidden md:table-cell">Pessoa</Th>
            <Th align="right">Valor</Th>
            <Th align="right">Em aberto</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const due = new Date(r.dueDate).toLocaleDateString("sv-SE", { timeZone: tz });
            const overdue = (r.status === "OPEN" || r.status === "PARTIAL") && due < today;
            return (
              <tr key={r.id}>
                <Td className={cn("whitespace-nowrap text-sm", overdue ? "font-medium text-negative" : "text-ink-2")}>
                  {new Date(r.dueDate).toLocaleDateString("pt-BR", { timeZone: tz })}
                  {overdue && <span className="block text-[0.75rem]">atrasado</span>}
                </Td>
                <Td>
                  {r.href ? (
                    <Link href={r.href} className="text-sm text-ink no-underline hover:text-accent-text">
                      {r.description}
                    </Link>
                  ) : (
                    <span className="text-sm">{r.description}</span>
                  )}
                  <span className="mt-0.5 block">
                    <Badge tone={r.status === "PAID" ? "positive" : r.status === "PARTIAL" ? "info" : r.status === "CANCELLED" ? "muted" : "warning"}>{TITLE_STATUS_LABEL[r.status]}</Badge>
                  </span>
                </Td>
                <Td className="hidden text-sm md:table-cell">
                  {r.contactId ? <Link href={`/contatos/${r.contactId}`}>{r.contact}</Link> : <span className="text-ink-3">—</span>}
                </Td>
                <Td align="right">
                  <Money cents={r.amountCents} />
                </Td>
                <Td align="right">
                  <Money cents={r.openCents} className={r.openCents ? "font-medium" : "text-ink-3"} />
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    {r.direction === "RECEIVABLE" && r.whatsapp && r.openCents > 0 && (
                      <Button asChild size="icon-sm" variant="ghost" aria-label="Cobrar no WhatsApp" title="Lembrar o cliente no WhatsApp">
                        <a
                          href={waLink(`Olá, ${r.contact?.split(" ")[0] ?? ""}! Passando para lembrar do valor de ${formatBRL(r.openCents)} referente a "${r.description}", com vencimento em ${new Date(r.dueDate).toLocaleDateString("pt-BR", { timeZone: tz })}. Qualquer dúvida, estou à disposição.`, r.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle />
                        </a>
                      </Button>
                    )}
                    {canSettle && (r.status === "OPEN" || r.status === "PARTIAL") && (
                      <Button size="sm" onClick={() => setSettling(r)}>
                        <HandCoins /> {r.direction === "RECEIVABLE" ? "Receber" : "Pagar"}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <SettleSheet title={settling} onClose={() => setSettling(null)} accounts={accounts} tz={tz} />
    </>
  );
}
