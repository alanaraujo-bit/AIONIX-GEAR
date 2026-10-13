import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle, Phone, Mail, AtSign, MapPin } from "lucide-react";
import { requireApp } from "@/server/session";
import { getContactDetail } from "@/server/queries/contacts";
import { accountOptions } from "@/server/queries/common";
import { PageHeader, Section, Money, Callout } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemStatusBadge } from "@/components/app/status";
import { TitleList } from "@/components/app/titles";
import { waLink } from "@/components/app/share";
import { SALE_STATUS_LABEL, TRADE_STATUS_LABEL } from "@/lib/labels";
import { STAGE_LABEL } from "@/server/domain/opportunities";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ContactSheetButton } from "../contact-sheet";
import { ContactMenu } from "./contact-menu";
import { ContactNote } from "./contact-note";

export const metadata: Metadata = { title: "Contato" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requireApp();
  if (!(app.can("contacts.manage") || app.can("purchases.manage") || app.can("trades.manage"))) redirect("/sem-permissao");
  const { id } = await params;
  const d = await getContactDetail(app.ctx, id);
  if (!d) notFound();
  const c = d.contact;
  const accounts = await accountOptions(app.ctx);
  const receivable = d.titles.filter((t) => t.direction === "RECEIVABLE").reduce((a, t) => a + t.openCents, 0);
  const payable = d.titles.filter((t) => t.direction === "PAYABLE").reduce((a, t) => a + t.openCents, 0);
  const totalSales = d.sales.filter((s) => s.status === "CONFIRMED").reduce((a, s) => a + s.totalCents, 0);
  const totalPurch = d.purchases.filter((s) => s.status === "CONFIRMED").reduce((a, s) => a + s.totalCents, 0);
  return (
    <>
      <PageHeader
        back={{ href: "/contatos", label: "Contatos" }}
        title={c.name}
        meta={
          <>
            {c.isCustomer && <Badge tone="accent">Cliente</Badge>}
            {c.isSupplier && <Badge tone="info">Fornecedor</Badge>}
            {c.archived && <Badge tone="muted">Arquivado</Badge>}
            {c.anonymizedAt && <Badge tone="muted">Dados pessoais removidos em {formatDate(c.anonymizedAt, app.tz)}</Badge>}
            {c.tags.map((t) => (
              <Badge key={t}>#{t}</Badge>
            ))}
          </>
        }
        actions={
          !c.anonymizedAt && (
            <>
              {c.whatsapp && (
                <Button asChild size="sm" variant="primary">
                  <a href={waLink(`Olá, ${c.name.split(" ")[0]}!`, c.whatsapp)} target="_blank" rel="noreferrer">
                    <MessageCircle /> WhatsApp
                  </a>
                </Button>
              )}
              <ContactSheetButton
                initial={{
                  id: c.id,
                  name: c.name,
                  isCustomer: c.isCustomer,
                  isSupplier: c.isSupplier,
                  whatsapp: c.whatsapp ?? "",
                  phone: c.phone ?? "",
                  email: c.email ?? "",
                  document: c.document ?? "",
                  city: c.city ?? "",
                  state: c.state ?? "",
                  instagram: c.instagram ?? "",
                  notes: c.notes ?? "",
                  tags: c.tags.join(", "),
                }}
              />
              <ContactMenu id={c.id} archived={c.archived} canAnonymize={app.can("settings.manage")} canSell={app.can("sales.manage")} canTrade={app.can("trades.manage")} />
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {(receivable > 0 || payable > 0) && (
            <Section title="Em aberto">
              <TitleList titles={d.titles} accounts={accounts} canSettle={d.canSettle || app.can("sales.manage")} tz={app.tz} />
            </Section>
          )}
          {d.sales.length > 0 && (
            <Section title="Vendas e orçamentos" flush>
              <ul className="divide-y divide-line">
                {d.sales.map((s) => (
                  <li key={s.id}>
                    <Link href={`/vendas/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 text-ink-3">{s.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.description}</span>
                      <Badge tone={s.status === "CONFIRMED" ? "positive" : s.status === "QUOTE" ? "info" : "muted"}>{SALE_STATUS_LABEL[s.status]}</Badge>
                      <span className="hidden text-[0.8125rem] text-ink-3 sm:inline">{formatDate(s.date, app.tz)}</span>
                      <Money cents={s.totalCents} className="w-24 text-right text-sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {d.purchases.length > 0 && (
            <Section title="Compras deste fornecedor" flush>
              <ul className="divide-y divide-line">
                {d.purchases.map((p) => (
                  <li key={p.id}>
                    <Link href={`/compras/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 text-ink-3">{p.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.description}</span>
                      <span className="hidden text-[0.8125rem] text-ink-3 sm:inline">{formatDate(p.date, app.tz)}</span>
                      <Money cents={p.totalCents} className="w-24 text-right text-sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {d.trades.length > 0 && (
            <Section title="Catiras" flush>
              <ul className="divide-y divide-line">
                {d.trades.map((t) => (
                  <li key={t.id}>
                    <Link href={`/catiras/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 text-ink-3">{t.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                      <Badge>{TRADE_STATUS_LABEL[t.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {d.owned.length > 0 && (
            <Section title="Itens desta pessoa sob sua guarda" description="Consignados ou equipamentos de cliente — não fazem parte do seu patrimônio." flush>
              <ul className="divide-y divide-line">
                {d.owned.map((i) => (
                  <li key={i.id}>
                    <Link href={`/estoque/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-2/60 sm:px-5">
                      <span className="code w-16 text-ink-3">{i.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{i.title}</span>
                      <ItemStatusBadge status={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {!d.sales.length && !d.purchases.length && !d.trades.length && !d.owned.length && (
            <Callout tone="neutral">Ainda não há negócios com este contato.</Callout>
          )}
        </div>
        <aside className="flex flex-col gap-5">
          {!c.anonymizedAt && (
            <Section title="Contato">
              <ul className="space-y-2 text-sm">
                {c.whatsapp && (
                  <li className="flex items-center gap-2">
                    <MessageCircle className="size-4 text-ink-3" /> {c.whatsapp}
                  </li>
                )}
                {c.phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="size-4 text-ink-3" /> {c.phone}
                  </li>
                )}
                {c.email && (
                  <li className="flex items-center gap-2">
                    <Mail className="size-4 text-ink-3" /> {c.email}
                  </li>
                )}
                {c.instagram && (
                  <li className="flex items-center gap-2">
                    <AtSign className="size-4 text-ink-3" /> {c.instagram}
                  </li>
                )}
                {(c.city || c.state) && (
                  <li className="flex items-center gap-2">
                    <MapPin className="size-4 text-ink-3" /> {[c.city, c.state].filter(Boolean).join("/")}
                  </li>
                )}
                {c.document && <li className="text-ink-3">Doc. {c.document}</li>}
              </ul>
              {c.notes && <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-sm text-ink-2">{c.notes}</p>}
            </Section>
          )}
          <Section title="Resumo">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-3">Comprou de você</dt>
                <dd>
                  <Money cents={totalSales} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Vendeu para você</dt>
                <dd>
                  <Money cents={totalPurch} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Deve a você</dt>
                <dd>
                  <Money cents={receivable} className={receivable ? "text-warning-text" : ""} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Você deve</dt>
                <dd>
                  <Money cents={payable} />
                </dd>
              </div>
            </dl>
          </Section>
          {d.opportunities.length > 0 && (
            <Section title="Negociações">
              <ul className="space-y-2 text-sm">
                {d.opportunities.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <Link href={`/negociacoes?abrir=${o.id}`}>{o.title}</Link>
                    <Badge>{STAGE_LABEL[o.stage as keyof typeof STAGE_LABEL]}</Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Anotações">
            {!c.anonymizedAt && <ContactNote contactId={c.id} />}
            <ul className="mt-3 space-y-3">
              {d.noteList.map((n) => (
                <li key={n.id} className="text-sm">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="text-[0.75rem] text-ink-3">
                    {n.user ?? "—"} · {formatDateTime(n.at, app.tz)}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}
