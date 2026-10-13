"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search,
  Plus,
  Menu as MenuIcon,
  ChevronsUpDown,
  LogOut,
  Moon,
  Sun,
  Monitor,
  WifiOff,
  ScanLine,
  Building2,
  Check,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  CornerDownLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo, LogoMark } from "./logo";
import type { NavItem, QuickAction } from "./nav";
import { NAV_ICONS, QUICK_ICONS } from "./icons";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { searchAction } from "@/app/(app)/shell-actions";
import { logoutAction, switchOrgAction } from "@/app/(auth)/actions";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import type { SearchHit } from "@/server/domain/search";

export type ShellProps = {
  user: { name: string; email: string; isPlatformAdmin: boolean };
  org: { id: string; name: string; isDemo: boolean };
  role: Role;
  orgs: { id: string; name: string; role: Role }[];
  nav: NavItem[];
  quick: QuickAction[];
  children: React.ReactNode;
};

function useTheme() {
  const [pref, setPref] = React.useState<"light" | "dark" | "system">("system");
  React.useEffect(() => {
    setPref((document.documentElement.dataset.themePref as "light" | "dark" | "system") || "system");
  }, []);
  const apply = (p: "light" | "dark" | "system") => {
    setPref(p);
    try {
      localStorage.setItem("ag-theme", p);
    } catch {}
    const dark = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.themePref = p;
  };
  return { pref, apply };
}

function useOnline() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Sair: apaga as páginas guardadas offline neste aparelho antes de encerrar a sessão. */
async function logout() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  await logoutAction();
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, org, role, orgs, nav, quick, children }: ShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [mobileNav, setMobileNav] = React.useState(false);
  const online = useOnline();

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ag-sidebar") === "1");
    } catch {}
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  React.useEffect(() => setMobileNav(false), [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ag-sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const groups: { key: NavItem["group"]; items: NavItem[] }[] = (["main", "money", "system"] as const).map((g) => ({ key: g, items: nav.filter((n) => n.group === g) }));

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only z-[60] rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Pular para o conteúdo
      </a>
      {/* Barra lateral (desktop) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-panel transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-[68px]" : "w-[244px]",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-line", collapsed ? "justify-center" : "justify-between px-4")}>
          <Link href="/" className="no-underline" aria-label="Início">
            {collapsed ? <LogoMark /> : <Logo />}
          </Link>
          {!collapsed && (
            <button onClick={toggleCollapsed} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Recolher menu">
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Principal">
          {groups.map((g, gi) => (
            <div key={g.key} className={cn(gi > 0 && "mt-3 border-t border-line pt-3")}>
              {g.items.map((n) => (
                <SideLink key={n.key} item={n} active={isActive(pathname, n.href)} collapsed={collapsed} />
              ))}
            </div>
          ))}
          {user.isPlatformAdmin && (
            <div className="mt-3 border-t border-line pt-3">
              <Link
                href="/plataforma"
                title="Plataforma"
                className={cn(
                  "flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-sm text-ink-2 no-underline hover:bg-surface-2 hover:text-ink",
                  collapsed && "justify-center px-0",
                  isActive(pathname, "/plataforma") && "bg-surface text-ink shadow-sm",
                )}
              >
                <ShieldCheck className="size-[18px] shrink-0" strokeWidth={1.75} />
                {!collapsed && "Plataforma"}
              </Link>
            </div>
          )}
        </nav>
        {collapsed && (
          <button onClick={toggleCollapsed} className="mx-auto mb-3 rounded-md p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Expandir menu">
            <PanelLeftOpen className="size-4" />
          </button>
        )}
        <div className="border-t border-line p-2.5">
          <OrgMenu org={org} orgs={orgs} role={role} user={user} collapsed={collapsed} />
        </div>
      </aside>

      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-[68px]" : "lg:pl-[244px]")}>
        {/* Barra superior */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-5">
          <Link href="/" className="no-underline lg:hidden" aria-label="Início">
            <LogoMark />
          </Link>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-[8px] border border-line bg-surface px-3 text-left text-sm text-ink-3 shadow-sm transition-colors hover:border-line-strong sm:max-w-md"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Buscar item, série, contato, venda…</span>
            <kbd className="ml-auto hidden rounded border border-line bg-surface-2 px-1.5 text-[0.6875rem] font-medium text-ink-3 sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/escanear" className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Escanear código" title="Escanear código">
              <ScanLine className="size-[18px]" />
            </Link>
            {quick.length > 0 && <QuickMenu quick={quick} />}
            <ThemeMenu />
          </div>
        </header>

        {!online && (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning-text sm:px-6" role="status">
            <WifiOff className="size-4 shrink-0" />
            Sem conexão. Você está vendo dados carregados antes; nenhuma alteração será enviada até a internet voltar.
          </div>
        )}
        {org.isDemo && (
          <div className="border-b border-info/20 bg-info-soft px-4 py-1.5 text-center text-[0.8125rem] text-info sm:px-6">
            Empresa de demonstração — dados fictícios, separados de qualquer operação real.
          </div>
        )}

        <main id="conteudo" className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" aria-label="Navegação rápida">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {nav.find((n) => n.key === "home") && <BottomLink item={nav.find((n) => n.key === "home")!} active={pathname === "/"} />}
          {nav.find((n) => n.key === "stock") ? <BottomLink item={nav.find((n) => n.key === "stock")!} active={isActive(pathname, "/estoque")} /> : <span />}
          <div className="grid place-items-center">
            <MobileQuick quick={quick} />
          </div>
          {nav.find((n) => n.key === "sales") ? <BottomLink item={nav.find((n) => n.key === "sales")!} active={isActive(pathname, "/vendas")} /> : <span />}
          <button onClick={() => setMobileNav(true)} className="flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-ink-3">
            <MenuIcon className="size-5" strokeWidth={1.75} />
            Menu
          </button>
        </div>
      </nav>
      <Sheet open={mobileNav} onOpenChange={setMobileNav} title={org.name} description={`${user.name} · ${ROLE_LABEL[role]}`}>
        <nav className="-mx-2 flex flex-col">
          {nav.map((n) => (
            <SideLink key={n.key} item={n} active={isActive(pathname, n.href)} collapsed={false} large />
          ))}
          {user.isPlatformAdmin && (
            <Link href="/plataforma" className="flex h-11 items-center gap-3 rounded-[8px] px-3 text-[0.9375rem] text-ink-2 no-underline hover:bg-surface-2">
              <ShieldCheck className="size-5" strokeWidth={1.75} /> Plataforma
            </Link>
          )}
        </nav>
        <div className="mt-4 border-t border-line pt-4">
          {orgs.length > 1 && <OrgSwitchList orgs={orgs} current={org.id} />}
          <button onClick={() => logout()} className="flex h-11 w-full items-center gap-3 rounded-[8px] px-1 text-[0.9375rem] text-negative">
            <LogOut className="size-5" /> Sair
          </button>
        </div>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} quick={quick} />
    </div>
  );
}

