"use client";

import * as React from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { SPEC_FIELDS } from "@/server/domain/compat";

export type CategoryOpt = { id: string; name: string; kind: string };
export type ProductOpt = { id: string; name: string; brand: string | null; model: string | null; categoryId: string; tracking: string; specs: Record<string, unknown> };

export type ProductValue = {
  categoryId: string;
  productId: string | null;
  brand: string;
  model: string;
  specs: Record<string, string>;
};

export const emptyProduct = (categoryId = ""): ProductValue => ({ categoryId, productId: null, brand: "", model: "", specs: {} });

/** Categoria + modelo do catálogo (reaproveita) ou novo modelo (marca/modelo) + especificações técnicas. */
export function ProductFields({
  value,
  onChange,
  categories,
  products,
  errors,
}: {
  value: ProductValue;
  onChange: (v: ProductValue) => void;
  categories: CategoryOpt[];
  products: ProductOpt[];
  errors?: Record<string, string>;
}) {
  const cat = categories.find((c) => c.id === value.categoryId);
  const options = products.filter((p) => p.categoryId === value.categoryId);
  const specFields = cat ? SPEC_FIELDS[cat.kind] ?? [] : [];
  const listId = React.useId();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Categoria" required error={errors?.categoryId}>
        <Select value={value.categoryId} onChange={(e) => onChange({ ...emptyProduct(e.target.value) })} aria-invalid={!!errors?.categoryId}>
          <option value="">Escolha…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Modelo já cadastrado" hint={options.length ? "Reaproveite para agrupar unidades do mesmo modelo." : "Nenhum modelo nesta categoria ainda."}>
        <Select
          value={value.productId ?? ""}
          disabled={!value.categoryId || options.length === 0}
          onChange={(e) => {
            const p = options.find((o) => o.id === e.target.value);
            onChange(
              p
                ? {
                    ...value,
                    productId: p.id,
                    brand: p.brand ?? "",
                    model: p.model ?? p.name,
                    specs: Object.fromEntries(Object.entries(p.specs ?? {}).map(([k, v]) => [k, String(v ?? "")])),
                  }
                : { ...value, productId: null },
            );
          }}
        >
          <option value="">Novo modelo</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {!value.productId && (
        <>
          <Field label="Marca" error={errors?.brand}>
            <Input value={value.brand} onChange={(e) => onChange({ ...value, brand: e.target.value })} placeholder="Ex.: MSI, Kingston, AMD" list={`${listId}-brands`} />
            <datalist id={`${listId}-brands`}>
              {[...new Set(products.map((p) => p.brand).filter(Boolean))].map((b) => (
                <option key={b!} value={b!} />
              ))}
            </datalist>
          </Field>
          <Field label="Modelo" required error={errors?.model}>
            <Input value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} placeholder="Ex.: RTX 3060 Ventus 2X 12GB" aria-invalid={!!errors?.model} />
          </Field>
        </>
      )}
      {specFields.length > 0 && (
        <div className="sm:col-span-2">
          <p className="mb-2 text-[0.8125rem] font-medium text-ink-2">Especificações técnicas</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {specFields.map((f) => (
              <Field key={f.key} label={<span className="text-[0.75rem]">{f.label}</span>}>
                <Input
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={value.specs[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange({ ...value, specs: { ...value.specs, [f.key]: e.target.value } })}
                  className="h-9 text-sm"
                />
              </Field>
            ))}
          </div>
          <p className="mt-1.5 text-[0.75rem] text-ink-3">Usadas nos avisos de compatibilidade das montagens. Pode deixar em branco o que não souber.</p>
        </div>
      )}
    </div>
  );
}

export function productPayload(v: ProductValue) {
  const specs = Object.fromEntries(Object.entries(v.specs).filter(([, x]) => String(x).trim() !== "").map(([k, x]) => [k, Number.isFinite(Number(x)) && String(x).trim() !== "" && /^[\d.,]+$/.test(String(x)) ? Number(String(x).replace(",", ".")) : x]));
  return {
    productId: v.productId,
    categoryId: v.categoryId || null,
    brand: v.brand.trim() || null,
    model: v.model.trim() || null,
    name: [v.brand.trim(), v.model.trim()].filter(Boolean).join(" ") || null,
    specs,
  };
}
