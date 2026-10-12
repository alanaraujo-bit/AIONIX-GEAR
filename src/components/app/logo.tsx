import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";

/** Marca: porca sextavada com um "die" de chip no centro — hardware + precisão. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3Z" fill="var(--accent)" />
      <path d="M16 6.4 24.3 11.2v9.6L16 25.6l-8.3-4.8v-9.6Z" fill="none" stroke="var(--accent-ink)" strokeOpacity=".9" strokeWidth="1.6" />
      <rect x="12.6" y="12.6" width="6.8" height="6.8" rx="1.4" fill="var(--accent-ink)" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const [first, ...rest] = BRAND_NAME.split(" ");
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="text-[0.95rem] font-semibold tracking-[0.04em] text-ink">
          {first}
          {rest.length > 0 && <span className="font-normal text-ink-3"> {rest.join(" ")}</span>}
        </span>
      )}
    </span>
  );
}
