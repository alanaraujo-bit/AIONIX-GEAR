"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/field";
import { PERIOD_LABEL, type PeriodKey } from "@/lib/dates";

export function PeriodSelect({ value, param = "periodo", options }: { value: PeriodKey; param?: string; options?: PeriodKey[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const keys = options ?? (["today", "7d", "30d", "month", "lastMonth", "quarter", "year", "all"] as PeriodKey[]);
  return (
    <Select
      aria-label="Período"
      value={value}
      wrapperClassName="w-44"
      onChange={(e) => {
        const n = new URLSearchParams(sp.toString());
        n.set(param, e.target.value);
        router.replace(`${pathname}?${n.toString()}`, { scroll: false });
      }}
    >
      {keys.map((k) => (
        <option key={k} value={k}>
          {PERIOD_LABEL[k]}
        </option>
      ))}
    </Select>
  );
}
