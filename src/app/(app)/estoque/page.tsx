import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, MapPin, ClipboardCheck, Upload, PackagePlus } from "lucide-react";
import { requirePage } from "@/server/session";
import { listItems, STATUS_GROUPS, itemTags } from "@/server/queries/items";
import { categoryOptions, locationOptions } from "@/server/queries/common";
import { prisma } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { ItemFilters } from "./filters";
import { ItemTable } from "./item-table";

export const metadata: Metadata = { title: "Estoque" };

type SP = Record<string, string | undefined>;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const app = await requirePage("inventory.view");
  const sp = await searchParams;
  const filters = { ...sp, page: Number(sp.page ?? 1) };
  const [data, categories, locations, tags, views, totalItems] = await Promise.all([
    listItems(app.ctx, filters),
    categoryOptions(app.ctx),
    locationOptions(app.ctx),
    itemTags(app.ctx),
    prisma.savedView.findMany({ where: { orgId: app.ctx.orgId, module: "items", OR: [{ userId: app.ctx.userId }, { userId: null }] }, orderBy: { createdAt: "asc" } }),
    prisma.item.count({ where: { orgId: app.ctx.orgId, status: { not: "VOID" } } }),
  ]);
  const canEdit = app.can("inventory.edit");
  const seeCost = app.can("inventory.cost");
  const filtered = Object.keys(sp).some((k) => !["group", "page", "sort"].includes(k) && sp[k]);

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Tudo o que você tem, onde está e em que situação — próprio, consignado e de clientes separados."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/estoque/locais">
                <MapPin /> Locais
              </Link>
            </Button>
            {app.can("inventory.adjust") && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/estoque/inventarios">
                  <ClipboardCheck /> Inventário
                </Link>
              </Button>
            )}
            {app.can("data.import") && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/estoque/importar">
                  <Upload /> Importar
                </Link>
              </Button>
            )}
            {canEdit && (
              <Button asChild variant="primary" size="sm">
                <Link href="/estoque/novo">
                  <PackagePlus /> Cadastrar item
                </Link>
              </Button>
            )}
          </>
        }
      />
      {totalItems === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Boxes}
            title="Seu estoque começa aqui"
            action={
              canEdit ? (
                <>
                  <Button asChild variant="primary">
                    <Link href="/estoque/novo">Cadastrar o primeiro item</Link>
                  </Button>
                  {app.can("data.import") && (
                    <Button asChild>
                      <Link href="/estoque/importar">Importar planilha</Link>
                    </Button>
                  )}
                </>
              ) : undefined
            }
          >
            Cadastre peças uma a uma (com foto e local) ou importe a planilha que você já usa. Itens sem custo conhecido ficam marcados — nunca entram como zero.
          </EmptyState>
        </div>
      ) : (
        <>
          <ItemFilters
            groups={Object.entries(STATUS_GROUPS).map(([k, v]) => ({ key: k, label: v.label }))}
            categories={categories}
            locations={locations.map((l) => ({ id: l.id, path: l.path }))}
            tags={tags}
            views={views.map((v) => ({ id: v.id, name: v.name, query: v.query }))}
            seeCost={seeCost}
          />
          <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-ink-3">
            <span>
              <span className="num font-medium text-ink">{data.total.toLocaleString("pt-BR")}</span> {data.total === 1 ? "registro" : "registros"} ·{" "}
              <span className="num font-medium text-ink">{data.summary.units.toLocaleString("pt-BR")}</span> unidades físicas
            </span>
            {seeCost && data.summary.costCents !== null && (
              <span>
                Custo próprio: <span className="num font-medium text-ink">{formatBRL(data.summary.costCents)}</span>
              </span>
            )}
            {data.summary.askingCents > 0 && (
              <span>
                Preço pretendido: <span className="num font-medium text-ink">{formatBRL(data.summary.askingCents)}</span>
              </span>
            )}
          </div>
          {data.rows.length === 0 ? (
            <div className="surface">
              <EmptyState icon={Boxes} title={filtered ? "Nenhum item com esses filtros" : "Nenhum item nesta situação"} compact>
                {filtered ? "Tente remover algum filtro ou buscar por outro termo." : "Troque a aba acima para ver outras situações."}
              </EmptyState>
            </div>
          ) : (
            <ItemTable
              rows={data.rows}
              page={data.page}
              pages={data.pages}
              canEdit={canEdit}
              seeCost={seeCost}
              locations={locations.map((l) => ({ id: l.id, path: l.path }))}
            />
          )}
        </>
      )}
    </>
  );
}
