import "server-only";
import { prisma, Prisma } from "../db";
import { hasPerm, requirePerm, type Ctx } from "../context";
import { locationOptions, userNames } from "./common";
import { ON_BOOKS_STATUSES } from "../domain/shared";
import { itemProfit } from "../domain/reports";
import type { ItemStatus } from "@/generated/prisma/client";

export const STATUS_GROUPS: Record<string, { label: string; statuses: ItemStatus[] }> = {
  stock: { label: "Em estoque", statuses: ["AVAILABLE", "RESERVED", "INSPECTION", "DEFECTIVE", "IN_BUILD", "IN_NEGOTIATION", "CONSIGNED_OUT", "RETURNED", "SOLD"] },
  available: { label: "Disponíveis", statuses: ["AVAILABLE"] },
  attention: { label: "Precisam de atenção", statuses: ["INSPECTION", "DEFECTIVE", "RETURNED"] },
  committed: { label: "Comprometidos", statuses: ["RESERVED", "IN_BUILD", "IN_NEGOTIATION", "CONSIGNED_OUT", "SOLD"] },
  exited: { label: "Saíram", statuses: ["DELIVERED", "EXCHANGED", "DISASSEMBLED", "DISPOSED", "INSTALLED"] },
  all: { label: "Todos", statuses: [] },
};

export type ItemListFilters = {
  q?: string;
  group?: string;
  status?: string;
  categoryId?: string;
  locationId?: string;
  ownership?: string;
  condition?: string;
  cost?: string; // unknown | estimated
  tag?: string;
  stale?: string; // dias
  sort?: string;
  page?: number;
};

export const PAGE_SIZE = 50;

export async function listItems(ctx: Ctx, f: ItemListFilters) {
  requirePerm(ctx, "inventory.view");
  const seeCost = hasPerm(ctx, "inventory.cost");
  const where: Prisma.ItemWhereInput = { orgId: ctx.orgId, status: { not: "VOID" } };
  const group = STATUS_GROUPS[f.group ?? "stock"] ?? STATUS_GROUPS.stock;
  if (f.status) where.status = f.status as ItemStatus;
  else if (group.statuses.length) where.status = { in: group.statuses };
  if (f.categoryId) where.product = { categoryId: f.categoryId };
  if (f.locationId === "none") where.locationId = null;
  else if (f.locationId) {
    const locs = await locationOptions(ctx, true);
    const ids = new Set([f.locationId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of locs) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) (ids.add(l.id), (grew = true));
    }
    where.locationId = { in: [...ids] };
  }
  if (f.ownership) where.ownership = f.ownership as never;
  if (f.condition) where.condition = f.condition as never;
  if (f.cost === "unknown") where.costStatus = "UNKNOWN";
  if (f.cost === "estimated") where.costStatus = "ESTIMATED";
  if (f.tag) where.tags = { has: f.tag };
  if (f.stale) {
    const days = Number(f.stale) || 60;
    where.acquiredAt = { lt: new Date(Date.now() - days * 86_400_000) };
    where.status = { in: ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED"] };
  }
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { serial: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { product: { brand: { contains: q, mode: "insensitive" } } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  const sorts: Record<string, Prisma.ItemOrderByWithRelationInput[]> = {
    recent: [{ createdAt: "desc" }],
    oldest: [{ acquiredAt: "asc" }],
    code: [{ code: "asc" }],
    name: [{ title: "asc" }],
    price: [{ expectedPriceCents: { sort: "desc", nulls: "last" } }],
    cost: seeCost ? [{ unitCostCents: { sort: "desc", nulls: "last" } }] : [{ createdAt: "desc" }],
  };
  const page = Math.max(1, f.page ?? 1);
  const [total, rows, totals] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      orderBy: sorts[f.sort ?? "recent"] ?? sorts.recent,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { product: { include: { category: true } }, location: true, owner: { select: { name: true } } },
    }),
    prisma.item.findMany({ where, select: { unitCostCents: true, qtyOnHand: true, tracking: true, expectedPriceCents: true, status: true, ownership: true } }),
  ]);
  const covers = await prisma.attachment.findMany({
    where: { orgId: ctx.orgId, entityType: "Item", entityId: { in: rows.map((r) => r.id) }, kind: "PHOTO" },
    orderBy: [{ isCover: "desc" }, { createdAt: "asc" }],
    select: { id: true, entityId: true },
  });
  const coverOf = new Map<string, string>();
  for (const c of covers) if (!coverOf.has(c.entityId)) coverOf.set(c.entityId, c.id);
  const locs = await locationOptions(ctx, true);
  const locPath = new Map(locs.map((l) => [l.id, l.path]));
  const onBooks = totals.filter((t) => t.ownership === "OWNED" && ON_BOOKS_STATUSES.includes(t.status));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: {
      units: totals.reduce((a, t) => a + (["DELIVERED", "EXCHANGED", "DISASSEMBLED", "DISPOSED"].includes(t.status) ? 0 : t.qtyOnHand), 0),
      costCents: seeCost ? onBooks.reduce((a, t) => a + (t.unitCostCents ?? 0) * t.qtyOnHand, 0) : null,
      askingCents: onBooks.reduce((a, t) => a + (t.expectedPriceCents ?? 0) * (t.tracking === "LOT" ? t.qtyOnHand : 1), 0),
    },
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      serial: r.serial,
      status: r.status,
      ownership: r.ownership,
      ownerName: r.owner?.name ?? null,
      condition: r.condition,
      tracking: r.tracking,
      qtyOnHand: r.qtyOnHand,
      qtyReserved: r.qtyReserved,
      category: r.product.category.name,
      categoryKind: r.product.category.kind,
      brand: r.product.brand,
      location: r.locationId ? locPath.get(r.locationId) ?? r.location?.name ?? null : null,
      unitCostCents: seeCost ? r.unitCostCents : undefined,
      costStatus: seeCost ? r.costStatus : undefined,
      expectedPriceCents: r.expectedPriceCents,
      estimatedValueCents: r.estimatedValueCents,
      acquiredAt: r.acquiredAt,
      tags: r.tags,
      coverId: coverOf.get(r.id) ?? null,
    })),
  };
}

