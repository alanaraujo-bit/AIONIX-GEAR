import { prisma } from "../db";
import { requirePerm, withTx, type Ctx } from "../context";
import { DomainError, NotFoundError, assert } from "../errors";
import { audit, itemEvent } from "./shared";
import { ensureProduct, insertItem } from "./items";
import { parseMoney } from "@/lib/money";
import type { ItemCondition, CategoryKind } from "@/generated/prisma/client";

export const IMPORT_FIELDS = [
  { key: "title", label: "Nome do item", required: true, aliases: ["nome", "item", "produto", "titulo", "título", "descricao", "descrição", "name"] },
  { key: "category", label: "Categoria", aliases: ["categoria", "tipo", "category"] },
  { key: "brand", label: "Marca", aliases: ["marca", "fabricante", "brand"] },
  { key: "model", label: "Modelo", aliases: ["modelo", "model"] },
  { key: "serial", label: "Número de série", aliases: ["serie", "série", "serial", "sn", "s/n", "numero de serie", "número de série"] },
  { key: "condition", label: "Condição", aliases: ["condicao", "condição", "estado", "condition"] },
  { key: "quantity", label: "Quantidade", aliases: ["quantidade", "qtd", "qtde", "qty", "quant"] },
  { key: "cost", label: "Custo unitário", aliases: ["custo", "custo unitario", "custo unitário", "valor pago", "paguei", "preco de compra", "preço de compra", "cost"] },
  { key: "costEstimated", label: "Custo é estimado? (sim/não)", aliases: ["custo estimado", "estimado"] },
  { key: "price", label: "Preço de venda", aliases: ["preco", "preço", "preco de venda", "preço de venda", "venda", "price"] },
  { key: "marketValue", label: "Valor de mercado", aliases: ["valor de mercado", "mercado", "fipe", "market"] },
  { key: "location", label: "Local", aliases: ["local", "localizacao", "localização", "onde", "location", "prateleira"] },
  { key: "defects", label: "Defeitos", aliases: ["defeito", "defeitos", "problemas"] },
  { key: "notes", label: "Observações", aliases: ["obs", "observacao", "observação", "observacoes", "observações", "notas", "notes"] },
  { key: "acquiredAt", label: "Data de aquisição", aliases: ["data", "data de compra", "data aquisicao", "data de aquisição", "comprado em"] },
  { key: "tags", label: "Etiquetas", aliases: ["tags", "etiquetas", "marcadores"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ImportMapping = Partial<Record<ImportFieldKey, string>>;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function guessMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const f of IMPORT_FIELDS) {
    const h = headers.find((h) => f.aliases.map(norm).includes(norm(h)) || norm(h) === norm(f.label));
    if (h) mapping[f.key] = h;
  }
  return mapping;
}

const KIND_KEYWORDS: [CategoryKind, string[]][] = [
  ["GPU", ["placa de video", "gpu", "rtx", "gtx", "radeon", "rx ", "video"]],
  ["CPU", ["processador", "cpu", "ryzen", "intel core", "i3", "i5", "i7", "i9", "xeon"]],
  ["MOTHERBOARD", ["placa mae", "placa-mae", "motherboard", "mobo"]],
  ["RAM", ["memoria", "ram", "ddr"]],
  ["STORAGE", ["ssd", "hd", "hdd", "nvme", "armazenamento"]],
  ["PSU", ["fonte", "psu"]],
  ["CASE", ["gabinete", "case"]],
  ["COOLER", ["cooler", "water", "refrigeracao"]],
  ["MONITOR", ["monitor"]],
  ["PERIPHERAL", ["teclado", "mouse", "headset", "periferico", "fone"]],
  ["NOTEBOOK", ["notebook", "laptop"]],
  ["PC", ["computador", "pc ", "desktop", "pc gamer"]],
  ["CONSOLE", ["console", "playstation", "xbox", "nintendo"]],
  ["NETWORK", ["roteador", "switch", "rede", "wifi"]],
  ["CONSUMABLE", ["pasta termica", "cabo", "parafuso", "insumo", "consumivel"]],
];

function parseCondition(v: string | undefined): { value: ItemCondition; warn?: string } {
  if (!v || !v.trim()) return { value: "GOOD" };
  const s = norm(v);
  if (s.includes("lacrad") || s === "novo" || s.includes("new")) return { value: "NEW" };
  if (s.includes("seminovo") || s.includes("como novo")) return { value: "LIKE_NEW" };
  if (s.includes("peca") || s.includes("defeit") || s.includes("retirada") || s.includes("sucata")) return { value: "FOR_PARTS" };
  if (s.includes("marca") || s.includes("regular") || s.includes("fair")) return { value: "FAIR" };
  if (s.includes("usado") || s.includes("bom") || s.includes("good")) return { value: "GOOD" };
  return { value: "GOOD", warn: `Condição "${v}" não reconhecida; usado "bom estado".` };
}

function parseDate(v: string | undefined): Date | null {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const y = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const d = new Date(Date.UTC(y, Number(br[2]) - 1, Number(br[1]), 12));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  // Serial de data do Excel
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
  return null;
}

export type PreviewRow = {
  row: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
  data: {
    title: string;
    categoryId: string | null;
    categoryName: string;
    brand: string | null;
    model: string | null;
    serial: string | null;
    condition: ItemCondition;
    quantity: number;
    costCents: number | null;
    costMode: "KNOWN" | "ESTIMATED" | "UNKNOWN";
    priceCents: number | null;
    marketValueCents: number | null;
    locationName: string | null;
    locationId: string | null;
    defects: string | null;
    notes: string | null;
    acquiredAt: string | null;
    tags: string[];
  };
};

/**
 * Valida as linhas sem gravar nada. Custos vazios viram "custo desconhecido" —
 * nunca zero —, e isso é mostrado como aviso para o usuário decidir.
 */
export async function previewImport(ctx: Ctx, input: { rows: Record<string, string>[]; mapping: ImportMapping }) {
  requirePerm(ctx, "data.import");
  assert(input.rows.length > 0, "A planilha está vazia.");
  assert(input.rows.length <= 2000, "Importe no máximo 2.000 linhas por vez.");
  assert(input.mapping.title, "Indique qual coluna tem o nome do item.");
  const categories = await prisma.category.findMany({ where: { orgId: ctx.orgId, archived: false } });
  const locations = await prisma.location.findMany({ where: { orgId: ctx.orgId, archived: false } });
  const fallback = categories.find((c) => c.kind === "OTHER") ?? categories[0];
  const get = (r: Record<string, string>, k: ImportFieldKey) => {
    const col = input.mapping[k];
    return col ? String(r[col] ?? "").trim() : "";
  };
  const serialsInFile = new Map<string, number>();
  const rows: PreviewRow[] = input.rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const title = get(r, "title");
    if (!title) errors.push("Nome do item vazio.");
    // Categoria: por nome, depois por palavras-chave do nome/categoria.
    const catText = get(r, "category");
    let cat = catText ? categories.find((c) => norm(c.name) === norm(catText)) : undefined;
    if (!cat) {
      const hay = ` ${norm(`${catText} ${title}`)} `;
      const kind = KIND_KEYWORDS.find(([, kws]) => kws.some((k) => hay.includes(k)))?.[0];
      cat = kind ? categories.find((c) => c.kind === kind) : undefined;
      if (cat && catText) warnings.push(`Categoria "${catText}" associada a "${cat.name}".`);
    }
    if (!cat) {
      cat = fallback;
      warnings.push(`Categoria não identificada; usada "${fallback?.name}".`);
    }
    const cond = parseCondition(get(r, "condition"));
    if (cond.warn) warnings.push(cond.warn);
    let quantity = 1;
    const qtyText = get(r, "quantity");
    if (qtyText) {
      const q = Number(qtyText.replace(",", "."));
      if (!Number.isInteger(q) || q < 1 || q > 1000) errors.push(`Quantidade inválida: "${qtyText}".`);
      else quantity = q;
    }
    const money = (k: ImportFieldKey, label: string) => {
      const t = get(r, k);
      if (!t) return null;
      try {
        const v = parseMoney(t);
        if (v !== null && v < 0) {
          errors.push(`${label} negativo.`);
          return null;
        }
        return v;
      } catch {
        errors.push(`${label} inválido: "${t}".`);
        return null;
      }
    };
    const costCents = money("cost", "Custo");
    const priceCents = money("price", "Preço");
    const marketValueCents = money("marketValue", "Valor de mercado");
    const estFlag = norm(get(r, "costEstimated"));
    let costMode: "KNOWN" | "ESTIMATED" | "UNKNOWN" = costCents === null ? "UNKNOWN" : ["sim", "s", "x", "estimado", "true", "1"].includes(estFlag) ? "ESTIMATED" : "KNOWN";
    if (costMode === "UNKNOWN") warnings.push("Sem custo: o item entra com custo desconhecido (não conta como zero).");
    if (costCents === 0) {
      warnings.push("Custo zero informado: confirme se o item foi realmente recebido sem custo.");
      costMode = "KNOWN";
    }
    if (priceCents !== null && costCents !== null && priceCents < costCents) warnings.push("Preço de venda abaixo do custo.");
    const serial = get(r, "serial") || null;
    if (serial) {
      if (quantity > 1) warnings.push("Número de série com quantidade maior que 1: a série será ignorada.");
      serialsInFile.set(serial.toUpperCase(), (serialsInFile.get(serial.toUpperCase()) ?? 0) + 1);
    }
    const locName = get(r, "location") || null;
    const loc = locName ? locations.find((l) => norm(l.name) === norm(locName)) : undefined;
    if (locName && !loc) warnings.push(`Local "${locName}" não existe e será criado.`);
    const dateText = get(r, "acquiredAt");
    const acquiredAt = parseDate(dateText);
    if (dateText && !acquiredAt) warnings.push(`Data "${dateText}" não reconhecida; usada a data de hoje.`);
    const tags = get(r, "tags")
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    return {
      row: i + 2,
      ok: errors.length === 0,
      errors,
      warnings,
      data: {
        title,
        categoryId: cat?.id ?? null,
        categoryName: cat?.name ?? "",
        brand: get(r, "brand") || null,
        model: get(r, "model") || null,
        serial: quantity > 1 ? null : serial,
        condition: cond.value,
        quantity,
        costCents,
        costMode,
        priceCents,
        marketValueCents,
        locationName: locName,
        locationId: loc?.id ?? null,
        defects: get(r, "defects") || null,
        notes: get(r, "notes") || null,
        acquiredAt: acquiredAt ? acquiredAt.toISOString() : null,
        tags,
      },
    };
  });
  // Duplicados: série repetida no arquivo ou já existente no estoque.
  const fileSerials = rows.map((r) => r.data.serial).filter(Boolean) as string[];
  const existing = fileSerials.length
    ? await prisma.item.findMany({
        where: { orgId: ctx.orgId, serial: { in: fileSerials, mode: "insensitive" }, status: { notIn: ["VOID"] } },
        select: { serial: true, code: true },
      })
    : [];
  for (const r of rows) {
    if (!r.data.serial) continue;
    if ((serialsInFile.get(r.data.serial.toUpperCase()) ?? 0) > 1) r.warnings.push("Número de série repetido nesta planilha.");
    const ex = existing.find((e) => e.serial?.toUpperCase() === r.data.serial!.toUpperCase());
    if (ex) r.warnings.push(`Possível duplicado: já existe ${ex.code} com esta série.`);
  }
  const summary = {
    total: rows.length,
    valid: rows.filter((r) => r.ok).length,
    invalid: rows.filter((r) => !r.ok).length,
    withWarnings: rows.filter((r) => r.ok && r.warnings.length).length,
    unknownCost: rows.filter((r) => r.ok && r.data.costMode === "UNKNOWN").length,
    units: rows.filter((r) => r.ok).reduce((a, r) => a + r.data.quantity, 0),
  };
  return { rows, summary };
}

