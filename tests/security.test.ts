/**
 * Isolamento entre empresas nas LEITURAS, ocultação de custos por papel,
 * cascata de componentes de PC, fuso horário e totais grandes.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/server/db";
import { newOrg, memberCtx, item } from "./helpers";
import { savePurchase } from "@/server/domain/purchases";
import { saveSale } from "@/server/domain/sales";
import { saveBuild, addBuildPart, completeBuild } from "@/server/domain/builds";
import { saveTrade, confirmTrade } from "@/server/domain/trades";
import { getItemDetail, listItems, pickableItems } from "@/server/queries/items";
import { getSaleDetail, getPurchaseDetail, listSales } from "@/server/queries/commerce";
import { getTradeDetail } from "@/server/queries/trades";
import { getBuildDetail } from "@/server/queries/builds";
import { getContactDetail } from "@/server/queries/contacts";
import { listTitles, listTransactions } from "@/server/queries/finance";
import { searchAll } from "@/server/domain/search";
import { readAttachment, storeAttachment } from "@/server/storage";
import { profitAndLoss } from "@/server/domain/reports";
import { saveContact } from "@/server/domain/contacts";
import { parseDateInput, toDateInput, monthRange, dayRange } from "@/lib/dates";
import { parseMoney, allocate } from "@/lib/money";

const R = (r: number) => Math.round(r * 100);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function seedOrg(name: string) {
  const o = await newOrg(name);
  const c = await saveContact(o.ctx, { name: `Cliente ${name}`, isCustomer: true });
  const p = await savePurchase(o.ctx, {
    date: new Date(),
    lines: [{ product: { categoryId: o.cat("GPU"), name: `GPU ${name}` }, quantity: 1, unitPriceCents: R(1000), serials: [`SER-${name}`] }],
    confirm: true,
    payment: { now: [{ amountCents: R(1000), accountId: o.bank, method: "PIX" }] },
  });
  const s = await saveSale(o.ctx, { action: "CONFIRM", contactId: c.id, date: new Date(), lines: [{ itemId: p.items[0].id, unitPriceCents: R(1500) }], payment: { now: [{ amountCents: R(500), accountId: o.bank, method: "PIX" }] } });
  const att = await storeAttachment(o.ctx, { entityType: "Item", entityId: p.items[0].id, kind: "PHOTO", fileName: "a.png", bytes: PNG });
  return { o, contactId: c.id, itemId: p.items[0].id, purchaseId: p.id, saleId: s.id, attachmentId: att.id };
}

describe("Isolamento de leitura entre empresas", () => {
  it("nenhuma consulta devolve dados de outra empresa", async () => {
    const a = await seedOrg("A");
    const b = await seedOrg("B");
    expect(await getItemDetail(a.o.ctx, b.itemId)).toBeNull();
    expect(await getSaleDetail(a.o.ctx, b.saleId)).toBeNull();
    expect(await getPurchaseDetail(a.o.ctx, b.purchaseId)).toBeNull();
    expect(await getContactDetail(a.o.ctx, b.contactId)).toBeNull();
    expect(await readAttachment(a.o.ctx, b.attachmentId)).toBeNull();
    const list = await listItems(a.o.ctx, { group: "all" });
    expect(list.rows.every((r) => r.id !== b.itemId)).toBe(true);
    const sales = await listSales(a.o.ctx, {});
    expect(sales.rows.map((s) => s.id)).not.toContain(b.saleId);
    const titles = await listTitles(a.o.ctx, "RECEIVABLE", { situacao: "todos" });
    expect(titles.rows.every((t) => t.sourceId !== b.saleId)).toBe(true);
    const tx = await listTransactions(a.o.ctx, {});
    expect(tx.rows.every((t) => t.refId !== b.saleId && t.refId !== b.purchaseId)).toBe(true);
    const hits = await searchAll(a.o.ctx, "SER-B");
    expect(hits).toHaveLength(0);
    expect((await searchAll(a.o.ctx, "SER-A")).length).toBeGreaterThan(0);
    // Uma montagem/catira de B também não é visível para A
    const bt = await saveTrade(b.o.ctx, { title: "troca B", date: new Date(), out: [], in: [] });
    const bb = await saveBuild(b.o.ctx, { name: "PC B" });
    expect(await getTradeDetail(a.o.ctx, bt.id)).toBeNull();
    expect(await getBuildDetail(a.o.ctx, bb.id)).toBeNull();
  });

  it("anexo de outra empresa não pode ser criado nem lido", async () => {
    const a = await seedOrg("C");
    const b = await seedOrg("D");
    await expect(storeAttachment(a.o.ctx, { entityType: "Item", entityId: b.itemId, kind: "PHOTO", fileName: "x.png", bytes: PNG })).rejects.toThrow(/não encontrado/);
    await expect(storeAttachment(a.o.ctx, { entityType: "Item", entityId: a.itemId, kind: "PHOTO", fileName: "x.exe", bytes: new Uint8Array([0x4d, 0x5a, 0, 0]) })).rejects.toThrow(/Formato não aceito/);
  });
});

describe("Custos ocultos para quem não tem permissão", () => {
  it("vendas e estoque não recebem custo/margem do servidor", async () => {
    const a = await seedOrg("E");
    const sales = await memberCtx(a.o.orgId, "SALES");
    const stock = await memberCtx(a.o.orgId, "INVENTORY");
    for (const ctx of [sales, stock]) {
      const d = await getItemDetail(ctx, a.itemId);
      expect(d).not.toBeNull();
      expect(d!.unitCostCents).toBeUndefined();
      expect(d!.costs).toEqual([]);
      expect(d!.profit).toBeNull();
      const l = await listItems(ctx, { group: "all" });
      expect(l.rows[0].unitCostCents).toBeUndefined();
      expect(l.summary.costCents).toBeNull();
      const pick = await pickableItems(ctx, "sale");
      expect(pick.every((p) => p.unitCostCents === undefined)).toBe(true);
    }
    const sd = await getSaleDetail(sales, a.saleId);
    expect(sd!.profit).toBeNull();
    expect(sd!.lines.every((l) => l.costCents === null)).toBe(true);
    await expect(getSaleDetail(stock, a.saleId)).rejects.toThrow(/permissão/);
    await expect(listTransactions(sales, {})).rejects.toThrow(/permissão/);
  });
});

describe("PC vendido/entregue/trocado leva os componentes junto", () => {
  it("componentes saem do estoque físico com o PC", async () => {
    const o = await newOrg();
    const buy = async (kind: string, name: string) =>
      (
        await savePurchase(o.ctx, {
          date: new Date(),
          lines: [{ product: { categoryId: o.cat(kind), name }, quantity: 1, unitPriceCents: R(100) }],
          confirm: true,
          payment: { now: [{ amountCents: R(100), accountId: o.bank, method: "PIX" }] },
        })
      ).items[0].id;
    const parts = [await buy("CPU", "CPU"), await buy("MOTHERBOARD", "MB"), await buy("RAM", "RAM")];
    const b = await saveBuild(o.ctx, { name: "PC" });
    for (const id of parts) await addBuildPart(o.ctx, { buildId: b.id, itemId: id });
    const done = await completeBuild(o.ctx, { buildId: b.id });
    await saveSale(o.ctx, { action: "CONFIRM", date: new Date(), delivered: true, lines: [{ itemId: done.pcItemId, unitPriceCents: R(500) }], payment: { now: [{ amountCents: R(500), accountId: o.bank, method: "PIX" }] } });
    for (const id of parts) {
      const it = await item(o.orgId, id);
      expect(it.status).toBe("INSTALLED");
      expect(it.qtyOnHand).toBe(0);
      expect(it.exitedAt).not.toBeNull();
    }
    // Catira de um PC montado também leva os componentes
    const parts2 = [await buy("CPU", "CPU2"), await buy("RAM", "RAM2")];
    const b2 = await saveBuild(o.ctx, { name: "PC2" });
    for (const id of parts2) await addBuildPart(o.ctx, { buildId: b2.id, itemId: id });
    const pc2 = await completeBuild(o.ctx, { buildId: b2.id });
    const t = await saveTrade(o.ctx, { title: "PC2 por monitor", date: new Date(), out: [{ itemId: pc2.pcItemId, agreedValueCents: R(300) }], in: [{ categoryId: o.cat("MONITOR"), title: "Monitor", agreedValueCents: R(300) }] });
    await confirmTrade(o.ctx, { tradeId: t.id });
    for (const id of parts2) expect((await item(o.orgId, id)).qtyOnHand).toBe(0);
  });
});

describe("Datas no fuso da empresa (America/Belem)", () => {
  it("data de formulário vira meio-dia local e não muda de dia", () => {
    const d = parseDateInput("2026-10-12", "America/Belem")!;
    expect(d.toISOString()).toBe("2026-10-12T15:00:00.000Z");
    expect(toDateInput(d, "America/Belem")).toBe("2026-10-12");
    // 23h em Belém ainda é dia 12, embora em UTC já seja 13
    expect(toDateInput(new Date("2026-10-13T02:00:00Z"), "America/Belem")).toBe("2026-10-12");
    const day = dayRange("2026-10-12", "America/Belem");
    expect(day.from.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    const m = monthRange("America/Belem", 0, new Date("2026-10-01T01:00:00Z"));
    expect(toDateInput(m.from, "America/Belem")).toBe("2026-09-01");
  });

  it("dinheiro: leitura pt-BR e rateio exato", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 2.300")).toBe(230000);
    expect(parseMoney("12.50")).toBe(1250);
    expect(parseMoney("")).toBeNull();
    expect(() => parseMoney("abc")).toThrow();
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
});

describe("Totais grandes", () => {
  it("relatórios somam além de R$ 21 milhões sem estourar", async () => {
    const o = await newOrg();
    await prisma.resultEntry.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({ orgId: o.orgId, date: new Date(), kind: "REVENUE", amountCents: 900_000_000, description: `grande ${i}` })),
    });
    const pl = await profitAndLoss(o.orgId, { from: new Date("2000-01-01"), to: new Date("2100-01-01") });
    expect(pl.revenueCents).toBe(4_500_000_000);
  });
});
