"use client";

import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-[10px] border border-line bg-surface p-1 shadow-[var(--shadow-lg)] data-[state=open]:animate-[ag-pop_160ms_var(--ease-out-expo)]",
          className,
        )}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onSelect?: (e: Event) => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-[6px] px-2.5 text-sm text-ink outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3",
        danger && "text-negative [&_svg]:text-negative",
        className,
      )}
    >
      {children}
    </M.Item>
  );
}

export function MenuLinkItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <M.Item asChild>
      <a
        href={href}
        className="flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-[6px] px-2.5 text-sm text-ink no-underline outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-ink-3"
      >
        {children}
      </a>
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-2 text-[0.75rem] font-medium text-ink-3">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}
