"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

function format(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type MoneyInputProps = {
  value: number | null;
  onChange: (cents: number | null) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
};

/**
 * Campo de dinheiro em BRL: o usuário digita só números e o valor é montado da
 * direita para a esquerda ("123456" → "1.234,56"). Emite centavos inteiros.
 */
export function MoneyInput({ value, onChange, id, name, placeholder = "0,00", disabled, invalid, className, autoFocus, ...rest }: MoneyInputProps) {
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-[var(--radius-ctl)] border border-line-strong bg-surface transition-[border-color,box-shadow] duration-150 hover:border-ink-3 focus-within:border-accent focus-within:shadow-[var(--focus)]",
        invalid && "border-negative",
        disabled && "opacity-60",
        className,
      )}
    >
      <span className="select-none pl-3 pr-1.5 text-sm text-ink-3">R$</span>
      <input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-label={rest["aria-label"]}
        placeholder={placeholder}
        className="num h-full w-full min-w-0 bg-transparent pr-3 text-right text-[0.9375rem] text-ink outline-none placeholder:text-ink-3"
        value={value === null ? "" : format(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9); // até R$ 9.999.999,99
          onChange(digits ? Number(digits) : null);
        }}
        onFocus={(e) => {
          // Seleciona o valor: digitar substitui em vez de acrescentar dígitos ao valor anterior.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
      />
    </div>
  );
}
