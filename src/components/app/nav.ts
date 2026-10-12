import type { Permission } from "@/lib/permissions";

export type NavKey =
  | "home"
  | "stock"
  | "purchases"
  | "sales"
  | "trades"
  | "builds"
  | "deals"
  | "contacts"
  | "finance"
  | "reports"
  | "insights"
  | "settings";

export type NavItem = { key: NavKey; href: string; label: string; anyOf?: Permission[]; group: "main" | "money" | "system" };

export const NAV: NavItem[] = [
  { key: "home", href: "/", label: "Início", group: "main" },
  { key: "stock", href: "/estoque", label: "Estoque", anyOf: ["inventory.view"], group: "main" },
  { key: "purchases", href: "/compras", label: "Compras", anyOf: ["purchases.manage"], group: "main" },
  { key: "sales", href: "/vendas", label: "Vendas", anyOf: ["sales.manage"], group: "main" },
  { key: "trades", href: "/catiras", label: "Catiras", anyOf: ["trades.manage"], group: "main" },
  { key: "builds", href: "/montagens", label: "Montagens", anyOf: ["builds.manage"], group: "main" },
  { key: "deals", href: "/negociacoes", label: "Negociações", anyOf: ["sales.manage", "trades.manage", "purchases.manage"], group: "main" },
  { key: "contacts", href: "/contatos", label: "Contatos", anyOf: ["contacts.manage", "purchases.manage", "trades.manage"], group: "main" },
  { key: "finance", href: "/financeiro", label: "Financeiro", anyOf: ["finance.view"], group: "money" },
  { key: "reports", href: "/relatorios", label: "Relatórios", anyOf: ["reports.view"], group: "money" },
  { key: "insights", href: "/inteligencia", label: "Inteligência", anyOf: ["reports.view"], group: "money" },
  { key: "settings", href: "/configuracoes", label: "Configurações", group: "system" },
];

export type QuickAction = { href: string; label: string; anyOf: Permission[]; key: string };

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "item", href: "/estoque/novo", label: "Cadastrar item", anyOf: ["inventory.edit"] },
  { key: "purchase", href: "/compras/nova", label: "Registrar compra", anyOf: ["purchases.manage"] },
  { key: "sale", href: "/vendas/nova", label: "Nova venda ou orçamento", anyOf: ["sales.manage"] },
  { key: "trade", href: "/catiras/nova", label: "Nova catira", anyOf: ["trades.manage"] },
  { key: "build", href: "/montagens/nova", label: "Iniciar montagem", anyOf: ["builds.manage"] },
  { key: "payment", href: "/financeiro/receber", label: "Registrar recebimento", anyOf: ["finance.manage", "sales.manage"] },
  { key: "expense", href: "/financeiro/lancar", label: "Lançar despesa", anyOf: ["finance.manage"] },
  { key: "move", href: "/escanear", label: "Escanear / mover item", anyOf: ["inventory.view"] },
];
