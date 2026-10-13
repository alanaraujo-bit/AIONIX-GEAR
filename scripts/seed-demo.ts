/**
 * Cria uma EMPRESA DE DEMONSTRAÇÃO isolada, com dados fictícios realistas (marcada como demo
 * em todas as telas). Nunca mistura com a operação real: é outra organização.
 *
 *   npm run seed:demo -- --owner demo@exemplo.com [--member voce@exemplo.com]
 *
 * --owner  e-mail do dono da empresa demo (recebe link para definir senha)
 * --member e-mail de um usuário existente para entrar também como proprietário (ex.: você)
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { provisionOrganization } from "../src/server/domain/team";
import { savePurchase } from "../src/server/domain/purchases";
import { saveSale, returnSale } from "../src/server/domain/sales";
import { saveTrade, confirmTrade } from "../src/server/domain/trades";
import { saveBuild, addBuildPart, addBuildExpense, completeBuild, setBuildStage } from "../src/server/domain/builds";
import { saveContact } from "../src/server/domain/contacts";
import { saveOpportunity } from "../src/server/domain/opportunities";
import { createExpenseOrIncome, setOpeningBalance, registerSettlement } from "../src/server/domain/finance";
import { createItem } from "../src/server/domain/items";
import { startCount } from "../src/server/domain/stockcount";
import type { Ctx } from "../src/server/context";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const R = (r: number) => Math.round(r * 100);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000 + 3 * 3600_000);

async function main() {
  const owner = arg("owner");
  if (!owner) throw new Error("Informe --owner email@exemplo.com");
  if (await prisma.organization.findFirst({ where: { isDemo: true, name: "Demonstração — Hardware do Gabriel" } })) {
    throw new Error("A empresa de demonstração já existe. Use a plataforma para suspendê-la ou crie com outro nome.");
  }
  const p = await provisionOrganization({ orgName: "Demonstração — Hardware do Gabriel", ownerEmail: owner, ownerName: "Dono (demonstração)", isDemo: true });
  const ctx: Ctx = { orgId: p.orgId, userId: p.userId, role: "OWNER" };
  const member = arg("member");
  if (member) {
    const u = await prisma.user.findUnique({ where: { email: member.toLowerCase() } });
    if (u) await prisma.membership.upsert({ where: { orgId_userId: { orgId: p.orgId, userId: u.id } }, create: { orgId: p.orgId, userId: u.id, role: "OWNER" }, update: {} });
  }
  await prisma.organization.update({ where: { id: p.orgId }, data: { city: "Belém", state: "PA", phone: "(91) 90000-0000", onboardedAt: new Date() } });

  const cats = await prisma.category.findMany({ where: { orgId: p.orgId } });
  const cat = (k: string) => cats.find((c) => c.kind === k)!.id;
  const accs = await prisma.moneyAccount.findMany({ where: { orgId: p.orgId }, orderBy: { createdAt: "asc" } });
  const [cash, bank] = [accs[0].id, accs[1].id];
  await setOpeningBalance(ctx, { accountId: cash, amountCents: R(1800), date: daysAgo(120) });
  await setOpeningBalance(ctx, { accountId: bank, amountCents: R(24000), date: daysAgo(120) });

  // Locais
  const quarto = await prisma.location.create({ data: { orgId: p.orgId, name: "Quarto", kind: "ROOM" } });
  const pratA = await prisma.location.create({ data: { orgId: p.orgId, name: "Prateleira A", kind: "SHELF", parentId: quarto.id, code: "P-A" } });
  const pratB = await prisma.location.create({ data: { orgId: p.orgId, name: "Prateleira B", kind: "SHELF", parentId: quarto.id, code: "P-B" } });
  const gaveta = await prisma.location.create({ data: { orgId: p.orgId, name: "Gaveta de memórias", kind: "DRAWER", parentId: quarto.id, code: "G-1" } });
  const deposito = await prisma.location.create({ data: { orgId: p.orgId, name: "Depósito", kind: "STORAGE" } });
  const caixa3 = await prisma.location.create({ data: { orgId: p.orgId, name: "Caixa 3", kind: "BOX", parentId: deposito.id, code: "CX-03" } });

  // Contatos fictícios
  const c = async (name: string, extra: Record<string, unknown> = {}) => (await saveContact(ctx, { name, ...extra })).id;
  const joao = await c("João Pereira (demo)", { isSupplier: true, whatsapp: "91900000001", city: "Belém", state: "PA", tags: ["olx"] });
  const loja = await c("InfoPeças Distribuidora (demo)", { isSupplier: true, city: "Ananindeua", state: "PA" });
  const maria = await c("Maria Souza (demo)", { isCustomer: true, whatsapp: "91900000002", city: "Belém", state: "PA", tags: ["paga em dia"] });
  const pedro = await c("Pedro Lima (demo)", { isCustomer: true, whatsapp: "91900000003", city: "Marituba", state: "PA" });
  const carlos = await c("Carlos Andrade (demo)", { isCustomer: true, isSupplier: true, whatsapp: "91900000004", tags: ["catira"] });
  const ana = await c("Ana Ribeiro (demo)", { isCustomer: true, whatsapp: "91900000005" });
  const bruno = await c("Bruno Costa (demo)", { isCustomer: true, whatsapp: "91900000006" });

  const buy = async (days: number, contactId: string | null, lines: { kind: string; brand: string; model: string; qty?: number; price: number; ask?: number; loc?: string; specs?: Record<string, unknown>; serials?: string[]; tracking?: "LOT"; cond?: string }[], freight = 0, paidRatio = 1) => {
    const total = lines.reduce((a, l) => a + (l.qty ?? 1) * R(l.price), 0) + R(freight);
    const paid = Math.round(total * paidRatio);
    return savePurchase(ctx, {
      contactId,
      date: daysAgo(days),
      channel: contactId === joao ? "OLX" : "Loja",
      lines: lines.map((l) => ({
        product: { categoryId: cat(l.kind), brand: l.brand, model: l.model, specs: l.specs, tracking: l.tracking },
        quantity: l.qty ?? 1,
        unitPriceCents: R(l.price),
        expectedPriceCents: l.ask ? R(l.ask) : null,
        locationId: l.loc ?? pratA.id,
        serials: l.serials,
        condition: (l.cond ?? "GOOD") as never,
      })),
      extras: freight ? [{ kind: "FREIGHT", description: "Frete", amountCents: R(freight) }] : [],
      confirm: true,
      payment: { now: paid ? [{ amountCents: paid, accountId: bank, method: "PIX" }] : [], remainder: { installments: 1, firstDueDate: daysAgo(days - 20) } },
    });
  };

  // Compras ao longo de 4 meses
  const p1 = await buy(110, joao, [{ kind: "GPU", brand: "MSI", model: "RTX 3060 Ventus 2X 12GB", price: 1450, ask: 1990, specs: { vramGb: 12, tdp: 170, lengthMm: 235 }, serials: ["602-V397-0001"] }], 40);
  const p2 = await buy(100, loja, [
    { kind: "CPU", brand: "AMD", model: "Ryzen 5 5600", qty: 2, price: 690, ask: 899, specs: { socket: "AM4", tdp: 65, igpu: "não" }, loc: pratB.id },
    { kind: "MOTHERBOARD", brand: "Gigabyte", model: "B550M Aorus Elite", qty: 2, price: 620, ask: 799, specs: { socket: "AM4", memoryType: "DDR4", memorySlots: 4, formFactor: "mATX", m2Slots: 2 }, loc: pratB.id },
    { kind: "RAM", brand: "Kingston", model: "Fury Beast 8GB DDR4 3200", qty: 6, price: 95, ask: 139, specs: { memoryType: "DDR4", capacityGb: 8, speedMhz: 3200 }, loc: gaveta.id },
    { kind: "STORAGE", brand: "Kingston", model: "NV2 1TB NVMe", qty: 3, price: 260, ask: 349, specs: { interface: "NVMe", formFactor: "M.2", capacityGb: 1000 }, loc: pratB.id },
    { kind: "PSU", brand: "Corsair", model: "CV650 650W Bronze", qty: 2, price: 330, ask: 429, specs: { wattage: 650, certification: "80 Plus Bronze" }, loc: caixa3.id },
    { kind: "CASE", brand: "Pichau", model: "Kazan 2 mATX", qty: 2, price: 190, ask: 269, specs: { formFactor: "ATX, mATX", maxGpuLengthMm: 320 }, loc: caixa3.id },
    { kind: "CONSUMABLE", brand: "Arctic", model: "MX-4 pasta térmica 4g", qty: 10, price: 9, tracking: "LOT", loc: gaveta.id },
  ], 85, 0.6);
  const p3 = await buy(80, joao, [{ kind: "GPU", brand: "Gigabyte", model: "RX 6600 Eagle 8GB", price: 1080, ask: 1450, specs: { vramGb: 8, tdp: 132, lengthMm: 282 }, serials: ["SN6600-778"] }], 30);
  const p4 = await buy(75, joao, [{ kind: "MONITOR", brand: "AOC", model: "24G2 144Hz IPS", price: 520, ask: 749, loc: deposito.id }]);
  const p5 = await buy(60, loja, [{ kind: "GPU", brand: "Zotac", model: "GTX 1660 Super 6GB", price: 720, ask: 999, specs: { vramGb: 6, tdp: 125 } }], 25);
  const p6 = await buy(30, joao, [{ kind: "CPU", brand: "Intel", model: "Core i5-12400F", price: 610, ask: 799, specs: { socket: "LGA1700", tdp: 65, igpu: "não" }, loc: pratB.id }]);
  await buy(12, loja, [{ kind: "PERIPHERAL", brand: "Redragon", model: "Kumara K552 teclado", qty: 3, price: 120, ask: 189, loc: deposito.id }]);

  // Estoque antigo sem custo conhecido (migração)
  await createItem(ctx, { product: { categoryId: cat("GPU"), brand: "Asus", model: "GTX 1050 Ti 4GB" }, origin: "MIGRATION", costMode: "UNKNOWN", condition: "FAIR", locationId: caixa3.id, expectedPriceCents: R(520), acquiredAt: daysAgo(200), notes: "Estava parada antes de usar o sistema" });
  await createItem(ctx, { product: { categoryId: cat("NOTEBOOK"), brand: "Dell", model: "Inspiron 15 i5 8ª" }, origin: "MIGRATION", costMode: "ESTIMATED", unitCostCents: R(1300), condition: "GOOD", locationId: deposito.id, expectedPriceCents: R(1890), estimatedValueCents: R(1800), estimatedValueNote: "média de anúncios OLX", acquiredAt: daysAgo(150) });
  // Consignado de terceiro e equipamento de cliente
  await createItem(ctx, { product: { categoryId: cat("CONSOLE"), brand: "Sony", model: "PlayStation 4 Slim 1TB" }, origin: "CONSIGNMENT", ownerContactId: carlos, costMode: "KNOWN", unitCostCents: R(1100), expectedPriceCents: R(1450), locationId: deposito.id, acquiredAt: daysAgo(20) });

  // Sempre consulta o banco: pega a próxima unidade ainda disponível com esse nome.
  const avail = async (t: string) => prisma.item.findFirstOrThrow({ where: { orgId: p.orgId, title: { contains: t }, status: "AVAILABLE" }, orderBy: { code: "asc" } });

  // Montagem concluída e vendida
  const b1 = await saveBuild(ctx, { name: "PC Gamer Ryzen 5 + RTX 3060", targetPriceCents: R(5200), warrantyDays: 90, description: "1080p alto em qualquer jogo atual, silencioso." });
  for (const t of ["Ryzen 5 5600", "B550M", "Fury Beast", "Fury Beast", "NV2 1TB", "CV650", "Kazan 2", "RTX 3060"]) await addBuildPart(ctx, { buildId: b1.id, itemId: (await avail(t)).id });
  await addBuildPart(ctx, { buildId: b1.id, itemId: (await avail("MX-4")).id, quantity: 1 });
  await addBuildExpense(ctx, { buildId: b1.id, kind: "TESTING", description: "Energia + teste de estresse 2h", amountCents: R(15), paymentMode: "PAID", accountId: cash, method: "CASH" });
  await prisma.build.update({ where: { id: b1.id }, data: { testNotes: "OCCT 1h sem erros. CPU máx 71 °C, GPU 69 °C.", benchmarks: "Cinebench R23 multi: 11.180 pts. Fortnite 1080p alto: 140 fps." } });
  const pc1 = await completeBuild(ctx, { buildId: b1.id, expectedPriceCents: R(5200) });
  await saveSale(ctx, { action: "CONFIRM", contactId: maria, channel: "Instagram", date: daysAgo(55), lines: [{ itemId: pc1.pcItemId, unitPriceCents: R(5100) }], feeCents: R(204), feeWithheld: true, delivered: true, warrantyDays: 90, payment: { now: [{ amountCents: R(4896), accountId: bank, method: "CREDIT" }] } });

  // Montagem em andamento
  const b2 = await saveBuild(ctx, { name: "PC Office Ryzen 5 (sem placa de vídeo)", targetPriceCents: R(2900) });
  await addBuildPart(ctx, { buildId: b2.id, itemId: (await avail("Ryzen 5 5600")).id });
  await addBuildPart(ctx, { buildId: b2.id, itemId: (await avail("B550M")).id });
  await setBuildStage(ctx, { buildId: b2.id, status: "ASSEMBLING" });

  // Vendas avulsas
  const rams = await prisma.item.findMany({ where: { orgId: p.orgId, title: { contains: "Fury Beast" }, status: "AVAILABLE" }, orderBy: { code: "asc" }, take: 2 });
  await saveSale(ctx, { action: "CONFIRM", contactId: pedro, channel: "OLX", date: daysAgo(70), lines: rams.map((r) => ({ itemId: r.id, unitPriceCents: R(135) })), delivered: true, payment: { now: [{ amountCents: R(270), accountId: cash, method: "CASH" }] } });
  const parc = await saveSale(ctx, { action: "CONFIRM", contactId: ana, channel: "WhatsApp", date: daysAgo(40), lines: [{ itemId: (await avail("RX 6600")).id, unitPriceCents: R(1450) }], delivered: true, payment: { now: [{ amountCents: R(450), accountId: bank, method: "PIX" }], remainder: { installments: 2, firstDueDate: daysAgo(10), intervalDays: 30 } } });
  const parcTitles = await prisma.title.findMany({ where: { orgId: p.orgId, sourceId: parc.id, status: "OPEN" }, orderBy: { dueDate: "asc" } });
  await registerSettlement(ctx, { titleId: parcTitles[0].id, amountCents: R(300), accountId: bank, method: "PIX", date: daysAgo(9) });
  const ret = await saveSale(ctx, { action: "CONFIRM", contactId: bruno, channel: "OLX", date: daysAgo(25), lines: [{ itemId: (await avail("NV2 1TB")).id, unitPriceCents: R(349) }], delivered: true, payment: { now: [{ amountCents: R(349), accountId: bank, method: "PIX" }] } });
  const retLine = await prisma.saleLine.findFirstOrThrow({ where: { saleId: ret.id } });
  await returnSale(ctx, { saleId: ret.id, lines: [{ saleLineId: retLine.id, quantity: 1 }], reason: "Cliente comprou o modelo errado (queria 2TB)", refundCents: R(349), refundMode: "NOW", accountId: bank, itemStatus: "AVAILABLE", date: daysAgo(23) });
  await saveSale(ctx, { action: "CONFIRM", contactId: pedro, channel: "Balcão", date: daysAgo(8), lines: [{ itemId: (await avail("Kumara")).id, unitPriceCents: R(179) }], delivered: true, payment: { now: [{ amountCents: R(179), accountId: cash, method: "CASH" }] } });
  // Orçamento com reserva
  await saveSale(ctx, { action: "QUOTE", contactId: maria, date: daysAgo(1), reserveItems: true, quoteValidUntil: new Date(Date.now() + 2 * 86_400_000), lines: [{ itemId: (await avail("24G2")).id, unitPriceCents: R(729) }], notes: "Cliente vai buscar no sábado" });

  // Catira confirmada: GTX 1660 + i5 12400F + volta paga → PC completo
  const t1 = await saveTrade(ctx, {
    title: "1660 Super + i5 12400F por PC i5 10400F/GTX 1650",
    contactId: carlos,
    date: daysAgo(35),
    out: [
      { itemId: (await avail("1660 Super")).id, agreedValueCents: R(950), estimatedValueCents: R(980) },
      { itemId: (await avail("12400F")).id, agreedValueCents: R(780) },
    ],
    in: [{ categoryId: cat("PC"), title: "PC i5 10400F + GTX 1650 + 16GB + SSD 480", agreedValueCents: R(1930), estimatedValueCents: R(2300), expectedPriceCents: R(2390), specs: { cpu: "i5 10400F", gpu: "GTX 1650 4GB", ram: "16GB DDR4", storage: "SSD 480GB" }, conditionReport: "Testado no local por 1h. Gabinete com arranhão lateral.", locationId: deposito.id }],
    cashOutCents: R(200),
    revision: { author: "THEM", note: "Pediu R$ 300 de volta" },
  });
  await confirmTrade(ctx, { tradeId: t1.id, cashOut: { now: [{ amountCents: R(200), accountId: bank, method: "PIX" }] } });
  // Catira em negociação (bloqueia itens)
  await saveTrade(ctx, {
    title: "Notebook Dell por monitor + volta",
    contactId: bruno,
    date: daysAgo(2),
    status: "NEGOTIATING",
    out: [{ itemId: (await avail("Inspiron")).id, agreedValueCents: R(1800) }],
    in: [{ categoryId: cat("MONITOR"), title: "Monitor LG 27 IPS 75Hz", agreedValueCents: R(900), estimatedValueCents: R(950) }],
    cashInCents: R(800),
  });

  // Despesas do mês
  for (const [d, desc, v, catName] of [
    [28, "Internet fibra", 119.9, "Internet e telefone"],
    [27, "Embalagens e plástico bolha", 64.5, "Embalagens"],
    [15, "Impulsionamento Instagram", 50, "Anúncios e marketing"],
    [5, "Combustível — entregas", 120, "Transporte e combustível"],
  ] as const) {
    const fc = await prisma.financeCategory.findFirstOrThrow({ where: { orgId: p.orgId, name: catName } });
    await createExpenseOrIncome(ctx, { kind: "EXPENSE", categoryId: fc.id, description: desc, amountCents: R(v), date: daysAgo(d), paid: true, accountId: bank, method: "PIX" });
  }

  // Negociações
  await saveOpportunity(ctx, { title: "Quer PC para trabalho até R$ 3.000", type: "SELL", stage: "NEGOTIATING", contactId: ana, valueCents: R(2900), source: "Instagram", nextAction: "Mandar foto do PC Office pronto", nextActionAt: new Date() });
  await saveOpportunity(ctx, { title: "Vende RTX 2060 — avaliar", type: "BUY", stage: "NEW", contactId: joao, valueCents: R(900), source: "OLX", nextAction: "Pedir vídeo rodando benchmark", nextActionAt: new Date(Date.now() + 86_400_000) });
  await saveOpportunity(ctx, { title: "Monitor 24G2 — orçamento enviado", type: "SELL", stage: "PROPOSAL", contactId: maria, valueCents: R(729) });

  // Inventário em andamento na gaveta
  await startCount(ctx, { name: "Contagem da gaveta de memórias", locationId: gaveta.id });

  void p1;
  void p3;
  void p4;
  void p5;
  void p6;
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log("\nEmpresa de demonstração criada (dados fictícios, isolada da operação real).");
  if (p.setupToken) console.log(`Link para o dono demo definir a senha (72h):\n${base}/definir-senha/${p.setupToken}`);
  if (member) console.log(`${member} também tem acesso como proprietário (troque de empresa pelo menu).`);
}

main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
