/** CSV amigável ao Excel em português: separador ";", vírgula decimal, BOM UTF-8. */
export function toCsv(headers: string[], rows: (string | number | null | undefined | Date)[][]) {
  const esc = (v: string | number | null | undefined | Date) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

/** Centavos → "1234,56" (sem separador de milhar, para planilhas). */
export function centsCsv(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
