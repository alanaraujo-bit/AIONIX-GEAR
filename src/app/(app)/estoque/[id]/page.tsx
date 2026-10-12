import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, MapPin, ShieldCheck, Link2, Cpu } from "lucide-react";
import { requirePage } from "@/server/session";
import { getItemDetail } from "@/server/queries/items";
import { locationOptions, contactOptions, accountOptions } from "@/server/queries/common";
import { PageHeader, Section, KeyValue, Money, Callout } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { ItemStatusBadge, CostStatusBadge } from "@/components/app/status";
import { Gallery } from "@/components/app/photos";
import { SPEC_FIELDS } from "@/server/domain/compat";
import { CONDITION_LABEL, COMPLETENESS_FIELDS, OWNERSHIP_LABEL, ACQUISITION_LABEL, COST_KIND_LABEL, SALE_STATUS_LABEL, TRADE_STATUS_LABEL, STATUS_LABEL, type ItemStatusKey } from "@/lib/labels";
import { formatDate, formatDateTime, daysBetween } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { ItemActions } from "./item-actions";
import { Timeline } from "./timeline";
import { NoteForm } from "./note-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Item ${id.slice(-6)}` };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await requirePage("inventory.view");
  const { id } = await params;
  const item = await getItemDetail(app.ctx, id);
  if (!item) notFound();
  const [locations, contacts, accounts] = await Promise.all([locationOptions(app.ctx), contactOptions(app.ctx), accountOptions(app.ctx)]);
  const seeCost = app.can("inventory.cost");
  const canEdit = app.can("inventory.edit");
  const specFields = SPEC_FIELDS[item.product.kind] ?? [];
  const specEntries = [
    ...specFields.filter((f) => item.specs[f.key] !== undefined && item.specs[f.key] !== "").map((f) => [f.label, String(item.specs[f.key])] as const),
    ...Object.entries(item.specs)
      .filter(([k, v]) => !specFields.some((f) => f.key === k) && v !== "" && v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)] as const),
  ];
  const daysInStock = daysBetween(item.acquiredAt);
  const live = !["DELIVERED", "EXCHANGED", "DISASSEMBLED", "DISPOSED", "VOID", "INSTALLED"].includes(item.status);
  const margin = seeCost && item.expectedPriceCents && item.unitCostCents && item.costStatus !== "UNKNOWN" ? item.expectedPriceCents - item.unitCostCents : null;

  return (
    <>
      <PageHeader
        back={{ href: "/estoque", label: "Estoque" }}
        title={item.title}
        meta={
          <>
            <span className="code rounded-md border border-line bg-surface px-1.5 py-0.5 text-ink-2">{item.code}</span>
            <ItemStatusBadge status={item.status} />
            {seeCost && <CostStatusBadge status={item.costStatus} />}
            {item.ownership !== "OWNED" && (
              <Badge tone="info">
                {OWNERSHIP_LABEL[item.ownership]}
                {item.owner ? ` · ${item.owner.name}` : ""}
              </Badge>
            )}
            {item.tracking === "LOT" && (
              <Badge>
                <span className="num">
                  {item.qtyOnHand} un. em estoque{item.qtyReserved ? ` · ${item.qtyReserved} reservadas` : ""}
                </span>
              </Badge>
            )}
          </>
        }
        actions={
          <ItemActions
            item={{
              id: item.id,
              code: item.code,
              title: item.title,
              status: item.status,
              tracking: item.tracking,
              ownership: item.ownership,
              locationId: item.locationId,
              costStatus: item.costStatus ?? null,
              unitCostCents: item.unitCostCents ?? null,
              qtyOnHand: item.qtyOnHand,
              qtyReserved: item.qtyReserved,
              kind: item.product.kind,
              hasChildren: item.children.some((c) => c.status === "INSTALLED"),
            }}
            perms={{
              edit: canEdit,
              adjust: app.can("inventory.adjust"),
              cost: seeCost,
              sell: app.can("sales.manage"),
              trade: app.can("trades.manage"),
              build: app.can("builds.manage"),
            }}
            locations={locations.map((l) => ({ id: l.id, path: l.path }))}
            contacts={contacts}
            accounts={accounts}
          />
        }
      />

      {item.hold && (
        <Callout tone="info" icon={Link2} className="mb-5" action={item.hold.href ? <Link href={item.hold.href} className="text-sm font-medium">Abrir</Link> : undefined}>
          {item.hold.label}. Enquanto isso, o item não aparece como disponível para outras operações.
        </Callout>
      )}
      {item.parent && (
        <Callout tone="neutral" icon={Cpu} className="mb-5" action={<Link href={`/estoque/${item.parent.id}`} className="text-sm font-medium">Ver PC</Link>}>
          Instalado no PC <span className="code">{item.parent.code}</span> — {item.parent.title}. O custo desta peça faz parte do custo do PC.
        </Callout>
      )}
      {item.consignedTo && (
        <Callout tone="info" className="mb-5">
          Consignado com <strong>{item.consignedTo}</strong>.
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Fotos e documentos">
            <Gallery entityType="Item" entityId={item.id} items={item.attachments} canEdit={canEdit && item.status !== "VOID"} />
          </Section>

          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Ficha técnica">
              <dl className="divide-y divide-line">
                <KeyValue label="Categoria">{item.product.category}</KeyValue>
                {item.product.brand && <KeyValue label="Marca">{item.product.brand}</KeyValue>}
                <KeyValue label="Modelo">{item.product.model ?? item.product.name}</KeyValue>
                {item.serial && (
                  <KeyValue label="Número de série">
                    <span className="code">{item.serial}</span>
                  </KeyValue>
                )}
                {specEntries.map(([k, v]) => (
                  <KeyValue key={k} label={k}>
                    {v}
                  </KeyValue>
                ))}
              </dl>
            </Section>
            <Section title="Estado">
              <dl className="divide-y divide-line">
                <KeyValue label="Condição">{CONDITION_LABEL[item.condition]}</KeyValue>
                <KeyValue label="Acompanha">
                  {COMPLETENESS_FIELDS.filter((c) => item.completeness?.[c.key]).map((c) => c.label).join(", ") || <span className="text-ink-3">Nada informado</span>}
                </KeyValue>
                {item.accessories && <KeyValue label="Acessórios">{item.accessories}</KeyValue>}
                <KeyValue label="Garantia">
                  {item.warrantyUntil ? (
                    <span className={new Date(item.warrantyUntil) < new Date() ? "text-ink-3" : ""}>
                      até {formatDate(item.warrantyUntil, app.tz)}
                      {new Date(item.warrantyUntil) < new Date() && " (vencida)"}
                    </span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </KeyValue>
              </dl>
              {item.defects && (
                <div className="mt-3 rounded-[8px] border border-warning/25 bg-warning-soft/60 px-3 py-2 text-sm text-ink-2">
                  <p className="mb-0.5 text-[0.75rem] font-medium text-warning-text">Defeitos e observações</p>
                  <p className="whitespace-pre-line">{item.defects}</p>
                </div>
              )}
            </Section>
          </div>

          {item.children.length > 0 && (
            <Section title="Componentes instalados" description="Cada peça mantém seu número de série e a origem até a compra original." flush>
              <ul className="divide-y divide-line">
                {item.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <Badge tone="neutral" className="w-24 justify-center">
                      {c.category}
                    </Badge>
                    <Link href={`/estoque/${c.id}`} className="min-w-0 flex-1 truncate text-sm text-ink no-underline hover:text-accent-text">
                      {c.title}
                      <span className="code ml-2 text-ink-3">{c.code}</span>
                    </Link>
                    {c.status !== "INSTALLED" && <ItemStatusBadge status={c.status} />}
                    {seeCost && <Money cents={c.unitCostCents} className="text-sm text-ink-2" />}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Histórico" description="Tudo o que aconteceu com este item, em ordem. Registros não são apagados.">
            <Timeline events={item.events} tz={app.tz} />
          </Section>
        </div>

        <aside className="flex flex-col gap-5">
          <Section title="Valores">
            <dl className="divide-y divide-line">
              <KeyValue label="Preço pretendido">
                <Money cents={item.expectedPriceCents} unknown="Sem preço" className="font-semibold" />
              </KeyValue>
              {seeCost && (
                <KeyValue label={item.tracking === "LOT" ? "Custo por unidade" : "Custo"}>
                  {item.costStatus === "UNKNOWN" ? <span className="text-warning-text">Desconhecido{item.unitCostCents ? ` (parcial ${formatBRL(item.unitCostCents)})` : ""}</span> : <Money cents={item.unitCostCents} />}
                </KeyValue>
              )}
              {margin !== null && (
                <KeyValue label="Margem prevista">
                  <span className={margin >= 0 ? "num text-positive" : "num text-negative"}>
                    {formatBRL(margin)} · {Math.round((margin / item.expectedPriceCents!) * 100)}%
                  </span>
                </KeyValue>
              )}
              {seeCost && item.minPriceCents ? (
                <KeyValue label="Preço mínimo">
                  <Money cents={item.minPriceCents} />
                </KeyValue>
              ) : null}
              <KeyValue label="Valor de mercado (estimado)" hint={item.estimatedValueNote ?? undefined}>
                {item.estimatedValueCents ? (
                  <span>
                    <Money cents={item.estimatedValueCents} />
                    {item.estimatedValueAt && <span className="block text-[0.75rem] text-ink-3">em {formatDate(item.estimatedValueAt, app.tz)}</span>}
                  </span>
                ) : (
                  <span className="text-ink-3">Não informado</span>
                )}
              </KeyValue>
            </dl>
            {seeCost && item.costs.length > 0 && (
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-[0.8125rem] font-medium text-accent-text">
                  <span className="group-open:hidden">Ver composição do custo ({item.costs.length})</span>
                  <span className="hidden group-open:inline">Ocultar composição do custo</span>
                </summary>
                <ul className="mt-2 space-y-1.5 text-[0.8125rem]">
                  {item.costs.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3">
                      <span className="text-ink-2">
                        {COST_KIND_LABEL[c.kind] ?? c.kind}
                        <span className="block text-[0.75rem] text-ink-3">{c.description}</span>
                      </span>
                      <Money cents={c.amountCents} signed={c.amountCents < 0} className="text-ink" />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          {item.profit && (
            <Section title="Resultado realizado">
              <dl className="divide-y divide-line">
                <KeyValue label="Receita">
                  <Money cents={item.profit.revenueCents} />
                </KeyValue>
                <KeyValue label="Custo da mercadoria">
                  <Money cents={-item.profit.cogsCents} />
                </KeyValue>
                {item.profit.allocatedSalesExpenseCents > 0 && (
                  <KeyValue label="Taxas e frete (rateados)">
                    <Money cents={-item.profit.allocatedSalesExpenseCents} />
                  </KeyValue>
                )}
                <KeyValue label="Lucro real">
                  <Money cents={item.profit.netProfitCents} tone="auto" className="font-semibold" />
                </KeyValue>
              </dl>
              {item.profit.costUnknown && <p className="mt-2 text-[0.8125rem] text-warning-text">Custo desconhecido: o lucro acima está superestimado.</p>}
            </Section>
          )}

          <Section title="Onde está">
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
              {item.location ?? <span className="text-ink-3">Sem local definido</span>}
            </p>
            <p className="mt-2 text-[0.8125rem] text-ink-3">
              No estoque há <span className="num text-ink-2">{daysInStock}</span> {daysInStock === 1 ? "dia" : "dias"} · entrada em {formatDate(item.acquiredAt, app.tz)}
            </p>
          </Section>

          <Section title="Origem e destino">
            <dl className="divide-y divide-line">
              <KeyValue label="Como entrou">{ACQUISITION_LABEL[item.acquisitionType]}</KeyValue>
              {item.origin && (
                <KeyValue label="Registro">
                  {item.origin.href ? (
                    <Link href={item.origin.href} className="inline-flex items-center gap-1">
                      {item.origin.label} <ArrowUpRight className="size-3.5" />
                    </Link>
                  ) : (
                    item.origin.label
                  )}
                  {item.origin.detail && <span className="block text-[0.75rem] text-ink-3">{item.origin.detail}</span>}
                </KeyValue>
              )}
              {item.sales.map((s) => (
                <KeyValue key={s.saleId} label={SALE_STATUS_LABEL[s.status]}>
                  {s.href ? <Link href={s.href}>{s.code}</Link> : s.code} · <Money cents={s.unitPriceCents} />
                  {s.returnedQty > 0 && <span className="block text-[0.75rem] text-warning-text">devolvido</span>}
                </KeyValue>
              ))}
              {item.trades.map((t) => (
                <KeyValue key={t.tradeId} label={`Catira (${TRADE_STATUS_LABEL[t.status].toLowerCase()})`}>
                  {t.href ? <Link href={t.href}>{t.code}</Link> : t.code} · <Money cents={t.agreedValueCents} />
                </KeyValue>
              ))}
              {item.builds.map((b) => (
                <KeyValue key={`${b.buildId}-${b.status}`} label={b.status === "ACTIVE" ? "Montagem" : "Montagem (retirado)"}>
                  <Link href={`/montagens/${b.buildId}`}>{b.code}</Link>
                  <span className="block text-[0.75rem] text-ink-3">{b.name}</span>
                </KeyValue>
              ))}
            </dl>
          </Section>

          {(item.tags.length > 0 || item.notes) && (
            <Section title="Etiquetas e observações">
              {item.tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {item.tags.map((t) => (
                    <Link key={t} href={`/estoque?tag=${encodeURIComponent(t)}&group=all`} className="no-underline">
                      <Badge>#{t}</Badge>
                    </Link>
                  ))}
                </div>
              )}
              {item.notes && <p className="whitespace-pre-line text-sm text-ink-2">{item.notes}</p>}
            </Section>
          )}

          <Section title="Anotações">
            {live || canEdit ? <NoteForm itemId={item.id} /> : null}
            {item.notesList.length > 0 && (
              <ul className="mt-3 space-y-3">
                {item.notesList.map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="whitespace-pre-line text-ink">{n.body}</p>
                    <p className="mt-0.5 text-[0.75rem] text-ink-3">
                      {n.user ?? "—"} · {formatDateTime(n.createdAt, app.tz)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {item.status === "VOID" && (
            <Callout tone="neutral" icon={ShieldCheck}>
              Item anulado: sua origem foi estornada ({STATUS_LABEL[item.status as ItemStatusKey]}). O histórico permanece para auditoria.
            </Callout>
          )}
        </aside>
      </div>
    </>
  );
}
