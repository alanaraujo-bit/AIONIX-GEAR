/**
 * Dinheiro é sempre inteiro em centavos (BRL). Nada de float em cálculo de negócio.
 */

export const MAX_CENTS = 1_000_000_000; // R$ 10.000.000,00 por valor individual

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatBRL(cents: number | null | undefined, opts?: { signed?: boolean; compact?: boolean }): string {
  if (cents === null || cents === undefined) return "—";
  const value = (cents === 0 ? 0 : cents) / 100; // evita "-R$ 0,00"
  const text = opts?.compact && Math.abs(value) >= 10_000 ? brlCompact.format(value) : brl.format(value);
  if (opts?.signed && cents > 0) return `+${text}`;
  return text;
}

/** "1.234,56" → 123456 */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return plain.format(cents / 100);
}

/**
 * Converte texto digitado (pt-BR ou en) em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234", "1234".
 * Retorna null para vazio; lança para texto inválido.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Valor inválido");
    return Math.round(input * 100);
  }
  let s = input.trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (s === "") return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) throw new Error(`Valor inválido: "${input}"`);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > -1 && lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma > -1) {
    normalized = s.replace(/,/g, "");
  } else if (lastDot > -1) {
    // "1.234" (milhar pt-BR) vs "12.50" (decimal): 3 dígitos após o último ponto = milhar
    const decimals = s.length - lastDot - 1;
    const dots = (s.match(/\./g) ?? []).length;
    normalized = decimals === 3 || dots > 1 ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Valor inválido: "${input}"`);
  const cents = Math.round(value * 100);
  if (cents > MAX_CENTS) throw new Error("Valor acima do limite permitido (R$ 10 milhões)");
  return negative ? -cents : cents;
}

/**
 * Rateia `total` centavos proporcionalmente aos pesos, garantindo que a soma das
 * partes seja exatamente `total` (método do maior resto). Pesos todos zero → partes iguais.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (!Number.isInteger(total)) throw new Error("allocate: total deve ser inteiro");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const w = weights.map((x) => Math.max(0, x));
  let sumW = w.reduce((a, b) => a + b, 0);
  const effective = sumW === 0 ? w.map(() => 1) : w;
  if (sumW === 0) sumW = effective.length;
  const raw = effective.map((x) => (abs * x) / sumW);
  const parts = raw.map((x) => Math.floor(x));
  let remainder = abs - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    parts[order[k].i] += 1;
  }
  return parts.map((p) => p * sign);
}

/** Divide `total` em `n` partes inteiras que somam exatamente `total`. */
export function splitEven(total: number, n: number): number[] {
  return allocate(total, Array.from({ length: n }, () => 1));
}

export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
