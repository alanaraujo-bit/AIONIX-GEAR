/**
 * Papéis e permissões. A checagem real acontece no servidor (domínio/actions);
 * o cliente usa este mapa apenas para esconder o que o usuário não pode fazer.
 */

export type Role = "OWNER" | "ADMIN" | "SALES" | "INVENTORY";

export const PERMISSIONS = [
  "inventory.view",
  "inventory.edit",
  "inventory.adjust",
  "inventory.cost",
  "purchases.manage",
  "sales.manage",
  "trades.manage",
  "builds.manage",
  "contacts.manage",
  "finance.view",
  "finance.manage",
  "reports.view",
  "settings.manage",
  "team.manage",
  "data.import",
  "data.export",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const MATRIX: Record<Role, Set<Permission>> = {
  OWNER: ALL,
  ADMIN: ALL,
  SALES: new Set<Permission>(["inventory.view", "sales.manage", "contacts.manage"]),
  INVENTORY: new Set<Permission>(["inventory.view", "inventory.edit", "inventory.adjust", "builds.manage"]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  SALES: "Vendas",
  INVENTORY: "Estoque",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Acesso total, incluindo equipe, dados e configurações da empresa.",
  ADMIN: "Acesso total à operação, financeiro e equipe.",
  SALES: "Consulta estoque (sem custos), cria orçamentos e vendas, recebe pagamentos de vendas e gerencia contatos.",
  INVENTORY: "Cadastra e movimenta itens, faz inventário e montagens. Não vê custos, vendas nem financeiro.",
};
