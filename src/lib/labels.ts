import type { Tone } from "@/components/ui/badge";

export type ItemStatusKey =
  | "AVAILABLE"
  | "RESERVED"
  | "INSPECTION"
  | "DEFECTIVE"
  | "IN_BUILD"
  | "IN_NEGOTIATION"
  | "CONSIGNED_OUT"
  | "INSTALLED"
  | "SOLD"
  | "DELIVERED"
  | "RETURNED"
  | "EXCHANGED"
  | "DISASSEMBLED"
  | "DISPOSED"
  | "VOID";

export const STATUS_LABEL: Record<ItemStatusKey, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  INSPECTION: "Aguardando inspeção",
  DEFECTIVE: "Com defeito",
  IN_BUILD: "Em montagem",
  IN_NEGOTIATION: "Em negociação",
  CONSIGNED_OUT: "Consignado",
  INSTALLED: "Instalado em PC",
  SOLD: "Vendido",
  DELIVERED: "Entregue",
  RETURNED: "Devolvido",
  EXCHANGED: "Trocado (catira)",
  DISASSEMBLED: "Desmontado",
  DISPOSED: "Baixado",
  VOID: "Anulado",
};

export const STATUS_TONE: Record<ItemStatusKey, Tone> = {
  AVAILABLE: "positive",
  RESERVED: "info",
  INSPECTION: "warning",
  DEFECTIVE: "negative",
  IN_BUILD: "accent",
  IN_NEGOTIATION: "info",
  CONSIGNED_OUT: "info",
  INSTALLED: "neutral",
  SOLD: "accent",
  DELIVERED: "muted",
  RETURNED: "warning",
  EXCHANGED: "muted",
  DISASSEMBLED: "muted",
  DISPOSED: "muted",
  VOID: "muted",
};

export const CONDITION_LABEL: Record<string, string> = {
  NEW: "Novo",
  LIKE_NEW: "Seminovo",
  GOOD: "Usado — bom estado",
  FAIR: "Usado — com marcas",
  FOR_PARTS: "Para peças",
};

export const OWNERSHIP_LABEL: Record<string, string> = {
  OWNED: "Próprio",
  CONSIGNED_IN: "Consignado de terceiro",
  CLIENT: "Equipamento de cliente",
  THIRD_PARTY: "Terceiro sob guarda",
};

export const COST_STATUS_LABEL: Record<string, string> = {
  KNOWN: "Custo conhecido",
  ESTIMATED: "Custo estimado",
  UNKNOWN: "Custo desconhecido",
};

export const ACQUISITION_LABEL: Record<string, string> = {
  PURCHASE: "Compra",
  TRADE: "Catira",
  TRADE_IN: "Troca na venda",
  BUILD: "Montagem",
  DISASSEMBLY: "Desmontagem",
  MIGRATION: "Estoque inicial",
  IMPORT: "Importação",
  CONSIGNMENT: "Consignação",
  CLIENT: "Cliente",
  OTHER: "Outro",
};

export const CATEGORY_KIND_LABEL: Record<string, string> = {
  CPU: "Processador",
  GPU: "Placa de vídeo",
  MOTHERBOARD: "Placa-mãe",
  RAM: "Memória",
  STORAGE: "Armazenamento",
  PSU: "Fonte",
  CASE: "Gabinete",
  COOLER: "Refrigeração",
  MONITOR: "Monitor",
  PERIPHERAL: "Periférico",
  NETWORK: "Rede",
  NOTEBOOK: "Notebook",
  PC: "Computador",
  CONSOLE: "Console",
  CONSUMABLE: "Insumo",
  OTHER: "Outro",
};

export const LOCATION_KIND_LABEL: Record<string, string> = {
  ROOM: "Cômodo",
  SHELF: "Prateleira",
  DRAWER: "Gaveta",
  BOX: "Caixa",
  STORAGE: "Depósito",
  WAREHOUSE: "Galpão",
  EXTERNAL: "Fora (com terceiro)",
  OTHER: "Outro",
};

export const COMPLETENESS_FIELDS: { key: string; label: string }[] = [
  { key: "box", label: "Caixa original" },
  { key: "manual", label: "Manual" },
  { key: "cables", label: "Cabos" },
  { key: "invoice", label: "Nota fiscal" },
  { key: "accessories", label: "Acessórios completos" },
];

export const SALE_STATUS_LABEL: Record<string, string> = { QUOTE: "Orçamento", CONFIRMED: "Venda fechada", CANCELLED: "Cancelada" };
export const TRADE_STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho", NEGOTIATING: "Em negociação", CONFIRMED: "Confirmada", CANCELLED: "Cancelada" };
export const TRADE_STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", NEGOTIATING: "info", CONFIRMED: "positive", CANCELLED: "muted" };
export const BUILD_STATUS_LABEL: Record<string, string> = { PLANNING: "Planejamento", ASSEMBLING: "Em montagem", TESTING: "Em testes", COMPLETED: "Concluída", CANCELLED: "Cancelada" };
export const BUILD_STATUS_TONE: Record<string, Tone> = { PLANNING: "neutral", ASSEMBLING: "accent", TESTING: "info", COMPLETED: "positive", CANCELLED: "muted" };
export const TITLE_STATUS_LABEL: Record<string, string> = { OPEN: "Em aberto", PARTIAL: "Parcial", PAID: "Quitado", CANCELLED: "Cancelado" };

export const METHOD_LABEL: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  TRANSFER: "Transferência",
  BOLETO: "Boleto",
  OTHER: "Outro",
};

export const COST_KIND_LABEL: Record<string, string> = {
  ACQUISITION: "Aquisição",
  FREIGHT: "Frete",
  FEE: "Taxa",
  COMMISSION: "Comissão",
  REPAIR: "Reparo",
  TESTING: "Teste",
  PARTS: "Peças",
  TRADE_ALLOCATION: "Custo vindo de catira",
  BUILD_ROLLUP: "Componentes da montagem",
  DISASSEMBLY_ALLOCATION: "Rateio de desmontagem",
  CONSIGNMENT_PAYOUT: "Repasse de consignação",
  ADJUSTMENT: "Correção de custo",
  LABOR: "Mão de obra",
  CONSUMABLE: "Insumos",
  OTHER: "Outros",
};

export const TX_KIND_LABEL: Record<string, string> = {
  SALE_RECEIPT: "Recebimento de venda",
  PURCHASE_PAYMENT: "Pagamento de compra",
  TRADE_CASH_IN: "Volta recebida (catira)",
  TRADE_CASH_OUT: "Volta paga (catira)",
  EXPENSE_PAYMENT: "Pagamento de despesa",
  INCOME_RECEIPT: "Recebimento",
  CAPITAL_IN: "Aporte",
  WITHDRAWAL: "Retirada",
  TRANSFER: "Transferência",
  OPENING: "Saldo inicial",
  ADJUSTMENT: "Ajuste de conciliação",
  REFUND_OUT: "Devolução a cliente",
  REFUND_IN: "Reembolso recebido",
  BUILD_EXPENSE: "Custo de montagem",
  ITEM_COST: "Custo de item",
  CONSIGNMENT_PAYOUT: "Repasse de consignação",
};
