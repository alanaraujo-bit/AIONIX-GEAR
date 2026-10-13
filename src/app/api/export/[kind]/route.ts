import { getSession } from "@/server/session";
import { prisma } from "@/server/db";
import { can, type Permission } from "@/lib/permissions";
import { toCsv, centsCsv } from "@/lib/csv";
import { resolvePeriod, toDateInput, PERIOD_LABEL, type PeriodKey } from "@/lib/dates";
import { STATUS_LABEL, CONDITION_LABEL, OWNERSHIP_LABEL, COST_STATUS_LABEL, TX_KIND_LABEL, METHOD_LABEL, SALE_STATUS_LABEL, ACQUISITION_LABEL, type ItemStatusKey } from "@/lib/labels";
import { exportOrganization } from "@/server/backup";

const PERMS: Record<string, Permission> = {
  estoque: "inventory.view",
  movimentos: "finance.view",
  vendas: "sales.manage",
  compras: "purchases.manage",
  resultado: "reports.view",
  titulos: "finance.view",
  contatos: "contacts.manage",
  backup: "data.export",
  auditoria: "audit.view",
};

/** Exportações em CSV/JSON — sempre restritas à empresa ativa e à permissão do usuário. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await getSession();
  if (!session?.org || !session.role) return new Response("Não autorizado", { status: 401 });
  const { kind } = await params;
  const perm = PERMS[kind];
  if (!perm || !can(session.role, perm)) return new Response("Sem permissão", { status: 403 });
  const orgId = session.org.id;
  const tz = session.org.timezone;
  const url = new URL(req.url);
  const periodKey = (url.searchParams.get("periodo") ?? "all") as PeriodKey;
  const p = resolvePeriod(PERIOD_LABEL[periodKey] ? periodKey : "all", tz, { from: url.searchParams.get("de") ?? undefined, to: url.searchParams.get("ate") ?? undefined });
  const seeCost = can(session.role, "inventory.cost");
  const stamp = toDateInput(new Date(), tz);
  let csv = "";
  let name = `${kind}-${stamp}.csv`;

  if (kind === "estoque") {
    const items = await prisma.item.findMany({ where: { orgId, status: { not: "VOID" } }, include: { product: { include: { category: true } }, location: true, owner: true }, orderBy: { code: "asc" } });
    csv = toCsv(
      ["Código", "Item", "Categoria", "Marca", "Série", "Situação", "Condição", "Posse", "Dono", "Quantidade", ...(seeCost ? ["Custo unitário", "Situação do custo"] : []), "Preço pretendido", "Valor de mercado estimado", "Local", "Origem", "Entrada", "Etiquetas"],
      items.map((i) => [
        i.code,
        i.title,
        i.product.category.name,
        i.product.brand,
        i.serial,
        STATUS_LABEL[i.status as ItemStatusKey],
        CONDITION_LABEL[i.condition],
        OWNERSHIP_LABEL[i.ownership],
        i.owner?.name,
        i.qtyOnHand,
        ...(seeCost ? [centsCsv(i.unitCostCents), COST_STATUS_LABEL[i.costStatus]] : []),
        centsCsv(i.expectedPriceCents),
        centsCsv(i.estimatedValueCents),
        i.location?.name,
        ACQUISITION_LABEL[i.acquisitionType],
        toDateInput(i.acquiredAt, tz),
        i.tags.join(", "),
      ]),
    );
  } else if (kind === "movimentos") {
    const rows = await prisma.moneyTransaction.findMany({
      where: { orgId, date: { gte: p.from, lte: p.to }, ...(url.searchParams.get("conta") ? { accountId: url.searchParams.get("conta")! } : {}) },
      include: { account: true },
      orderBy: { date: "asc" },
    });
    csv = toCsv(
      ["Data", "Conta", "Tipo", "Descrição", "Forma", "Entrada", "Saída", "Estorno"],
      rows.map((r) => [toDateInput(r.date, tz), r.account.name, TX_KIND_LABEL[r.kind] ?? r.kind, r.description, r.method ? METHOD_LABEL[r.method] : "", r.direction === "IN" ? centsCsv(r.amountCents) : "", r.direction === "OUT" ? centsCsv(r.amountCents) : "", r.reversalOfId ? "sim" : ""]),
    );
  } else if (kind === "vendas") {
    const sales = await prisma.sale.findMany({ where: { orgId, date: { gte: p.from, lte: p.to } }, include: { lines: true }, orderBy: { date: "asc" } });
    const contacts = await prisma.contact.findMany({ where: { orgId }, select: { id: true, name: true } });
    csv = toCsv(
      ["Código", "Data", "Situação", "Cliente", "Item", "Quantidade", "Preço", ...(seeCost ? ["Custo"] : []), "Desconto da venda", "Frete cobrado", "Taxas", "Total da venda"],
      sales.flatMap((s) =>
        s.lines.map((l, i) => [
          s.code,
          toDateInput(s.date, tz),
          SALE_STATUS_LABEL[s.status],
          contacts.find((c) => c.id === s.contactId)?.name,
          l.description,
          l.quantity,
          centsCsv(l.unitPriceCents * l.quantity),
          ...(seeCost ? [centsCsv(l.costCents)] : []),
          i === 0 ? centsCsv(s.discountCents) : "",
          i === 0 ? centsCsv(s.shippingChargedCents) : "",
          i === 0 ? centsCsv(s.feeCents) : "",
          i === 0 ? centsCsv(s.totalCents) : "",
        ]),
      ),
    );
  } else if (kind === "compras") {
    const ps = await prisma.purchase.findMany({ where: { orgId, date: { gte: p.from, lte: p.to } }, include: { lines: true }, orderBy: { date: "asc" } });
    const contacts = await prisma.contact.findMany({ where: { orgId }, select: { id: true, name: true } });
    csv = toCsv(
      ["Código", "Data", "Situação", "Fornecedor", "Item", "Quantidade", "Preço unitário", "Custo total rateado", "Total da compra"],
      ps.flatMap((x) => x.lines.map((l, i) => [x.code, toDateInput(x.date, tz), x.status, contacts.find((c) => c.id === x.contactId)?.name, l.description, l.quantity, centsCsv(l.unitPriceCents), centsCsv(l.allocatedCents), i === 0 ? centsCsv(x.totalCents) : ""])),
    );
  } else if (kind === "resultado") {
    const rows = await prisma.resultEntry.findMany({ where: { orgId, date: { gte: p.from, lte: p.to } }, orderBy: { date: "asc" } });
    const KIND: Record<string, string> = { REVENUE: "Receita", COGS: "Custo das mercadorias", SALES_EXPENSE: "Despesa de venda", OPERATING_EXPENSE: "Despesa operacional", OTHER_INCOME: "Outra receita", OTHER_EXPENSE: "Outra despesa / perda" };
    csv = toCsv(["Data", "Linha do resultado", "Descrição", "Valor", "Custo conhecido?", "Estorno"], rows.map((r) => [toDateInput(r.date, tz), KIND[r.kind] ?? r.kind, r.description, centsCsv(r.amountCents), r.costStatus ? COST_STATUS_LABEL[r.costStatus] : "", r.reversalOfId ? "sim" : ""]));
  } else if (kind === "titulos") {
    const rows = await prisma.title.findMany({ where: { orgId }, orderBy: { dueDate: "asc" } });
    const contacts = await prisma.contact.findMany({ where: { orgId }, select: { id: true, name: true } });
    csv = toCsv(["Tipo", "Descrição", "Pessoa", "Vencimento", "Valor", "Baixado", "Em aberto", "Situação"], rows.map((t) => [t.direction === "RECEIVABLE" ? "A receber" : "A pagar", t.description, contacts.find((c) => c.id === t.contactId)?.name, toDateInput(t.dueDate, tz), centsCsv(t.amountCents), centsCsv(t.settledCents), t.status === "CANCELLED" ? "0,00" : centsCsv(t.amountCents - t.settledCents), t.status]));
  } else if (kind === "contatos") {
    const rows = await prisma.contact.findMany({ where: { orgId, anonymizedAt: null }, orderBy: { name: "asc" } });
    csv = toCsv(["Nome", "Cliente", "Fornecedor", "WhatsApp", "Telefone", "E-mail", "Cidade", "UF", "Etiquetas"], rows.map((c) => [c.name, c.isCustomer ? "sim" : "", c.isSupplier ? "sim" : "", c.whatsapp, c.phone, c.email, c.city, c.state, c.tags.join(", ")]));
  } else if (kind === "auditoria") {
    const rows = await prisma.auditLog.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 20000 });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[] } }, select: { id: true, name: true } });
    csv = toCsv(["Quando", "Quem", "Ação", "Resumo"], rows.map((r) => [r.createdAt.toISOString(), users.find((u) => u.id === r.userId)?.name, r.action, r.summary]));
  } else if (kind === "backup") {
    const data = await exportOrganization(orgId);
    await prisma.auditLog.create({ data: { orgId, userId: session.user.id, action: "data.export", summary: "Backup completo exportado (JSON)" } });
    return new Response(JSON.stringify(data, null, 1), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="backup-${session.org.slug}-${stamp}.json"`, "Cache-Control": "no-store" },
    });
  }
  name = `${kind}-${session.org.slug}-${stamp}.csv`;
  await prisma.auditLog.create({ data: { orgId, userId: session.user.id, action: "data.export", summary: `Exportação CSV: ${kind}` } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