export type ItemListRow = Awaited<ReturnType<typeof listItems>>["rows"][number];

/** Ficha completa do item, com histórico e origem/destino rastreáveis. */
export async function getItemDetail(ctx: Ctx, id: string) {
  requirePerm(ctx, "inventory.view");
  const seeCost = hasPerm(ctx, "inventory.cost");
  const item = await prisma.item.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      product: { include: { category: true } },
      location: true,
      owner: { select: { id: true, name: true } },
      parent: { select: { id: true, code: true, title: true, status: true } },
      children: { select: { id: true, code: true, title: true, status: true, unitCostCents: true, serial: true, product: { select: { category: { select: { kind: true, name: true } } } } }, orderBy: { code: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
      costs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!item) return null;
  const [locs, attachments, notes] = await Promise.all([
    locationOptions(ctx, true),
    prisma.attachment.findMany({ where: { orgId: ctx.orgId, entityType: "Item", entityId: item.id }, orderBy: [{ isCover: "desc" }, { createdAt: "asc" }] }),
    prisma.note.findMany({ where: { orgId: ctx.orgId, entityType: "Item", entityId: item.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const locPath = new Map(locs.map((l) => [l.id, l.path]));
  const names = await userNames([...item.events.map((e) => e.userId), ...notes.map((n) => n.userId)]);

  // Origem rastreável
  let origin: { label: string; href: string | null; detail?: string } | null = null;
  if (item.sourcePurchaseLineId) {
    const line = await prisma.purchaseLine.findFirst({ where: { id: item.sourcePurchaseLineId, orgId: ctx.orgId }, include: { purchase: true } });
    const contact = line?.purchase.contactId ? await prisma.contact.findUnique({ where: { id: line.purchase.contactId }, select: { name: true } }) : null;
    if (line) origin = { label: `Compra ${line.purchase.code}`, href: hasPerm(ctx, "purchases.manage") ? `/compras/${line.purchaseId}` : null, detail: contact?.name };
  } else if (item.sourceTradeId) {
    const t = await prisma.trade.findFirst({ where: { id: item.sourceTradeId, orgId: ctx.orgId } });
    if (t) origin = { label: `Catira ${t.code}`, href: hasPerm(ctx, "trades.manage") ? `/catiras/${t.id}` : null, detail: t.title };
  } else if (item.sourceBuildId) {
    const b = await prisma.build.findFirst({ where: { id: item.sourceBuildId, orgId: ctx.orgId } });
    if (b) origin = { label: `Montagem ${b.code}`, href: `/montagens/${b.id}`, detail: b.name };
  } else if (item.sourceSaleId) {
    const s = await prisma.sale.findFirst({ where: { id: item.sourceSaleId, orgId: ctx.orgId } });
    if (s) origin = { label: `Troca na venda ${s.code}`, href: hasPerm(ctx, "sales.manage") ? `/vendas/${s.id}` : null };
  } else if (item.sourceDisassemblyId) {
    const d = await prisma.disassembly.findFirst({ where: { id: item.sourceDisassemblyId, orgId: ctx.orgId } });
    if (d) {
      const src = await prisma.item.findFirst({ where: { id: d.sourceItemId, orgId: ctx.orgId }, select: { id: true, code: true } });
      origin = { label: `Desmontagem ${d.code}`, href: src ? `/estoque/${src.id}` : null, detail: src ? `do PC ${src.code}` : undefined };
    }
  } else if (item.importBatchId) {
    const b = await prisma.importBatch.findFirst({ where: { id: item.importBatchId, orgId: ctx.orgId } });
    origin = { label: "Importação de planilha", href: null, detail: b?.fileName };
  }

  // Destino(s): vendas, catiras, montagens
  const saleLines = await prisma.saleLine.findMany({ where: { orgId: ctx.orgId, itemId: item.id }, include: { sale: true } });
  const tradeOut = await prisma.tradeOutLine.findMany({ where: { orgId: ctx.orgId, itemId: item.id }, include: { trade: true } });
  const buildParts = await prisma.buildPart.findMany({ where: { orgId: ctx.orgId, itemId: item.id }, include: { build: true } });
  const profit = seeCost && saleLines.some((l) => l.sale.status === "CONFIRMED") ? await itemProfit(ctx.orgId, item.id) : null;

  let ownerHolder: string | null = null;
  if (item.status === "CONSIGNED_OUT" && item.holdId) {
    ownerHolder = (await prisma.contact.findFirst({ where: { id: item.holdId, orgId: ctx.orgId }, select: { name: true } }))?.name ?? null;
  }
  let holdLabel: { label: string; href: string | null } | null = null;
  if (item.holdType === "SALE" && item.holdId) {
    const s = await prisma.sale.findFirst({ where: { id: item.holdId, orgId: ctx.orgId }, select: { code: true, id: true } });
    if (s) holdLabel = { label: `Reservado no orçamento ${s.code}`, href: `/vendas/${s.id}` };
  } else if (item.holdType === "BUILD" && item.holdId) {
    const b = await prisma.build.findFirst({ where: { id: item.holdId, orgId: ctx.orgId }, select: { code: true, id: true, name: true } });
    if (b) holdLabel = { label: `Na montagem ${b.code} — ${b.name}`, href: `/montagens/${b.id}` };
  } else if (item.holdType === "TRADE" && item.holdId) {
    const t = await prisma.trade.findFirst({ where: { id: item.holdId, orgId: ctx.orgId }, select: { code: true, id: true } });
    if (t) holdLabel = { label: `Em negociação na catira ${t.code}`, href: `/catiras/${t.id}` };
  }

  return {
    id: item.id,
    code: item.code,
    version: item.version,
    title: item.title,
    serial: item.serial,
    status: item.status,
    ownership: item.ownership,
    owner: item.owner,
    consignedTo: ownerHolder,
    hold: holdLabel,
    condition: item.condition,
    defects: item.defects,
    completeness: item.completeness as Record<string, boolean>,
    accessories: item.accessories,
    specs: { ...(item.product.specs as Record<string, unknown>), ...(item.specs as Record<string, unknown>) },
    itemSpecs: item.specs as Record<string, unknown>,
    tracking: item.tracking,
    qtyInitial: item.qtyInitial,
    qtyOnHand: item.qtyOnHand,
    qtyReserved: item.qtyReserved,
    unitCostCents: seeCost ? item.unitCostCents : undefined,
    costStatus: seeCost ? item.costStatus : undefined,
    costs: seeCost ? item.costs.map((c) => ({ id: c.id, kind: c.kind, amountCents: c.amountCents, description: c.description, createdAt: c.createdAt })) : [],
    expectedPriceCents: item.expectedPriceCents,
    minPriceCents: seeCost ? item.minPriceCents : undefined,
    estimatedValueCents: item.estimatedValueCents,
    estimatedValueNote: item.estimatedValueNote,
    estimatedValueAt: item.estimatedValueAt,
    warrantyUntil: item.warrantyUntil,
    warrantyNotes: item.warrantyNotes,
    locationId: item.locationId,
    location: item.locationId ? locPath.get(item.locationId) ?? item.location?.name ?? null : null,
    acquisitionType: item.acquisitionType,
    acquiredAt: item.acquiredAt,
    tags: item.tags,
    notes: item.notes,
    product: { id: item.product.id, name: item.product.name, brand: item.product.brand, model: item.product.model, category: item.product.category.name, categoryId: item.product.categoryId, kind: item.product.category.kind },
    parent: item.parent,
    children: item.children.map((c) => ({ id: c.id, code: c.code, title: c.title, status: c.status, serial: c.serial, kind: c.product.category.kind, category: c.product.category.name, unitCostCents: seeCost ? c.unitCostCents : undefined })),
    events: item.events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      reason: e.reason,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      fromLocation: e.fromLocationId ? locPath.get(e.fromLocationId) ?? "local removido" : null,
      toLocation: e.toLocationId ? locPath.get(e.toLocationId) ?? "local removido" : null,
      qtyDelta: e.qtyDelta,
      refType: e.refType,
      refId: e.refId,
      user: e.userId ? names.get(e.userId) ?? null : null,
      createdAt: e.createdAt,
    })),
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, kind: a.kind, isCover: a.isCover, sizeBytes: a.sizeBytes, caption: a.caption })),
    notesList: notes.map((n) => ({ id: n.id, body: n.body, user: n.userId ? names.get(n.userId) ?? null : null, createdAt: n.createdAt })),
    origin,
    sales: saleLines.map((l) => ({
      saleId: l.saleId,
      code: l.sale.code,
      status: l.sale.status,
      date: l.sale.date,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      returnedQty: l.returnedQty,
      href: hasPerm(ctx, "sales.manage") ? `/vendas/${l.saleId}` : null,
    })),
    trades: tradeOut.map((t) => ({ tradeId: t.tradeId, code: t.trade.code, status: t.trade.status, agreedValueCents: t.agreedValueCents, href: hasPerm(ctx, "trades.manage") ? `/catiras/${t.tradeId}` : null })),
    builds: buildParts.map((p) => ({ buildId: p.buildId, code: p.build.code, name: p.build.name, status: p.status, buildStatus: p.build.status })),
    profit,
  };
}

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItemDetail>>>;

