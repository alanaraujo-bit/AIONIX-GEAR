import * as React from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  muted: "bg-transparent text-ink-3 ring-line",
  accent: "bg-accent-soft text-accent-text ring-accent/25",
  positive: "bg-positive-soft text-positive ring-positive/25",
  negative: "bg-negative-soft text-negative ring-negative/25",
  warning: "bg-warning-soft text-warning-text ring-warning/30",
  info: "bg-info-soft text-info ring-info/25",
};

export function Badge({ tone = "neutral", dot, className, children, title }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[0.75rem] font-medium ring-1 ring-inset", tones[tone], className)}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