function SideLink({ item, active, collapsed, large }: { item: NavItem; active: boolean; collapsed: boolean; large?: boolean }) {
  const Icon = NAV_ICONS[item.key];
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-[8px] text-ink-2 no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-ink",
        large ? "h-11 px-3 text-[0.9375rem]" : "h-9 px-2.5 text-sm",
        collapsed && "justify-center px-0",
        active && "bg-surface font-medium text-ink shadow-sm ring-1 ring-line",
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-accent" aria-hidden />}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-accent-text" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = NAV_ICONS[item.key];
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium no-underline", active ? "text-accent-text" : "text-ink-3")}>
      <Icon className="size-5" strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}

function QuickMenu({ quick }: { quick: QuickAction[] }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="hidden h-9 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-sm font-medium text-accent-ink shadow-sm hover:bg-accent-hover sm:inline-flex">
          <Plus className="size-4" /> Novo
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuLabel>Ações rápidas</MenuLabel>
        {quick.map((q) => {
          const Icon = QUICK_ICONS[q.key];
          return (
            <MenuItem key={q.key} onSelect={() => router.push(q.href)}>
              {Icon && <Icon />}
              {q.label}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

function MobileQuick({ quick }: { quick: QuickAction[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  if (!quick.length) return <span />;
  return (
    <>
      <button onClick={() => setOpen(true)} className="grid size-12 place-items-center rounded-[14px] bg-accent text-accent-ink shadow-[var(--shadow-md)] active:scale-95" aria-label="Ações rápidas">
        <Plus className="size-6" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="O que você quer registrar?">
        <div className="grid grid-cols-2 gap-2.5">
          {quick.map((q) => {
            const Icon = QUICK_ICONS[q.key];
            return (
              <button
                key={q.key}
                onClick={() => {
                  setOpen(false);
                  router.push(q.href);
                }}
                className="flex min-h-[84px] flex-col items-start justify-between gap-2 rounded-[12px] border border-line bg-surface-2 p-3 text-left text-sm font-medium text-ink active:scale-[0.98]"
              >
                {Icon && <Icon className="size-5 text-accent-text" />}
                {q.label}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function ThemeMenu() {
  const { pref, apply } = useTheme();
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Tema">
          <Icon className="size-[18px]" />
        </button>
      </MenuTrigger>
      <MenuContent className="min-w-40">
        {(
          [
            ["light", "Claro", Sun],
            ["dark", "Escuro", Moon],
            ["system", "Automático", Monitor],
          ] as const
        ).map(([v, label, I]) => (
          <MenuItem key={v} onSelect={() => apply(v)}>
            <I /> {label}
            {pref === v && <Check className="ml-auto !text-accent-text" />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function OrgMenu({ org, orgs, role, user, collapsed }: { org: ShellProps["org"]; orgs: ShellProps["orgs"]; role: Role; user: ShellProps["user"]; collapsed: boolean }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className={cn("flex w-full items-center gap-2.5 rounded-[8px] p-1.5 text-left hover:bg-surface-2", collapsed && "justify-center")}>
          <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-[0.8125rem] font-semibold text-accent-text">
            {org.name.slice(0, 2).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{org.name}</span>
                <span className="block truncate text-[0.75rem] text-ink-3">
                  {user.name} · {ROLE_LABEL[role]}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
            </>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>{user.email}</MenuLabel>
        {orgs.length > 1 && (
          <>
            <MenuSeparator />
            <MenuLabel>Trocar de empresa</MenuLabel>
            {orgs.map((o) => (
              <MenuItem
                key={o.id}
                onSelect={async () => {
                  if (o.id === org.id) return;
                  await switchOrgAction(o.id);
                  router.push("/");
                  router.refresh();
                }}
              >
                <Building2 />
                <span className="truncate">{o.name}</span>
                {o.id === org.id && <Check className="ml-auto !text-accent-text" />}
              </MenuItem>
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/configuracoes/conta")}>Minha conta</MenuItem>
        <MenuItem danger onSelect={() => logout()}>
          <LogOut /> Sair
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function OrgSwitchList({ orgs, current }: { orgs: ShellProps["orgs"]; current: string }) {
  const router = useRouter();
  return (
    <div className="mb-3">
      <p className="mb-1 text-[0.75rem] font-medium text-ink-3">Empresas</p>
      {orgs.map((o) => (
        <button
          key={o.id}
          onClick={async () => {
            await switchOrgAction(o.id);
            router.push("/");
            router.refresh();
          }}
          className="flex h-10 w-full items-center gap-2 rounded-[8px] px-1 text-left text-sm"
        >
          <Building2 className="size-4 text-ink-3" /> {o.name}
          {o.id === current && <Check className="ml-auto size-4 text-accent-text" />}
        </button>
      ))}
    </div>
  );
}

function CommandPalette({ open, onOpenChange, nav, quick }: { open: boolean; onOpenChange: (o: boolean) => void; nav: NavItem[]; quick: QuickAction[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const seq = React.useRef(0);

  React.useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
    }
  }, [open]);
  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchAction(term);
      if (id !== seq.current) return;
      setLoading(false);
      setHits(r.ok ? r.data : []);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => ((acc[h.type] ??= []).push(h), acc), {});

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Busca universal">
      <div className="absolute inset-0 bg-[var(--overlay)] animate-[ag-fade-in_140ms_ease-out]" onClick={() => onOpenChange(false)} />
      <Command
        shouldFilter={false}
        loop
        className="relative mx-auto mt-[8vh] w-[calc(100vw-1.5rem)] max-w-[640px] overflow-hidden rounded-[14px] border border-line bg-surface shadow-[var(--shadow-lg)] animate-[ag-pop_180ms_var(--ease-out-expo)]"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          {loading ? <Loader2 className="size-[18px] animate-spin text-ink-3" /> : <Search className="size-[18px] text-ink-3" />}
          <Command.Input
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder="Código, número de série, nome, contato, venda…"
            className="h-14 w-full bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 text-[0.6875rem] text-ink-3">Esc</kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length >= 2 && !loading && hits.length === 0 && (
            <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">Nada encontrado para “{q.trim()}”.</Command.Empty>
          )}
          {Object.entries(grouped).map(([type, list]) => (
            <Command.Group key={type} heading={type} className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[0.75rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
              {list.map((h) => (
                <PaletteItem key={`${h.type}-${h.id}`} value={`${h.type}-${h.id}`} onSelect={() => go(h.href)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{h.title}</span>
                    <span className="block truncate text-[0.8125rem] text-ink-3">{h.subtitle}</span>
                  </span>
                </PaletteItem>
              ))}
            </Command.Group>
          ))}
          {q.trim().length < 2 && (
            <>
              <Command.Group heading="Ações rápidas" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[0.75rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
                {quick.map((a) => {
                  const Icon = QUICK_ICONS[a.key];
                  return (
                    <PaletteItem key={a.key} value={`q-${a.key}`} onSelect={() => go(a.href)}>
                      {Icon && <Icon className="size-4 text-ink-3" />}
                      <span className="text-ink">{a.label}</span>
                    </PaletteItem>
                  );
                })}
              </Command.Group>
              <Command.Group heading="Ir para" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[0.75rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
                {nav.map((n) => {
                  const Icon = NAV_ICONS[n.key];
                  return (
                    <PaletteItem key={n.key} value={`n-${n.key}`} onSelect={() => go(n.href)}>
                      <Icon className="size-4 text-ink-3" />
                      <span className="text-ink">{n.label}</span>
                    </PaletteItem>
                  );
                })}
              </Command.Group>
            </>
          )}
        </Command.List>
        <div className="flex items-center gap-3 border-t border-line bg-surface-2/60 px-4 py-2 text-[0.75rem] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" /> abrir
          </span>
          <span>↑↓ navegar</span>
          <Badge tone="muted" className="ml-auto">
            Dica: digite “/” em qualquer tela
          </Badge>
        </div>
      </Command>
    </div>
  );
}

function PaletteItem({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-sm data-[selected=true]:bg-surface-2"
    >
      {children}
    </Command.Item>
  );
}