/** Grava as linhas válidas (as inválidas são ignoradas) num lote reversível. */
export async function applyImport(
  ctx: Ctx,
  input: { fileName: string; rows: Record<string, string>[]; mapping: ImportMapping; skipDuplicates: boolean },
) {
  requirePerm(ctx, "data.import");
  const preview = await previewImport(ctx, input);
  const valid = preview.rows.filter((r) => r.ok && !(input.skipDuplicates && r.warnings.some((w) => w.startsWith("Possível duplicado"))));
  assert(valid.length > 0, "Nenhuma linha válida para importar.");
  return withTx(
    async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          orgId: ctx.orgId,
          fileName: input.fileName.slice(0, 200),
          rowCount: preview.rows.length,
          createdCount: 0,
          warnings: JSON.parse(JSON.stringify(preview.rows.filter((r) => r.warnings.length || r.errors.length).map((r) => ({ row: r.row, errors: r.errors, warnings: r.warnings })))),
          createdById: ctx.userId,
        },
      });
      const locCache = new Map<string, string>();
      let created = 0;
      for (const r of valid) {
        let locationId = r.data.locationId;
        if (!locationId && r.data.locationName) {
          const key = norm(r.data.locationName);
          locationId = locCache.get(key) ?? null;
          if (!locationId) {
            const loc = await tx.location.create({ data: { orgId: ctx.orgId, name: r.data.locationName, kind: "OTHER" } });
            locationId = loc.id;
            locCache.set(key, loc.id);
          }
        }
        const cat = await tx.category.findFirstOrThrow({ where: { id: r.data.categoryId!, orgId: ctx.orgId } });
        const isLot = cat.kind === "CONSUMABLE" && r.data.quantity > 1;
        const product = await ensureProduct(tx, ctx, {
          categoryId: cat.id,
          brand: r.data.brand,
          model: r.data.model,
          name: r.data.brand || r.data.model ? null : r.data.title,
          tracking: isLot ? "LOT" : "UNIT",
        });
        const n = product.tracking === "LOT" ? 1 : r.data.quantity;
        for (let u = 0; u < n; u++) {
          await insertItem(tx, ctx, {
            product,
            title: r.data.title,
            serial: r.data.serial,
            condition: r.data.condition,
            quantity: product.tracking === "LOT" ? r.data.quantity : 1,
            unitCostCents: r.data.costMode === "UNKNOWN" ? null : r.data.costCents,
            costStatus: r.data.costMode,
            costBreakdown:
              r.data.costMode === "UNKNOWN" || !r.data.costCents
                ? []
                : [{ kind: "ACQUISITION", amountCents: r.data.costCents * (product.tracking === "LOT" ? r.data.quantity : 1), description: `Custo da planilha "${input.fileName}"${r.data.costMode === "ESTIMATED" ? " (estimado)" : ""}` }],
            expectedPriceCents: r.data.priceCents,
            estimatedValueCents: r.data.marketValueCents,
            estimatedValueNote: r.data.marketValueCents ? "Informado na importação" : null,
            locationId,
            defects: r.data.defects,
            notes: r.data.notes,
            tags: r.data.tags,
            acquisitionType: "IMPORT",
            acquiredAt: r.data.acquiredAt ? new Date(r.data.acquiredAt) : undefined,
            importBatchId: batch.id,
            eventMessage: `Importado da planilha "${input.fileName}" (linha ${r.row})`,
            refType: "IMPORT",
            refId: batch.id,
          });
          created++;
        }
      }
      await tx.importBatch.update({ where: { id: batch.id }, data: { createdCount: created } });
      await audit(tx, ctx, "import.apply", `Importação "${input.fileName}": ${created} item(ns)`, { entityType: "ImportBatch", entityId: batch.id });
      return { batchId: batch.id, created, skipped: preview.rows.length - valid.length };
    },
    { timeoutMs: 120_000 },
  );
}

