import type { Tx } from "../db";
import type { CategoryKind } from "@/generated/prisma/client";

export type OrgSettings = {
  /** Margem-alvo usada em preço sugerido (%) */
  targetMarginPct: number;
  /** Dias sem venda para um item ser considerado parado */
  staleDays: number;
  /** Validade padrão de reservas/orçamentos (dias) */
  reservationDays: number;
  /** Garantia padrão oferecida em vendas (dias) */
  defaultWarrantyDays: number;
  /** Valor da hora de mão de obra própria, usado só em preço sugerido de montagens */
  ownLaborHourCents: number;
  /** Rodapé de documentos (orçamentos/recibos) */
  documentFooter: string;
};

export const DEFAULT_SETTINGS: OrgSettings = {
  targetMarginPct: 25,
  staleDays: 60,
  reservationDays: 3,
  defaultWarrantyDays: 90,
  ownLaborHourCents: 0,
  documentFooter: "",
};

export function readSettings(raw: unknown): OrgSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<OrgSettings>;
  return { ...DEFAULT_SETTINGS, ...s };
}

export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  { name: "Placas de vídeo", kind: "GPU" },
  { name: "Processadores", kind: "CPU" },
  { name: "Placas-mãe", kind: "MOTHERBOARD" },
  { name: "Memória RAM", kind: "RAM" },
  { name: "Armazenamento", kind: "STORAGE" },
  { name: "Fontes", kind: "PSU" },
  { name: "Gabinetes", kind: "CASE" },
  { name: "Coolers e refrigeração", kind: "COOLER" },
  { name: "Monitores", kind: "MONITOR" },
  { name: "Periféricos", kind: "PERIPHERAL" },
  { name: "Rede", kind: "NETWORK" },
  { name: "Notebooks", kind: "NOTEBOOK" },
  { name: "Computadores", kind: "PC" },
  { name: "Consoles", kind: "CONSOLE" },
  { name: "Insumos e consumíveis", kind: "CONSUMABLE" },
  { name: "Diversos", kind: "OTHER" },
];

export const DEFAULT_FINANCE_CATEGORIES: { name: string; type: "INCOME" | "EXPENSE"; group: string; systemKey?: string }[] = [
  { name: "Venda de mercadorias", type: "INCOME", group: "SYSTEM", systemKey: "SALE" },
  { name: "Compra de mercadorias", type: "EXPENSE", group: "SYSTEM", systemKey: "PURCHASE" },
  { name: "Diferença de catira", type: "EXPENSE", group: "SYSTEM", systemKey: "TRADE" },
  { name: "Custos de montagem", type: "EXPENSE", group: "SYSTEM", systemKey: "BUILD" },
  { name: "Custos adicionais de itens", type: "EXPENSE", group: "SYSTEM", systemKey: "ITEM_COST" },
  { name: "Taxas de cartão e plataforma", type: "EXPENSE", group: "SALES_EXPENSE", systemKey: "SALE_FEE" },
  { name: "Frete de vendas", type: "EXPENSE", group: "SALES_EXPENSE", systemKey: "SALE_SHIPPING" },
  { name: "Repasse de consignação", type: "EXPENSE", group: "SYSTEM", systemKey: "CONSIGNMENT" },
  { name: "Aluguel e espaço", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Internet e telefone", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Embalagens", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Transporte e combustível", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Ferramentas e equipamentos", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Anúncios e marketing", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Impostos e taxas", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Outras despesas", type: "EXPENSE", group: "OPERATING_EXPENSE" },
  { name: "Outras receitas", type: "INCOME", group: "OTHER_INCOME" },
  { name: "Serviços prestados", type: "INCOME", group: "OTHER_INCOME" },
  { name: "Aporte de capital", type: "INCOME", group: "CAPITAL", systemKey: "CAPITAL_IN" },
  { name: "Retirada do dono", type: "EXPENSE", group: "CAPITAL", systemKey: "WITHDRAWAL" },
  { name: "Ajustes e perdas", type: "EXPENSE", group: "OTHER_EXPENSE", systemKey: "ADJUSTMENT" },
];

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Cria uma empresa já pronta para operar (categorias, contas, plano de contas, local inicial). */
export async function createOrganization(
  tx: Tx,
  input: { name: string; isDemo?: boolean; timezone?: string; city?: string; state?: string; plan?: string },
) {
  const base = slugify(input.name) || "empresa";
  let slug = base;
  for (let i = 2; await tx.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const org = await tx.organization.create({
    data: {
      name: input.name.trim(),
      slug,
      isDemo: input.isDemo ?? false,
      timezone: input.timezone ?? "America/Belem",
      city: input.city,
      state: input.state,
      plan: input.plan ?? "founder",
      settings: DEFAULT_SETTINGS,
    },
  });
  await tx.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, orgId: org.id })) });
  await tx.financeCategory.createMany({ data: DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c, orgId: org.id })) });
  await tx.moneyAccount.createMany({
    data: [
      { orgId: org.id, name: "Dinheiro em espécie", kind: "CASH" },
      { orgId: org.id, name: "Conta principal (PIX)", kind: "BANK" },
    ],
  });
  await tx.location.create({ data: { orgId: org.id, name: "Estoque principal", kind: "STORAGE" } });
  return org;
}

export async function systemCategoryId(tx: Tx, orgId: string, systemKey: string): Promise<string | null> {
  const c = await tx.financeCategory.findFirst({ where: { orgId, systemKey }, select: { id: true } });
  return c?.id ?? null;
}
