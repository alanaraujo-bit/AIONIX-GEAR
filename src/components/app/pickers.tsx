"use client";

import * as React from "react";
import * as P from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus, UserRound, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { quickContactAction } from "@/app/(app)/contatos/actions";
import { toast } from "sonner";

export type ContactOption = { id: string; name: string; whatsapp?: string | null; phone?: string | null; city?: string | null };

/** Seletor de contato com busca e cadastro rápido sem sair do formulário. */
export function ContactPicker({
  value,
  onChange,
  options,
  placeholder = "Escolher contato",
  role,
  allowEmpty = true,
  invalid,
  id,
}: {
  value: string | null;
  onChange: (id: string | null, contact?: ContactOption) => void;
  options: ContactOption[];
  placeholder?: string;
  role?: "customer" | "supplier";
  allowEmpty?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [extra, setExtra] = React.useState<ContactOption[]>([]);
  const [creating, setCreating] = React.useState<string | null>(null);
  const all = React.useMemo(() => [...extra, ...options], [extra, options]);
  const selected = all.find((o) => o.id === value);
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const filtered = term
    ? all.filter((o) => o.name.toLowerCase().includes(term) || (digits.length >= 3 && `${o.whatsapp ?? ""}${o.phone ?? ""}`.includes(digits))).slice(0, 50)
    : all.slice(0, 50);

  return (
    <>
      <P.Root open={open} onOpenChange={setOpen}>
        <P.Trigger asChild>
          <button
            id={id}
            type="button"
            data-invalid={invalid || undefined}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-[var(--radius-ctl)] border border-line-strong bg-surface px-3 text-left text-[0.9375rem] transition-colors hover:border-ink-3 focus:border-accent focus:outline-none focus:shadow-[var(--focus)] data-[invalid]:border-negative",
              !selected && "text-ink-3",
            )}
          >
            <UserRound className="size-4 shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate">{selected ? selected.name : placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
          </button>
        </P.Trigger>
        <P.Portal>
          <P.Content align="start" sideOffset={6} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-[10px] border border-line bg-surface shadow-[var(--shadow-lg)]">
            <Command shouldFilter={false} loop>
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="size-4 text-ink-3" />
                <Command.Input value={q} onValueChange={setQ} placeholder="Nome ou telefone…" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-ink-3" />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1">
                {allowEmpty && value && (
                  <Command.Item onSelect={() => (onChange(null), setOpen(false))} className="flex h-9 cursor-pointer items-center rounded-md px-2.5 text-sm text-ink-3 data-[selected=true]:bg-surface-2">
                    Sem contato
                  </Command.Item>
                )}
                {filtered.map((o) => (
                  <Command.Item
                    key={o.id}
                    value={o.id}
                    onSelect={() => {
                      onChange(o.id, o);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-sm data-[selected=true]:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.name}</span>
                      {(o.whatsapp || o.city) && <span className="block truncate text-[0.75rem] text-ink-3">{[o.whatsapp ?? o.phone, o.city].filter(Boolean).join(" · ")}</span>}
                    </span>
                    {o.id === value && <Check className="size-4 text-accent-text" />}
                  </Command.Item>
                ))}
                <Command.Item
                  value="__new"
                  onSelect={() => {
                    setCreating(q.trim());
                    setOpen(false);
                  }}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm font-medium text-accent-text data-[selected=true]:bg-surface-2"
                >
                  <Plus className="size-4" /> {q.trim() ? `Cadastrar “${q.trim()}”` : "Cadastrar novo contato"}
                </Command.Item>
              </Command.List>
            </Command>
          </P.Content>
        </P.Portal>
      </P.Root>
      <QuickContactDialog
        initialName={creating}
        role={role}
        onClose={() => setCreating(null)}
        onCreated={(c) => {
          setExtra((e) => [c, ...e]);
          onChange(c.id, c);
          setCreating(null);
        }}
      />
    </>
  );
}

function QuickContactDialog({ initialName, role, onClose, onCreated }: { initialName: string | null; role?: "customer" | "supplier"; onClose: () => void; onCreated: (c: ContactOption) => void }) {
  const [name, setName] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    if (initialName !== null) {
      setName(initialName);
      setWhatsapp("");
    }
  }, [initialName]);
  return (
    <Dialog open={initialName !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Novo contato" description="O básico agora; você completa depois na ficha do contato.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await quickContactAction({ name, whatsapp, role });
              if (r.ok) {
                toast.success("Contato cadastrado");
                onCreated({ id: r.data.id, name: r.data.name, whatsapp });
              } else toast.error(r.error);
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Nome" required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <Field label="WhatsApp" hint="Com DDD. Usado para enviar orçamentos e recibos.">
            <Input inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(91) 99999-0000" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type LocationOpt = { id: string; path: string };

export function LocationSelect({ value, onChange, options, id, emptyLabel = "Sem local definido" }: { value: string | null; onChange: (v: string | null) => void; options: LocationOpt[]; id?: string; emptyLabel?: string }) {
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.path}
        </option>
      ))}
    </Select>
  );
}