/** Desfaz uma importação, se nenhum item dela já foi usado em operação. */
export async function revertImport(ctx: Ctx, batchId: string) {
  requirePerm(ctx, "data.import");
  return withTx(async (tx) => {
    const batch = await tx.importBatch.findFirst({ where: { id: batchId, orgId: ctx.orgId } });
    if (!batch) throw new NotFoundError("Importação");
    if (batch.status !== "APPLIED") throw new DomainError("Esta importação já foi desfeita.");
    const items = await tx.item.findMany({ where: { orgId: ctx.orgId, importBatchId: batch.id } });
    const used = items.filter(
      (i) => !["AVAILABLE", "INSPECTION", "DEFECTIVE"].includes(i.status) || (i.tracking === "LOT" && (i.qtyOnHand !== i.qtyInitial || i.qtyReserved > 0)),
    );
    if (used.length) {
      throw new DomainError(`Não é possível desfazer: ${used.slice(0, 5).map((u) => u.code).join(", ")}${used.length > 5 ? "…" : ""} já foi usado. Dê baixa individual nesses itens.`);
    }
    const costs = await tx.costEntry.count({ where: { orgId: ctx.orgId, itemId: { in: items.map((i) => i.id) }, refType: { not: "IMPORT" } } });
    if (costs) throw new DomainError("Alguns itens já receberam custos adicionais com pagamento. Dê baixa individual.");
    await tx.item.updateMany({ where: { orgId: ctx.orgId, importBatchId: batch.id }, data: { status: "VOID", qtyOnHand: 0, exitedAt: new Date() } });
    for (const it of items) {
      await itemEvent(tx, ctx, { itemId: it.id, type: "VOIDED", message: `Importação "${batch.fileName}" desfeita`, fromStatus: it.status, toStatus: "VOID", refType: "IMPORT", refId: batch.id });
    }
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "REVERTED", revertedAt: new Date() } });
    await audit(tx, ctx, "import.revert", `Importação "${batch.fileName}" desfeita (${items.length} itens anulados)`, { entityType: "ImportBatch", entityId: batch.id });
    return { voided: items.length };
  });
}
