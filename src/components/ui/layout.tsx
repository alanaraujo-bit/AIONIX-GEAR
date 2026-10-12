import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/money";

export function PageHeader({
  title,
  description,
  back,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-3 no-underline hover:text-ink">
            <ChevronLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[1.625rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-[0.9375rem] text-ink-2">{description}</p>}
        {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("surface overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[0.8125rem] text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  compact,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {Icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-[12px] border border-line bg-surface-2 text-ink-3">
          <Icon className="size-5" />
        </div>
      )}
      <h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

/** Valor monetário com numerais tabulares e tom opcional por sinal. */
export function Money({
  cents,
  signed,
  tone,
  className,
  unknown,
}: {
  cents: number | null | undefined;
  signed?: boolean;
  tone?: "auto" | "none";
  className?: string;
  unknown?: string;
}) {
  if (cents === null || cents === undefined) return <span className={cn("text-ink-3", className)}>{unknown ?? "—"}</span>;
  const color = tone === "auto" ? (cents > 0 ? "text-positive" : cents < 0 ? "text-negative" : "") : "";
  return <span className={cn("num whitespace-nowrap", color, className)}>{formatBRL(cents, { signed })}</span>;
}

/** Linha de leitura "rótulo → valor", usada em resumos e fichas. */
export function KeyValue({ label, children, className, hint }: { label: React.ReactNode; children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <dt className="text-sm text-ink-3">
        {label}
        {hint && <span className="block text-[0.75rem] text-ink-3/80">{hint}</span>}
      </dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2 text-[0.75rem] font-medium text-ink-3 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align = "left", colSpan }: { children?: React.ReactNode; className?: string; align?: "left" | "right" | "center"; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-line px-3 py-2.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className, href }: { children: React.ReactNode; className?: string; href?: string }) {
  return <tr className={cn("transition-colors duration-100 [&:last-child>td]:border-b-0", href && "hover:bg-surface-2/70", className)}>{children}</tr>;
}

export function Callout({
  tone = "info",
  title,
  children,
  icon: Icon,
  className,
  action,
}: {
  tone?: "info" | "warning" | "negative" | "positive" | "neutral";
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  action?: React.ReactNode;
}) {
  const tones = {
    info: "bg-info-soft/60 border-info/20 [&_.ico]:text-info",
    warning: "bg-warning-soft/70 border-warning/25 [&_.ico]:text-warning-text",
    negative: "bg-negative-soft/70 border-negative/20 [&_.ico]:text-negative",
    positive: "bg-positive-soft/70 border-positive/20 [&_.ico]:text-positive",
    neutral: "bg-surface-2 border-line [&_.ico]:text-ink-3",
  };
  return (
    <div className={cn("flex gap-3 rounded-[var(--radius-box)] border px-3.5 py-3 text-sm", tones[tone], className)} role={tone === "negative" ? "alert" : undefined}>
      {Icon && <Icon className="ico mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1 text-ink-2">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "leading-relaxed")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
