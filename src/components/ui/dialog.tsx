"use client";

import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-[ag-fade-in_160ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[14px] border border-line bg-surface shadow-[var(--shadow-lg)] outline-none data-[state=open]:animate-[ag-pop_200ms_var(--ease-out-expo)]",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-base font-semibold text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-ink-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</D.Description>
            )}
          </div>
          <D.Close className="-mr-1.5 -mt-1 rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fechar">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-5 -mb-4 mt-5 flex flex-col-reverse gap-2 border-t border-line bg-surface-2/60 px-5 py-3 sm:flex-row sm:justify-end", className)}>
      {children}
    </div>
  );
}

/** Gaveta lateral (desktop) / folha inferior (celular) para tarefas contextuais. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-[ag-fade-in_160ms_ease-out]" />
        <D.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-[var(--shadow-lg)] outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[16px] border-t border-line data-[state=open]:animate-[ag-pop_220ms_var(--ease-out-expo)]",
            "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0 sm:data-[state=open]:animate-[ag-slide-in-right_220ms_var(--ease-out-expo)]",
            width === "md" ? "sm:w-[440px]" : width === "lg" ? "sm:w-[560px]" : "sm:w-[720px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-sm text-ink-3">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Painel"}</D.Description>
              )}
            </div>
            <D.Close className="-mr-1.5 rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fechar">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="pb-safe flex flex-col-reverse gap-2 border-t border-line bg-surface-2/60 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
