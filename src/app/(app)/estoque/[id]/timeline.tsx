import Link from "next/link";
import {
  PackagePlus,
  ArrowRightLeft,
  MapPin,
  Receipt,
  Truck,
  Undo2,
  Wrench,
  Cpu,
  Coins,
  Trash2,
  Camera,
  StickyNote,
  Tag,
  RefreshCw,
  CircleDot,
  Scissors,
  Ban,
  Lock,
  Unlock,
} from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: PackagePlus,
  MOVED: MapPin,
  SOLD: Receipt,
  DELIVERED: Truck,
  RETURNED: Undo2,
  SALE_CANCELLED: Undo2,
  ADDED_TO_BUILD: Wrench,
  REMOVED_FROM_BUILD: Wrench,
  INSTALLED: Cpu,
  CONSUMED: Cpu,
  COST_ADDED: Coins,
  DISPOSED: Trash2,
  PHOTO_ADDED: Camera,
  PHOTO_REMOVED: Camera,
  NOTE: StickyNote,
  PRICE_CHANGED: Tag,
  STATUS_CHANGED: RefreshCw,
  TRADED_OUT: ArrowRightLeft,
  TRADE_UNDONE: Undo2,
  DISASSEMBLED: Scissors,
  EXTRACTED: Scissors,
  VOIDED: Ban,
  RESERVED: Lock,
  RELEASED: Unlock,
  ADJUSTED: RefreshCw,
  UPDATED: RefreshCw,
};

const REF_HREF: Record<string, string> = {
  PURCHASE: "/compras/",
  SALE: "/vendas/",
  TRADE: "/catiras/",
  BUILD: "/montagens/",
  STOCK_COUNT: "/estoque/inventarios/",
};

export type TimelineEvent = {
  id: string;
  type: string;
  message: string;
  reason: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  qtyDelta: number | null;
  refType: string | null;
  refId: string | null;
  user: string | null;
  createdAt: Date;
};

export function Timeline({ events, tz }: { events: TimelineEvent[]; tz: string }) {
  if (!events.length) return <p className="text-sm text-ink-3">Sem eventos.</p>;
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const Icon = ICON[e.type] ?? CircleDot;
        const href = e.refType && e.refId && REF_HREF[e.refType] ? `${REF_HREF[e.refType]}${e.refId}` : null;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < events.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line" aria-hidden />}
            <span className={cn("relative grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-3", i === 0 && "border-accent/40 text-accent-text")}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm text-ink">
                {e.message}
                {href && (
                  <>
                    {" "}
                    <Link href={href} className="text-[0.8125rem]">
                      abrir
                    </Link>
                  </>
                )}
              </p>
              {e.type === "MOVED" && (e.fromLocation || e.toLocation) && (
                <p className="text-[0.8125rem] text-ink-3">
                  {e.fromLocation ?? "sem local"} → {e.toLocation ?? "sem local"}
                </p>
              )}
              {e.reason && <p className="text-[0.8125rem] text-ink-2">Motivo: {e.reason}</p>}
              <p className="mt-0.5 text-[0.75rem] text-ink-3">
                {formatDateTime(e.createdAt, tz)}
                {e.user ? ` · ${e.user}` : ""}
                {e.qtyDelta && Math.abs(e.qtyDelta) > 1 ? ` · ${e.qtyDelta > 0 ? "+" : ""}${e.qtyDelta} un.` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { formatBRL };
