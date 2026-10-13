"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/field";

export function TxFilters({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    n.delete("page");
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5 sm:px-5">
      <Select aria-label="Conta" value={sp.get("conta") ?? ""} onChange={(e) => set("conta", e.target.value)} wrapperClassName="w-52" className="h-9 text-sm">
        <option value="">Todas as contas</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Tipo" value={sp.get("tipo") ?? ""} onChange={(e) => set("tipo", e.target.value)} wrapperClassName="w-52" className="h-9 text-sm">
        <option value="">Entradas e saídas</option>
        <option value="in">Só entradas</option>
        <option value="out">Só saídas</option>
        <option value="SALE_RECEIPT">Recebimentos de vendas</option>
        <option value="PURCHASE_PAYMENT">Pagamentos de compras</option>
        <option value="EXPENSE_PAYMENT">Despesas pagas</option>
        <option value="TRADE_CASH_IN">Voltas recebidas</option>
        <option value="TRADE_CASH_OUT">Voltas pagas</option>
        <option value="CAPITAL_IN">Aportes</option>
        <option value="WITHDRAWAL">Retiradas</option>
        <option value="TRANSFER">Transferências</option>
        <option value="ADJUSTMENT">Ajustes de conciliação</option>
      </Select>
    </div>
  );
}