/** Itens que podem entrar em venda/montagem/catira (seletor). */
export async function pickableItems(ctx: Ctx, purpose: "sale" | "build" | "trade", opts: { q?: string; contactId?: string | null; includeIds?: string[] } = {}) {
  requirePerm(ctx, "inventory.view");
  const seeCost = hasPerm(ctx, "inventory.cost");
  const ownership = purpose === "sale" ? (["OWNED", "CONSIGNED_IN"] as const) : purpose === "build" ? (["OWNED", "CLIENT"] as const) : (["OWNED"] as const);
  const rows = await prisma.item.findMany({
    where: {
      orgId: ctx.orgId,
      OR: [
        {
          ownership: { in: [...ownership] },
          ...(purpose === "build" ? { product: { category: { kind: { not: "PC" } } } } : {}),
          OR: [{ tracking: "UNIT", status: "AVAILABLE" }, { tracking: "LOT", status: "AVAILABLE", qtyOnHand: { gt: 0 } }],
          ...(opts.q ? { AND: [{ OR: [{ code: { contains: opts.q, mode: "insensitive" } }, { title: { contains: opts.q, mode: "insensitive" } }, { serial: { contains: opts.q, mode: "insensitive" } }] }] } : {}),
        },
        ...(opts.includeIds?.length ? [{ id: { in: opts.includeIds } }] : []),
      ],
    },
    include: { product: { include: { category: true } }, location: true },
    orderBy: [{ product: { category: { name: "asc" } } }, { title: "asc" }],
    take: 400,
  });
  return rows
    .filter((r) => !(purpose === "build" && r.ownership === "CLIENT" && opts.contactId && r.ownerContactId !== opts.contactId))
    .map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      serial: r.serial,
      category: r.product.category.name,
      kind: r.product.category.kind,
      tracking: r.tracking,
      available: r.tracking === "LOT" ? r.qtyOnHand - r.qtyReserved : 1,
      ownership: r.ownership,
      condition: r.condition,
      location: r.location?.name ?? null,
      unitCostCents: seeCost ? r.unitCostCents : undefined,
      costStatus: seeCost ? r.costStatus : undefined,
      expectedPriceCents: r.expectedPriceCents,
      estimatedValueCents: r.estimatedValueCents,
      specs: { ...(r.product.specs as Record<string, unknown>), ...(r.specs as Record<string, unknown>) },
    }));
}

export type PickableItem = Awaited<ReturnType<typeof pickableItems>>[number];

export async function itemTags(ctx: Ctx) {
  const rows = await prisma.$queryRaw<{ tag: string; n: bigint }[]>`
    SELECT unnest("tags") AS tag, COUNT(*) AS n FROM "Item" WHERE "orgId" = ${ctx.orgId} AND "status" <> 'VOID' GROUP BY 1 ORDER BY 2 DESC LIMIT 40`;
  return rows.map((r) => r.tag);
}
