"use client";

import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { finishOnboardingAction } from "./home-actions";
import type { OnboardingStatus } from "@/server/queries/onboarding";

export function Onboarding({ status }: { status: OnboardingStatus }) {
  const done = status.steps.filter((s) => s.done).length;
  const { run, pending } = useAction(finishOnboardingAction);
  return (
    <section className="surface mb-5 overflow-hidden" aria-labelledby="onb-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 id="onb-title" className="text-[0.9375rem] font-semibold">
            Primeiros passos
          </h2>
          <p className="text-[0.8125rem] text-ink-3">
            {done} de {status.steps.length} concluídos. Leva poucos minutos e deixa os números confiáveis desde o primeiro dia.
          </p>
        </div>
        {status.canDismiss && (
          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(undefined)}>
            Ocultar
          </Button>
        )}
      </div>
      <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {status.steps.map((s, i) => (
          <li key={s.key} className="sm:border-line sm:[&:not(:first-child)]:border-l">
            <Link href={s.href} className="group flex h-full gap-3 px-4 py-3.5 no-underline hover:bg-surface-2/60 sm:px-5">
              <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[0.75rem] font-semibold", s.done ? "border-positive bg-positive text-white" : "border-line-strong text-ink-3")}>
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", s.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink")}>{s.label}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{s.detail}</span>
                {!s.done && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-accent-text">
                    Começar <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
