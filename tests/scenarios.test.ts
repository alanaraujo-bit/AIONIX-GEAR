/**
 * Cenários reais de ponta a ponta (A–J) executados contra PostgreSQL real.
 * Cada cenário cria sua própria empresa, então também exercita o isolamento.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/server/db";
import { newOrg, memberCtx, item, balance, ALL_TIME } from "./helpers";
import { savePurchase } from "@/server/domain/purchases";
import { saveSale, cancelSale, returnSale, markDelivered } from "@/server/domain/sales";
import { saveTrade, confirmTrade, cancelTrade, previewTrade } from "@/server/domain/trades";
import { saveBuild, addBuildPart, addBuildExpense, completeBuild, buildCosting, disassemble, removeBuildPart } from "@/server/domain/builds";
import { registerSettlement } from "@/server/domain/finance";
import { startCount, scanCountItem, closeCount } from "@/server/domain/stockcount";
import { inviteMember, acceptInvitation } from "@/server/domain/team";
import { previewImport, applyImport, revertImport } from "@/server/domain/imports";
import { createItem, moveItems } from "@/server/domain/items";
import { saveContact } from "@/server/domain/contacts";
import { profitAndLoss, inventorySummary, itemProfit, integrityChecks, cashSummary } from "@/server/domain/reports";
import type { Ctx } from "@/server/context";

const R = (reais: number) => Math.round(reais * 100);

async function buyOne(
  o: Awaited<ReturnType<typeof newOrg>>,
  kind: string,
  name: string,
  price: number,
  extra: { specs?: Record<string, unknown>; serial?: string; locationId?: string; contactId?: string; freight?: number } = {},
) {
  const r = await savePurchase(o.ctx, {
    contactId: extra.contactId,
    date: new Date(),
    lines: [
      {
        product: { categoryId: o.cat(kind), name, specs: extra.specs },
        quantity: 1,
        unitPriceCents: R(price),
        serials: extra.serial ? [extra.serial] : [],
        locationId: extra.locationId ?? o.locationId,
      },
    ],
    extras: extra.freight ? [{ kind: "FREIGHT", description: "Frete", amountCents: R(extra.freight) }] : [],
    confirm: true,
    payment: { now: [{ amountCents: R(price + (extra.freight ?? 0)), accountId: o.bank, method: "PIX" }] },
  });
  return r.items[0].id;
}

async function expectIntegrity(orgId: string) {
  const res = await integrityChecks(orgId);
  const failed = res.checks.filter((c) => !c.ok);
  expect(failed, JSON.stringify(failed)).toEqual([]);
}

describe("A — GPU usada comprada de pessoa física e vendida com lucro real", () => {
  it("rastreia custo com frete, venda com taxa retida e lucro realizado", async () => {
    const o = await newOrg();
    const seller = await saveContact(o.ctx, { name: "João da OLX", isSupplier: true, whatsapp: "91999990000" });
    const shelf = await prisma.location.create({ data: { orgId: o.orgId, name: "Prateleira A", kind: "SHELF" } });
    const gpuId = await buyOne(o, "GPU", "RTX 3060 12GB", 1500, { serial: "SN-3060-XYZ", locationId: shelf.id, contactId: seller.id, freight: 50 });
    const gpu = await item(o.orgId, gpuId);
    expect(gpu.unitCostCents).toBe(R(1550));
    expect(gpu.serial).toBe("SN-3060-XYZ");
    expect(gpu.locationId).toBe(shelf.id);
    expect(gpu.status).toBe("AVAILABLE");

    const buyer = await saveContact(o.ctx, { name: "Maria Compradora", isCustomer: true });
    await saveSale(o.ctx, {
      action: "CONFIRM",
      contactId: buyer.id,
      date: new Date(),
      lines: [{ itemId: gpuId, unitPriceCents: R(2200) }],
      feeCents: R(88),
      feeWithheld: true,
      delivered: true,
      payment: { now: [{ amountCents: R(2112), accountId: o.bank, method: "CREDIT" }] },
    });
    const sold = await item(o.orgId, gpuId);
    expect(sold.status).toBe("DELIVERED");
    const p = await itemProfit(o.orgId, gpuId);
    expect(p.revenueCents).toBe(R(2200));
    expect(p.cogsCents).toBe(R(1550));
    expect(p.grossProfitCents).toBe(R(650));
    expect(p.allocatedSalesExpenseCents).toBe(R(88));
    expect(p.netProfitCents).toBe(R(562));
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.netResultCents).toBe(R(562));
    // Caixa: pagou 1.550, recebeu 2.112 → +562 (lucro = caixa neste caso simples)
    expect(await balance(o.orgId)).toBe(R(562));
    const cash = await cashSummary(o.orgId);
    expect(cash.receivableCents).toBe(0);
    const events = await prisma.itemEvent.findMany({ where: { itemId: gpuId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["CREATED", "SOLD"]);
    await expectIntegrity(o.orgId);
  });
});

describe("B — módulos de RAM com custos diferentes, reserva e venda", () => {
  it("mantém custo e disponibilidade corretos por unidade", async () => {
    const o = await newOrg();
    const p = await savePurchase(o.ctx, {
      date: new Date(),
      lines: [
        { product: { categoryId: o.cat("RAM"), name: "Kingston Fury 8GB DDR4", specs: { memoryType: "DDR4", capacityGb: 8 } }, quantity: 2, unitPriceCents: R(100) },
        { product: { categoryId: o.cat("RAM"), name: "Kingston Fury 8GB DDR4" }, quantity: 2, unitPriceCents: R(120) },
      ],
      extras: [{ kind: "FREIGHT", description: "Correios", amountCents: R(20) }],
      confirm: true,
      payment: { now: [{ amountCents: R(460), accountId: o.cash, method: "CASH" }] },
    });
    expect(p.items).toHaveLength(4);
    const units = await prisma.item.findMany({ where: { orgId: o.orgId }, orderBy: { code: "asc" } });
    // Frete de 20 rateado pelo valor: 200/440 e 240/440 → 9,09 e 10,91 por linha
    expect(units.map((u) => u.unitCostCents)).toEqual([R(104.55), R(104.54), R(125.46), R(125.45)]);
    expect(units.reduce((a, u) => a + u.unitCostCents!, 0)).toBe(R(460));
    expect(new Set(units.map((u) => u.productId)).size).toBe(1);

    const b = await saveBuild(o.ctx, { name: "PC de entrada" });
    await addBuildPart(o.ctx, { buildId: b.id, itemId: units[0].id });
    await addBuildPart(o.ctx, { buildId: b.id, itemId: units[1].id });
    // Unidade reservada para montagem não pode ser vendida avulsa.
    await expect(
      saveSale(o.ctx, { action: "CONFIRM", date: new Date(), lines: [{ itemId: units[0].id, unitPriceCents: R(150) }], payment: { now: [{ amountCents: R(150), accountId: o.cash, method: "CASH" }] } }),
    ).rejects.toThrow(/indisponível/i);
    await saveSale(o.ctx, { action: "CONFIRM", date: new Date(), lines: [{ itemId: units[2].id, unitPriceCents: R(170) }], payment: { now: [{ amountCents: R(170), accountId: o.cash, method: "PIX" }] } });

    const after = await prisma.item.findMany({ where: { orgId: o.orgId }, orderBy: { code: "asc" } });
    expect(after.map((u) => u.status)).toEqual(["IN_BUILD", "IN_BUILD", "SOLD", "AVAILABLE"]);
    const inv = await inventorySummary(o.orgId);
    // No ativo: 2 em montagem + 1 disponível (o vendido saiu pelo CMV)
    expect(inv.ownedCostCents).toBe(R(104.55 + 104.54 + 125.45));
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueCents).toBe(R(170));
    expect(pl.cogsCents).toBe(R(125.46));
    await expectIntegrity(o.orgId);
  });
});

async function assembleTestPc(o: Awaited<ReturnType<typeof newOrg>>) {
  const cpu = await buyOne(o, "CPU", "Ryzen 5 5600", 800, { specs: { socket: "AM4", tdp: 65, igpu: "não" } });
  const mb = await buyOne(o, "MOTHERBOARD", "B550M Aorus", 600, { specs: { socket: "AM4", memoryType: "DDR4", memorySlots: 4, formFactor: "mATX", m2Slots: 2 } });
  const ram1 = await buyOne(o, "RAM", "Fury 8GB DDR4 3200", 110, { specs: { memoryType: "DDR4", capacityGb: 8, speedMhz: 3200 } });
  const ram2 = await buyOne(o, "RAM", "Fury 8GB DDR4 3200", 115, { specs: { memoryType: "DDR4", capacityGb: 8, speedMhz: 3200 } });
  const ssd = await buyOne(o, "STORAGE", "NVMe 1TB", 300, { specs: { interface: "NVMe", formFactor: "M.2" } });
  const psu = await buyOne(o, "PSU", "Fonte 650W Bronze", 350, { specs: { wattage: 650 } });
  const pcCase = await buyOne(o, "CASE", "Gabinete mATX", 250, { specs: { formFactor: "ATX, mATX", maxGpuLengthMm: 320 } });
  const gpu = await buyOne(o, "GPU", "RX 6600 8GB", 1200, { specs: { tdp: 132, lengthMm: 240 } });
  const paste = await savePurchase(o.ctx, {
    date: new Date(),
    lines: [{ product: { categoryId: o.cat("CONSUMABLE"), name: "Pasta térmica (seringa)", tracking: "LOT" }, quantity: 10, unitPriceCents: R(5) }],
    confirm: true,
    payment: { now: [{ amountCents: R(50), accountId: o.bank, method: "PIX" }] },
  });
  const b = await saveBuild(o.ctx, { name: "PC Gamer RX 6600", targetPriceCents: R(5200) });
  for (const id of [cpu, mb, ram1, ram2, ssd, psu, pcCase, gpu]) await addBuildPart(o.ctx, { buildId: b.id, itemId: id });
  await addBuildPart(o.ctx, { buildId: b.id, itemId: paste.items[0].id, quantity: 1 });
  await addBuildExpense(o.ctx, { buildId: b.id, kind: "LABOR", description: "Montador terceirizado", amountCents: R(100), paymentMode: "PAID", accountId: o.bank, method: "PIX" });
  await addBuildExpense(o.ctx, { buildId: b.id, kind: "TESTING", description: "Teste de estresse (energia)", amountCents: R(30), paymentMode: "PAYABLE" });
  return { b, parts: { cpu, mb, ram1, ram2, ssd, psu, pcCase, gpu }, pasteId: paste.items[0].id };
}

describe("C — montagem com peças do estoque, venda e rastreabilidade", () => {
  it("custo do PC = peças + despesas; peças instaladas não duplicam estoque; venda rastreável", async () => {
    const o = await newOrg();
    const { b, parts, pasteId } = await assembleTestPc(o);
    const costing = await buildCosting(o.orgId, b.id);
    const partsCost = R(800 + 600 + 110 + 115 + 300 + 350 + 250 + 1200 + 5);
    expect(costing.partsCostCents).toBe(partsCost);
    expect(costing.totalCostCents).toBe(partsCost + R(130));
    expect(costing.compat.filter((c) => c.level === "error")).toEqual([]);
    expect(costing.compat.some((c) => c.level === "ok" && c.text.includes("AM4"))).toBe(true);

    const invBefore = await inventorySummary(o.orgId);
    const done = await completeBuild(o.ctx, { buildId: b.id, expectedPriceCents: R(5200) });
    expect(done.totalCostCents).toBe(partsCost + R(130));
    const invAfter = await inventorySummary(o.orgId);
    // Capitalizou as despesas (130) e nada foi duplicado: peças saíram, PC entrou.
    expect(invAfter.ownedCostCents).toBe(invBefore.ownedCostCents + R(130));
    const pc = await item(o.orgId, done.pcItemId);
    expect(pc.unitCostCents).toBe(partsCost + R(130));
    const children = await prisma.item.findMany({ where: { parentItemId: pc.id } });
    expect(children).toHaveLength(8);
    expect(children.every((c) => c.status === "INSTALLED")).toBe(true);
    const lot = await item(o.orgId, pasteId);
    expect(lot.qtyOnHand).toBe(9);

    await saveSale(o.ctx, {
      action: "CONFIRM",
      date: new Date(),
      lines: [{ itemId: pc.id, unitPriceCents: R(5200) }],
      payment: { now: [{ amountCents: R(5200), accountId: o.bank, method: "PIX" }] },
    });
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueCents).toBe(R(5200));
    expect(pl.cogsCents).toBe(partsCost + R(130));
    expect(pl.netResultCents).toBe(R(5200) - partsCost - R(130));
    // Rastreio: cada peça instalada leva à compra original.
    for (const c of children) {
      const line = await prisma.purchaseLine.findUniqueOrThrow({ where: { id: c.sourcePurchaseLineId! } });
      const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: line.purchaseId } });
      expect(purchase.status).toBe("CONFIRMED");
    }
    expect(children.map((c) => c.id).sort()).toEqual(Object.values(parts).sort());
    // Despesa a pagar continua em aberto (teste de energia)
    const cash = await cashSummary(o.orgId);
    expect(cash.payableCents).toBe(R(30));
    await expectIntegrity(o.orgId);
  });

  it("substituição de peça com defeito libera a reserva e mantém histórico", async () => {
    const o = await newOrg();
    const { b, parts } = await assembleTestPc(o);
    const part = await prisma.buildPart.findFirstOrThrow({ where: { buildId: b.id, itemId: parts.gpu } });
    await removeBuildPart(o.ctx, { buildId: b.id, partId: part.id, reason: "Artefatos no teste", outcome: "DEFECTIVE" });
    const gpu = await item(o.orgId, parts.gpu);
    expect(gpu.status).toBe("DEFECTIVE");
    expect(gpu.holdId).toBeNull();
    const costing = await buildCosting(o.orgId, b.id);
    expect(costing.parts.find((p) => p.item.id === parts.gpu)).toBeUndefined();
  });
});

describe("D — catira: dois itens + volta em dinheiro por um PC; revenda sem receita fantasma", () => {
  it("transfere custo, não reconhece receita na troca e lucra só na revenda", async () => {
    const o = await newOrg();
    const gpu = await buyOne(o, "GPU", "RTX 2060", 1000);
    const monitor = await buyOne(o, "MONITOR", "Monitor 24 144Hz", 400);
    const partner = await saveContact(o.ctx, { name: "Carlos (catira)" });
    const t = await saveTrade(o.ctx, {
      title: "RTX 2060 + monitor por PC i5",
      contactId: partner.id,
      date: new Date(),
      status: "NEGOTIATING",
      out: [
        { itemId: gpu, agreedValueCents: R(1300), estimatedValueCents: R(1250) },
        { itemId: monitor, agreedValueCents: R(500) },
      ],
      in: [{ categoryId: o.cat("PC"), title: "PC i5 10400F + GTX 1660", agreedValueCents: R(2100), estimatedValueCents: R(2500), specs: { cpu: "i5 10400F", gpu: "GTX 1660" } }],
      cashOutCents: R(300),
      revision: { author: "THEM", note: "Proposta inicial dele" },
    });
    // Em negociação: itens bloqueados para venda.
    expect((await item(o.orgId, gpu)).status).toBe("IN_NEGOTIATION");
    const preview = await previewTrade(o.ctx, {
      id: t.id,
      title: "x",
      date: new Date(),
      out: [
        { itemId: gpu, agreedValueCents: R(1300) },
        { itemId: monitor, agreedValueCents: R(500) },
      ],
      in: [{ categoryId: o.cat("PC"), title: "PC", agreedValueCents: R(2100), estimatedValueCents: R(2500) }],
      cashOutCents: R(300),
    });
    expect(preview.incomingCostBasisCents).toBe(R(1700));
    expect(preview.realizedResultCents).toBe(0);
    expect(preview.agreedGainCents).toBe(R(0));
    expect(preview.potentialUpsideCents).toBe(R(800));
    expect(preview.netCashCents).toBe(-R(300));

    const res = await confirmTrade(o.ctx, { tradeId: t.id, cashOut: { now: [{ amountCents: R(300), accountId: o.bank, method: "PIX" }] } });
    expect(res.analysis.incomingCostBasisCents).toBe(R(1700));
    expect((await item(o.orgId, gpu)).status).toBe("EXCHANGED");
    expect((await item(o.orgId, monitor)).status).toBe("EXCHANGED");
    const pc = await prisma.item.findFirstOrThrow({ where: { orgId: o.orgId, sourceTradeId: t.id } });
    expect(pc.unitCostCents).toBe(R(1700));
    expect(pc.status).toBe("INSPECTION");
    let pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueCents).toBe(0);
    expect(pl.netResultCents).toBe(0);
    const inv = await inventorySummary(o.orgId);
    expect(inv.ownedCostCents).toBe(R(1700));
    expect(inv.ownedUnits).toBe(1);

    await prisma.item.update({ where: { id: pc.id }, data: { status: "AVAILABLE" } });
    await saveSale(o.ctx, { action: "CONFIRM", date: new Date(), lines: [{ itemId: pc.id, unitPriceCents: R(2400) }], payment: { now: [{ amountCents: R(2400), accountId: o.bank, method: "PIX" }] } });
    pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueCents).toBe(R(2400));
    expect(pl.cogsCents).toBe(R(1700));
    expect(pl.netResultCents).toBe(R(700));
    // Caixa: -1000 -400 (compras) -300 (volta) +2400 = +700
    expect(await balance(o.orgId)).toBe(R(700));
    const revisions = await prisma.tradeRevision.count({ where: { tradeId: t.id } });
    expect(revisions).toBe(1);
    await expectIntegrity(o.orgId);
  });

  it("volta recebida acima do custo vira resultado realizado e itens entram a custo zero", async () => {
    const o = await newOrg();
    const old = await buyOne(o, "GPU", "GTX 1050", 200);
    const t = await saveTrade(o.ctx, {
      title: "1050 + volta",
      date: new Date(),
      out: [{ itemId: old, agreedValueCents: R(600) }],
      in: [{ categoryId: o.cat("PERIPHERAL"), title: "Teclado mecânico", agreedValueCents: R(200) }],
      cashInCents: R(400),
    });
    const r = await confirmTrade(o.ctx, { tradeId: t.id, cashIn: { now: [{ amountCents: R(400), accountId: o.cash, method: "CASH" }] } });
    expect(r.analysis.realizedResultCents).toBe(R(200));
    expect(r.analysis.incomingCostBasisCents).toBe(0);
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.otherIncomeCents).toBe(R(200));
    expect(pl.revenueCents).toBe(0);
  });

  it("desfaz catira confirmada com estorno completo", async () => {
    const o = await newOrg();
    const a = await buyOne(o, "GPU", "RX 580", 500);
    const t = await saveTrade(o.ctx, {
      title: "RX 580 por notebook",
      date: new Date(),
      out: [{ itemId: a, agreedValueCents: R(700) }],
      in: [{ categoryId: o.cat("NOTEBOOK"), title: "Notebook i5", agreedValueCents: R(900) }],
      cashOutCents: R(200),
    });
    await confirmTrade(o.ctx, { tradeId: t.id, cashOut: { now: [{ amountCents: R(200), accountId: o.bank, method: "PIX" }] } });
    expect(await balance(o.orgId)).toBe(-R(700));
    await cancelTrade(o.ctx, { tradeId: t.id, reason: "Notebook com defeito oculto" });
    expect((await item(o.orgId, a)).status).toBe("AVAILABLE");
    expect((await item(o.orgId, a)).unitCostCents).toBe(R(500));
    const nb = await prisma.item.findFirstOrThrow({ where: { orgId: o.orgId, sourceTradeId: t.id } });
    expect(nb.status).toBe("VOID");
    expect(await balance(o.orgId)).toBe(-R(500));
    const inv = await inventorySummary(o.orgId);
    expect(inv.ownedCostCents).toBe(R(500));
    await expectIntegrity(o.orgId);
  });
});

describe("E — desmontagem com rateio transparente", () => {
  it("PC recebido pronto: rateio por valor estimado + descarte vira perda", async () => {
    const o = await newOrg();
    const pc = await createItem(o.ctx, {
      product: { categoryId: o.cat("PC"), name: "PC usado completo" },
      origin: "MIGRATION",
      costMode: "KNOWN",
      unitCostCents: R(1700),
    });
    const r = await disassemble(o.ctx, {
      itemId: pc.id,
      method: "BY_VALUE",
      newComponents: [
        { categoryId: o.cat("GPU"), title: "GTX 1660", estimatedValueCents: R(900) },
        { categoryId: o.cat("CPU"), title: "i5 10400F", estimatedValueCents: R(500) },
        { categoryId: o.cat("MOTHERBOARD"), title: "H410M", estimatedValueCents: R(300) },
        { categoryId: o.cat("CASE"), title: "Gabinete quebrado", estimatedValueCents: R(100), outcome: "SCRAP" },
      ],
    });
    const comps = await prisma.item.findMany({ where: { orgId: o.orgId, sourceDisassemblyId: r.id } });
    expect(comps).toHaveLength(3);
    const total = comps.reduce((a, c) => a + c.unitCostCents!, 0);
    const dis = await prisma.disassembly.findUniqueOrThrow({ where: { id: r.id } });
    expect(total + dis.writeOffCents).toBe(R(1700));
    expect(comps.find((c) => c.title === "GTX 1660")!.unitCostCents).toBe(R(850));
    // 1700 × 100/1800 = 94,444… — o centavo de sobra do rateio vai para a maior fração.
    expect(dis.writeOffCents).toBe(R(94.45));
    expect((await item(o.orgId, pc.id)).status).toBe("DISASSEMBLED");
    const inv = await inventorySummary(o.orgId);
    expect(inv.ownedCostCents).toBe(total);
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.otherExpenseCents).toBe(dis.writeOffCents);
    await expectIntegrity(o.orgId);
  });

  it("PC montado aqui: peças voltam com custo original e despesas são rateadas", async () => {
    const o = await newOrg();
    const { b } = await assembleTestPc(o);
    const done = await completeBuild(o.ctx, { buildId: b.id });
    const children = await prisma.item.findMany({ where: { parentItemId: done.pcItemId } });
    const original = children.reduce((a, c) => a + c.unitCostCents!, 0);
    await disassemble(o.ctx, {
      itemId: done.pcItemId,
      method: "ORIGINAL_COST",
      remainder: "WRITE_OFF",
      children: children.map((c) => ({ itemId: c.id, outcome: "AVAILABLE" as const })),
    });
    const back = await prisma.item.findMany({ where: { id: { in: children.map((c) => c.id) } } });
    expect(back.every((c) => c.status === "AVAILABLE" && c.parentItemId === null)).toBe(true);
    expect(back.reduce((a, c) => a + c.unitCostCents!, 0)).toBe(original);
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    // Pasta consumida (5) + despesas (130) viram perda declarada.
    expect(pl.otherExpenseCents).toBe(done.totalCostCents - original);
    await expectIntegrity(o.orgId);
  });
});

describe("F — venda parcelada, recebimento, devolução e cancelamento", () => {
  it("recebimento parcial, devolução abate o saldo e devolve o pago", async () => {
    const o = await newOrg();
    const ssd = await buyOne(o, "STORAGE", "SSD 1TB", 300);
    const cust = await saveContact(o.ctx, { name: "Pedro" });
    const s = await saveSale(o.ctx, {
      action: "CONFIRM",
      contactId: cust.id,
      date: new Date(),
      lines: [{ itemId: ssd, unitPriceCents: R(500) }],
      delivered: true,
      payment: { now: [{ amountCents: R(200), accountId: o.cash, method: "CASH" }], remainder: { installments: 2, firstDueDate: new Date(Date.now() + 30 * 86_400_000) } },
    });
    let cash = await cashSummary(o.orgId);
    expect(cash.receivableCents).toBe(R(300));
    const titles = await prisma.title.findMany({ where: { orgId: o.orgId, sourceId: s.id, status: "OPEN" }, orderBy: { dueDate: "asc" } });
    expect(titles.map((t) => t.amountCents)).toEqual([R(150), R(150)]);
    await registerSettlement(o.ctx, { titleId: titles[0].id, amountCents: R(150), accountId: o.cash, method: "PIX" });
    // Pagamento duplicado é rejeitado (passaria do saldo)
    await expect(registerSettlement(o.ctx, { titleId: titles[0].id, amountCents: R(10), accountId: o.cash, method: "PIX" })).rejects.toThrow();
    cash = await cashSummary(o.orgId);
    expect(cash.receivableCents).toBe(R(150));
    let pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.grossProfitCents).toBe(R(200));

    const line = await prisma.saleLine.findFirstOrThrow({ where: { saleId: s.id } });
    await returnSale(o.ctx, { saleId: s.id, lines: [{ saleLineId: line.id, quantity: 1 }], reason: "Cliente desistiu", refundCents: R(500), refundMode: "NOW", accountId: o.cash, itemStatus: "RETURNED" });
    const it = await item(o.orgId, ssd);
    expect(it.status).toBe("RETURNED");
    expect(it.unitCostCents).toBe(R(300));
    cash = await cashSummary(o.orgId);
    expect(cash.receivableCents).toBe(0);
    pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueCents).toBe(0);
    expect(pl.cogsCents).toBe(0);
    // Caixa: -300 compra, +200 +150 recebidos, -350 reembolso = -300 (só a compra)
    expect(await balance(o.orgId)).toBe(-R(300));
    const inv = await inventorySummary(o.orgId);
    expect(inv.ownedCostCents).toBe(R(300));
    await expectIntegrity(o.orgId);
  });

  it("cancelamento de venda paga devolve dinheiro, estorna receita e repõe estoque", async () => {
    const o = await newOrg();
    const cpu = await buyOne(o, "CPU", "i3 12100F", 450);
    const s = await saveSale(o.ctx, {
      action: "CONFIRM",
      date: new Date(),
      lines: [{ itemId: cpu, unitPriceCents: R(650) }],
      shippingCostCents: R(25),
      shippingAccountId: o.bank,
      payment: { now: [{ amountCents: R(650), accountId: o.bank, method: "PIX" }] },
    });
    expect((await item(o.orgId, cpu)).status).toBe("SOLD");
    await markDelivered(o.ctx, { saleId: s.id });
    expect((await item(o.orgId, cpu)).status).toBe("DELIVERED");
    const r = await cancelSale(o.ctx, { saleId: s.id, reason: "Produto não serviu", refundAccountId: o.bank });
    expect(r.refundedCents).toBe(R(650));
    expect((await item(o.orgId, cpu)).status).toBe("AVAILABLE");
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueCents).toBe(0);
    expect(pl.cogsCents).toBe(0);
    // O frete já pago continua sendo despesa real.
    expect(pl.salesExpenseCents).toBe(R(25));
    expect(await balance(o.orgId)).toBe(-R(450) - R(25));
    await expect(cancelSale(o.ctx, { saleId: s.id, reason: "de novo" })).rejects.toThrow(/já está cancelada/);
    await expectIntegrity(o.orgId);
  });

  it("orçamento não é venda: reserva sem receita e libera ao cancelar", async () => {
    const o = await newOrg();
    const m = await buyOne(o, "MONITOR", "Monitor 27", 900);
    const q = await saveSale(o.ctx, { action: "QUOTE", date: new Date(), reserveItems: true, quoteValidUntil: new Date(Date.now() + 86_400_000), lines: [{ itemId: m, unitPriceCents: R(1300) }] });
    expect((await item(o.orgId, m)).status).toBe("RESERVED");
    expect((await profitAndLoss(o.orgId, ALL_TIME)).revenueCents).toBe(0);
    await cancelSale(o.ctx, { saleId: q.id, reason: "Cliente sumiu" });
    expect((await item(o.orgId, m)).status).toBe("AVAILABLE");
  });
});

describe("G — inventário: item no lugar errado e item faltando", () => {
  it("detecta, corrige com motivo e preserva a trilha original", async () => {
    const o = await newOrg();
    const shelf = await prisma.location.create({ data: { orgId: o.orgId, name: "Prateleira A", kind: "SHELF" } });
    const drawer = await prisma.location.create({ data: { orgId: o.orgId, name: "Gaveta B", kind: "DRAWER" } });
    const a = await buyOne(o, "RAM", "RAM 16GB", 200, { locationId: shelf.id });
    const b = await buyOne(o, "STORAGE", "HD 1TB", 150, { locationId: drawer.id });
    const c = await buyOne(o, "PERIPHERAL", "Mouse gamer", 80, { locationId: drawer.id });
    const count = await startCount(o.ctx, { name: "Contagem da gaveta", locationId: drawer.id });
    expect(count.expected).toBe(2);
    const aCode = (await item(o.orgId, a)).code;
    const bCode = (await item(o.orgId, b)).code;
    // Encontrou o HD (certo) e a RAM, que o sistema achava estar na prateleira.
    expect((await scanCountItem(o.ctx, { countId: count.id, code: bCode, foundLocationId: drawer.id })).result).toBe("FOUND");
    expect((await scanCountItem(o.ctx, { countId: count.id, code: aCode, foundLocationId: drawer.id })).result).toBe("WRONG_LOCATION");
    const lines = await prisma.stockCountLine.findMany({ where: { countId: count.id } });
    const lineA = lines.find((l) => l.itemId === a)!;
    const lineC = lines.find((l) => l.itemId === c)!;
    await closeCount(o.ctx, {
      countId: count.id,
      resolutions: [
        { lineId: lineA.id, action: "MOVE", note: "Estava guardada na gaveta" },
        { lineId: lineC.id, action: "DISPOSE", note: "Não encontrado após busca completa" },
      ],
    });
    expect((await item(o.orgId, a)).locationId).toBe(drawer.id);
    expect((await item(o.orgId, c)).status).toBe("DISPOSED");
    const evA = await prisma.itemEvent.findMany({ where: { itemId: a }, orderBy: { createdAt: "asc" } });
    expect(evA[0].toLocationId).toBe(shelf.id);
    const move = evA.find((e) => e.type === "MOVED")!;
    expect(move.fromLocationId).toBe(shelf.id);
    expect(move.refType).toBe("STOCK_COUNT");
    expect(move.reason).toMatch(/Inventário/);
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.otherExpenseCents).toBe(R(80));
    const audits = await prisma.auditLog.count({ where: { orgId: o.orgId, action: { in: ["item.move", "item.dispose", "count.close"] } } });
    expect(audits).toBeGreaterThanOrEqual(3);
    await expectIntegrity(o.orgId);
  });
});

describe("H — segundo operador com permissões restritas e isolamento entre empresas", () => {
  it("convite, papel de vendas restrito e nenhuma visibilidade cruzada", async () => {
    const o = await newOrg("Gabriel Hardware");
    const inv = await inviteMember(o.ctx, { email: `vendedor${Date.now()}@teste.dev`, name: "Vendedor", role: "SALES" });
    const accepted = await acceptInvitation({ token: inv.token, name: "Vendedor", password: "senha-forte-123" });
    await expect(acceptInvitation({ token: inv.token, name: "x", password: "senha-forte-123" })).rejects.toThrow(/expirou ou já foi usado/);
    const sales: Ctx = { orgId: o.orgId, userId: accepted.userId, role: "SALES" };
    const gpu = await buyOne(o, "GPU", "RTX 3070", 2000);
    await expect(savePurchase(sales, { date: new Date(), lines: [{ product: { categoryId: o.cat("GPU"), name: "x" }, quantity: 1, unitPriceCents: 1 }] })).rejects.toThrow(/permissão/);
    await expect(createItem(sales, { product: { categoryId: o.cat("GPU"), name: "x" }, origin: "MIGRATION", costMode: "UNKNOWN" })).rejects.toThrow(/permissão/);
    await expect(saveBuild(sales, { name: "x" })).rejects.toThrow(/permissão/);
    await saveSale(sales, { action: "CONFIRM", date: new Date(), lines: [{ itemId: gpu, unitPriceCents: R(2600) }], payment: { now: [{ amountCents: R(2600), accountId: o.bank, method: "PIX" }] } });

    const stock: Ctx = await memberCtx(o.orgId, "INVENTORY");
    await expect(saveSale(stock, { action: "QUOTE", date: new Date(), lines: [{ itemId: gpu, unitPriceCents: 1 }] })).rejects.toThrow(/permissão/);

    // Outra empresa, totalmente independente
    const other = await newOrg("Outra Loja");
    const foreign = await buyOne(other, "CPU", "Ryzen 7", 1000);
    await expect(
      saveSale(o.ctx, { action: "CONFIRM", date: new Date(), lines: [{ itemId: foreign, unitPriceCents: 1 }], payment: { now: [] } }),
    ).rejects.toThrow(/não encontrado/);
    await expect(moveItems(o.ctx, { itemIds: [foreign], locationId: o.locationId })).rejects.toThrow(/não encontrado/);
    await expect(registerSettlement(o.ctx, { titleId: (await prisma.title.findFirstOrThrow({ where: { orgId: other.orgId } })).id, amountCents: 1, accountId: o.bank, method: "PIX" })).rejects.toThrow(/não encontrado/);
    // A conta de outra empresa não pode ser usada nem como destino de pagamento.
    const g2 = await buyOne(o, "GPU", "RTX 3050", 900);
    await expect(
      saveSale(o.ctx, { action: "CONFIRM", date: new Date(), lines: [{ itemId: g2, unitPriceCents: R(1000) }], payment: { now: [{ amountCents: R(1000), accountId: other.bank, method: "PIX" }] } }),
    ).rejects.toThrow(/não encontrad/);
    expect((await item(other.orgId, foreign)).status).toBe("AVAILABLE");
    const otherInv = await inventorySummary(other.orgId);
    expect(otherInv.ownedCostCents).toBe(R(1000));
  });
});

describe("I — importação de planilha imperfeita sem corromper relatórios", () => {
  it("prévia com avisos, custo desconhecido nunca vira zero, reversível", async () => {
    const o = await newOrg();
    await buyOne(o, "GPU", "RTX 2070", 1200, { serial: "DUP-123" });
    const rows: Record<string, string>[] = [
      { Produto: "RTX 3060 Ti", Categoria: "placa de video", Custo: "1.800,00", Preço: "2.300", Série: "AAA1", Local: "Caixa 3" },
      { Produto: "Memória DDR4 8GB", Categoria: "", Custo: "", Preço: "150", Série: "", Local: "Caixa 3" },
      { Produto: "Fonte 500W", Categoria: "Fontes", Custo: "abc", Preço: "", Série: "", Local: "" },
      { Produto: "RTX 2070 dup", Categoria: "GPU", Custo: "1000", Preço: "1500", Série: "DUP-123", Local: "" },
      { Produto: "", Categoria: "x", Custo: "1", Preço: "", Série: "", Local: "" },
      { Produto: "Cabo SATA", Categoria: "Insumos e consumíveis", Custo: "2", Preço: "10", Série: "", Local: "", Qtd: "20" },
    ];
    const mapping = { title: "Produto", category: "Categoria", cost: "Custo", price: "Preço", serial: "Série", location: "Local", quantity: "Qtd" };
    const prev = await previewImport(o.ctx, { rows, mapping });
    expect(prev.summary.total).toBe(6);
    expect(prev.summary.invalid).toBe(2);
    expect(prev.summary.unknownCost).toBe(1);
    expect(prev.rows[3].warnings.some((w) => w.includes("Possível duplicado"))).toBe(true);
    expect(prev.rows[1].data.categoryName).toBe("Memória RAM");

    const plBefore = await profitAndLoss(o.orgId, ALL_TIME);
    const invBefore = await inventorySummary(o.orgId);
    const applied = await applyImport(o.ctx, { fileName: "estoque.xlsx", rows, mapping, skipDuplicates: true });
    expect(applied.created).toBe(3);
    const imported = await prisma.item.findMany({ where: { orgId: o.orgId, importBatchId: applied.batchId } });
    const ram = imported.find((i) => i.title.startsWith("Memória"))!;
    expect(ram.unitCostCents).toBeNull();
    expect(ram.costStatus).toBe("UNKNOWN");
    const cable = imported.find((i) => i.title === "Cabo SATA")!;
    expect(cable.tracking).toBe("LOT");
    expect(cable.qtyOnHand).toBe(20);
    expect(await prisma.location.count({ where: { orgId: o.orgId, name: "Caixa 3" } })).toBe(1);
    const plAfter = await profitAndLoss(o.orgId, ALL_TIME);
    expect(plAfter).toEqual(plBefore);
    const invAfter = await inventorySummary(o.orgId);
    expect(invAfter.ownedCostCents).toBe(invBefore.ownedCostCents + R(1800) + R(40));
    expect(invAfter.unknownCostItems).toBe(1);
    expect(await balance(o.orgId)).toBe(-R(1200));

    // Venda de item com custo desconhecido é sinalizada nos relatórios.
    await saveSale(o.ctx, { action: "CONFIRM", date: new Date(), lines: [{ itemId: ram.id, unitPriceCents: R(150) }], payment: { now: [{ amountCents: R(150), accountId: o.cash, method: "CASH" }] } });
    const pl = await profitAndLoss(o.orgId, ALL_TIME);
    expect(pl.revenueWithUnknownCostCents).toBe(R(150));
    // Item já vendido impede desfazer a importação inteira.
    await expect(revertImport(o.ctx, applied.batchId)).rejects.toThrow(/já foi usado/);

    const o2 = await newOrg();
    const ap2 = await applyImport(o2.ctx, { fileName: "outra.csv", rows: rows.slice(0, 2), mapping, skipDuplicates: false });
    const r = await revertImport(o2.ctx, ap2.batchId);
    expect(r.voided).toBe(2);
    expect((await inventorySummary(o2.orgId)).ownedUnits).toBe(0);
  });
});

describe("J — tentativas simultâneas de vender o mesmo item serializado", () => {
  it("apenas uma disposição legítima vence", async () => {
    const o = await newOrg();
    const gpu = await buyOne(o, "GPU", "RTX 4060", 1700, { serial: "RACE-1" });
    const b = await saveBuild(o.ctx, { name: "Concorrente" });
    const attempts = Array.from({ length: 6 }, (_, i) =>
      saveSale(o.ctx, {
        action: "CONFIRM",
        date: new Date(),
        lines: [{ itemId: gpu, unitPriceCents: R(2000 + i) }],
        payment: { now: [{ amountCents: R(2000 + i), accountId: o.bank, method: "PIX" }] },
      }),
    );
    const t = saveTrade(o.ctx, { title: "concorrente", date: new Date(), status: "NEGOTIATING", out: [{ itemId: gpu, agreedValueCents: 1 }], in: [] });
    const results = await Promise.allSettled([...attempts, addBuildPart(o.ctx, { buildId: b.id, itemId: gpu }), t]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason?.message)).toMatch(/indisponível|insuficiente|mudou|não está disponível|outra operação/i);
    const confirmedLines = await prisma.saleLine.count({ where: { itemId: gpu, sale: { status: "CONFIRMED" } } });
    const inBuild = await prisma.buildPart.count({ where: { itemId: gpu, status: "ACTIVE" } });
    expect(confirmedLines + inBuild + ((await item(o.orgId, gpu)).status === "IN_NEGOTIATION" ? 1 : 0)).toBe(1);
    await expectIntegrity(o.orgId);
  });

  it("duplo clique com a mesma chave de idempotência gera uma única venda", async () => {
    const o = await newOrg();
    const ssd = await buyOne(o, "STORAGE", "SSD 512", 150);
    const payload = {
      action: "CONFIRM" as const,
      date: new Date(),
      lines: [{ itemId: ssd, unitPriceCents: R(250) }],
      payment: { now: [{ amountCents: R(250), accountId: o.cash, method: "CASH" as const }] },
      idempotencyKey: "form-abc-123",
    };
    const [a, b] = await Promise.all([saveSale(o.ctx, payload), saveSale(o.ctx, payload)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.sale.count({ where: { orgId: o.orgId } })).toBe(1);
    expect(await balance(o.orgId)).toBe(R(100));
  });
});
