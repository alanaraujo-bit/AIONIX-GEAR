/**
 * Datas no fuso da empresa. O servidor roda em UTC; a operação acontece em
 * America/Belem (padrão) ou no fuso configurado. Datas de formulário (AAAA-MM-DD)
 * são gravadas ao meio-dia local para nunca "pular" de dia em relatórios.
 */

export const DEFAULT_TZ = "America/Belem";

function partsIn(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

/** Diferença (minutos) entre o horário local do fuso e UTC naquele instante. */
export function tzOffsetMinutes(date: Date, tz: string) {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Converte um horário "de parede" no fuso para o instante UTC. */
export function zonedToUtc(y: number, m: number, d: number, h = 0, min = 0, tz = DEFAULT_TZ) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * 60_000);
  // Ajuste fino em transições de horário de verão
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60_000);
}

/** "2026-10-12" → instante do meio-dia local desse dia. */
export function parseDateInput(value: string | null | undefined, tz = DEFAULT_TZ): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, tz);
}

/** Instante → "AAAA-MM-DD" no fuso (para preencher <input type="date">). */
export function toDateInput(date: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!date) return "";
  const p = partsIn(new Date(date), tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function todayInput(tz = DEFAULT_TZ) {
  return toDateInput(new Date(), tz);
}

export function dayRange(value: string, tz = DEFAULT_TZ) {
  const [y, m, d] = value.split("-").map(Number);
  const from = zonedToUtc(y, m, d, 0, 0, tz);
  const to = new Date(zonedToUtc(y, m, d + 1, 0, 0, tz).getTime() - 1);
  return { from, to };
}

/** Mês atual (offset 0), anterior (-1)… no fuso da empresa. */
export function monthRange(tz = DEFAULT_TZ, offset = 0, ref = new Date()) {
  const p = partsIn(ref, tz);
  const first = new Date(Date.UTC(p.y, p.m - 1 + offset, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth() + 1;
  const from = zonedToUtc(y, m, 1, 0, 0, tz);
  const to = new Date(zonedToUtc(y, m + 1, 1, 0, 0, tz).getTime() - 1);
  return { from, to };
}

export function rangeFromInputs(fromInput: string, toInput: string, tz = DEFAULT_TZ) {
  return { from: dayRange(fromInput, tz).from, to: dayRange(toInput, tz).to };
}

export type PeriodKey = "today" | "7d" | "30d" | "month" | "lastMonth" | "quarter" | "year" | "all" | "custom";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  lastMonth: "Mês passado",
  quarter: "Últimos 3 meses",
  year: "Este ano",
  all: "Todo o período",
  custom: "Personalizado",
};

/** Período e o período anterior equivalente (para comparação). */
export function resolvePeriod(key: PeriodKey, tz = DEFAULT_TZ, custom?: { from?: string; to?: string }) {
  const now = new Date();
  const today = toDateInput(now, tz);
  const daysAgo = (n: number) => toDateInput(new Date(now.getTime() - n * 86_400_000), tz);
  let range: { from: Date; to: Date };
  switch (key) {
    case "today":
      range = dayRange(today, tz);
      break;
    case "7d":
      range = rangeFromInputs(daysAgo(6), today, tz);
      break;
    case "30d":
      range = rangeFromInputs(daysAgo(29), today, tz);
      break;
    case "month":
      range = monthRange(tz, 0);
      break;
    case "lastMonth":
      range = monthRange(tz, -1);
      break;
    case "quarter":
      range = { from: monthRange(tz, -2).from, to: monthRange(tz, 0).to };
      break;
    case "year": {
      const y = Number(today.slice(0, 4));
      range = { from: zonedToUtc(y, 1, 1, 0, 0, tz), to: new Date(zonedToUtc(y + 1, 1, 1, 0, 0, tz).getTime() - 1) };
      break;
    }
    case "custom":
      range = rangeFromInputs(custom?.from || daysAgo(29), custom?.to || today, tz);
      break;
    default:
      range = { from: new Date("2000-01-01T00:00:00Z"), to: new Date("2100-01-01T00:00:00Z") };
  }
  const span = range.to.getTime() - range.from.getTime();
  const previous =
    key === "month"
      ? monthRange(tz, -1)
      : key === "lastMonth"
        ? monthRange(tz, -2)
        : key === "all"
          ? null
          : { from: new Date(range.from.getTime() - span - 1), to: new Date(range.from.getTime() - 1) };
  return { ...range, previous };
}

const dateFmt = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions, key: string) {
  const k = `${tz}|${key}`;
  if (!dateFmt.has(k)) dateFmt.set(k, new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...opts }));
  return dateFmt.get(k)!;
}

export function formatDate(date: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!date) return "—";
  return fmt(tz, { day: "2-digit", month: "2-digit", year: "numeric" }, "d").format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!date) return "—";
  return fmt(tz, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }, "dt").format(new Date(date));
}

export function formatShortDate(date: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!date) return "—";
  return fmt(tz, { day: "2-digit", month: "short" }, "sd").format(new Date(date)).replace(".", "");
}

export function formatRelative(date: Date | string | null | undefined, now = new Date()) {
  if (!date) return "—";
  const diff = new Date(date).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 60_000) return "agora";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  if (abs < 365 * 86_400_000) return rtf.format(Math.round(diff / (30 * 86_400_000)), "month");
  return rtf.format(Math.round(diff / (365 * 86_400_000)), "year");
}

export function daysBetween(a: Date | string, b: Date | string = new Date()) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

/** Instante de N dias atrás (para filtros de consulta). */
export function daysAgoDate(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

export function isWithinDays(date: Date | string | null | undefined, n: number) {
  return !!date && Date.now() - new Date(date).getTime() < n * 86_400_000;
}
