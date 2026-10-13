import "server-only";
import { prisma } from "../db";
import { hasPerm, requirePerm, type Ctx } from "../context";
import { buildCosting } from "../domain/builds";
import { userNames } from "./common";
import { sourceFinance } from "./commerce";

export async function listBuilds(ctx: Ctx, f: { situacao?: string; q?: string }) {
  requirePerm(ctx, "builds.manage");
  const rows = await prisma.build.findMany({
    where: {
      orgId: ctx.orgId,
      ...(f.situacao === "abertas" ? { status: { in: ["PLANNING", "ASSEMBLING", "TESTING"] } } : f.situacao ? { status: f.situacao } : {}),
      ...(f.q?.trim() ? { OR: [{ code: { contains: f.q.trim(), mode: "insensitive" as const } }, { name: { contains: f.q.trim(), mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: { parts: { where: { status: "ACTIVE" }, select: { itemId: true, quantity: true, costCents: true } }, expenses: { select: { amountCents: true } } },
  });
  const itemIds = rows.flatMap((r) => r.parts.map((p) => p.itemId));
  const items = await prisma.item.findMany({ where: { orgId: ctx.orgId, id: { in: itemIds } }, select: { id: true, unitCostCents: true, ownership: true } });
  const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const seeCost = hasPerm(ctx, "inventory.cost");
  return rows.map((r) => {
    const parts = r.parts.reduce((a, p) => {
      const it = items.find((i) => i.id === p.itemId);
      const c = r.status === "COMPLETED" && p.costCents !== null ? p.costCents : it?.ownership === "OWNED" ? (it.unitCostCents ?? 0) * p.quantity : 0;
      return a + c;
    }, 0);
    const total = parts + r.expenses.reduce((a, e) => a + e.amountCents, 0);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      purpose: r.purpose,
      status: r.status,
      contact: contacts.find((c) => c.id === r.contactId)?.name ?? null,
      parts: r.parts.length,
      totalCostCents: seeCost ? total : null,
      targetPriceCents: r.targetPriceCents,
      resultItemId: r.resultItemId,
      updatedAt: r.updatedAt,
    };
  });
}

export async function getBuildDetail(ctx: Ctx, id: string) {
  requirePerm(ctx, "builds.manage");
  const exists = await prisma.build.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!exists) return null;
  const costing = await buildCosting(ctx.orgId, id);
  const b = costing.build;
  const seeCost = hasPerm(ctx, "inventory.cost");
  const [contact, removed, attachments, audit, notes, result] = await Promise.all([
    b.contactId ? prisma.contact.findFirst({ where: { id: b.contactId, orgId: ctx.orgId }, select: { id: true, name: true, whatsapp: true } }) : null,
    prisma.buildPart.findMany({ where: { buildId: b.id, orgId: ctx.orgId, status: "REMOVED" }, orderBy: { removedAt: "desc" } }),
    prisma.attachment.findMany({ where: { orgId: ctx.orgId, entityType: "Build", entityId: b.id }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ where: { orgId: ctx.orgId, entityType: "Build", entityId: b.id }, orderBy: { createdAt: "asc" } }),
    prisma.note.findMany({ where: { orgId: ctx.orgId, entityType: "Build", entityId: b.id }, orderBy: { createdAt: "desc" } }),
    b.resultItemId ? prisma.item.findFirst({ where: { id: b.resultItemId, orgId: ctx.orgId }, select: { id: true, code: true, title: true, status: true, expectedPriceCents: true } }) : null,
  ]);
  const expenseFinance = (await Promise.all(b.expenses.map((e) => sourceFinance(ctx, ["BUILD"], e.id)))).flat();
  const removedItems = await prisma.item.findMany({ where: { orgId: ctx.orgId, id: { in: removed.map((r) => r.itemId) } }, select: { id: true, code: true, title: true } });
  const names = await userNames([...audit.map((a) => a.userId), ...notes.map((n) => n.userId)]);
  return {
    build: b,
    contact,
    result,
    parts: costing.parts.map((p) => ({
      partId: p.part.id,
      itemId: p.item.id,
      code: p.item.code,
      title: p.item.title,
      serial: p.item.serial,
      kind: p.item.product.category.kind,
      category: p.item.product.category.name,
      quantity: p.part.quantity,
      tracking: p.item.tracking,
      ownership: p.item.ownership,
      status: p.item.status,
      costCents: seeCost ? p.costCents : null,
      costStatus: seeCost ? p.costStatus : null,
    })),
    removed: removed.map((r) => ({ id: r.id, reason: r.removedReason, at: r.removedAt, item: removedItems.find((i) => i.id === r.itemId) ?? null })),
    expenses: b.expenses.map((e) => ({ id: e.id, kind: e.kind, description: e.description, amountCents: e.amountCents, paymentMode: e.paymentMode })),
    expenseFinance,
    costing: seeCost
      ? {
          partsCostCents: costing.partsCostCents,
          expensesCostCents: costing.expensesCostCents,
          totalCostCents: costing.totalCostCents,
          costStatus: costing.costStatus,
          ownLaborCents: costing.ownLaborCents,
          suggestedPriceCents: costing.suggestedPriceCents,
          targetMarginPct: costing.targetMarginPct,
          expectedMarginCents: costing.expectedMarginCents,
          expectedMarginPct: costing.expectedMarginPct,
        }
      : null,
    compat: costing.compat,
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, kind: a.kind, isCover: a.isCover })),
    history: audit.map((a) => ({ id: a.id, summary: a.summary, at: a.createdAt, user: a.userId ? names.get(a.userId) ?? null : null })),
    noteList: notes.map((n) => ({ id: n.id, body: n.body, at: n.createdAt, user: n.userId ? names.get(n.userId) ?? null : null })),
  };
}

export type BuildDetail = NonNullable<Awaited<ReturnType<typeof getBuildDetail>>>;
