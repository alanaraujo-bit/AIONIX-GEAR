"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/field";

/** Busca + abas de filtro gravadas na URL (compartilháveis e com voltar do navegador). */
export function ListSearch({ placeholder, tabs, tabParam = "situacao", extra }: { placeholder: string; tabs?: { value: string; label: string }[]; tabParam?: string; extra?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const n = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) n.set(k, v);
        else n.delete(k);
      }
      n.delete("page");
      router.replace(`${pathname}?${n.toString()}`, { scroll: false });
    },
    [sp, pathname, router],
  );
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q.trim()) update({ q: q.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [q, sp, update]);
  const current = sp.get(tabParam) ?? "";
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      {tabs && (
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={current === t.value}
              onClick={() => update({ [tabParam]: t.value || null })}
              className={cn("h-8 shrink-0 rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors", current === t.value ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative sm:ml-auto sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" aria-label="Buscar" />
      </div>
      {extra}
    </div>
  );
}
