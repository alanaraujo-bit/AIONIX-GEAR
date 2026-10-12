import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-[var(--radius-ctl)] border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink shadow-[inset_0_1px_0_oklch(0_0_0/0.02)] transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 hover:border-ink-3 focus:border-accent focus:outline-none focus:shadow-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-negative";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Select nativo estilizado: confiável no celular e acessível por padrão. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <span className={cn("relative block", wrapperClassName)}>
      <select ref={ref} className={cn(control, "h-10 cursor-pointer appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </span>
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[0.8125rem] font-medium text-ink-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  className,
  children,
  aside,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  // Liga o rótulo ao controle automaticamente (acessibilidade e leitores de tela).
  const auto = React.useId();
  let child = children;
  let forId = htmlFor;
  if (!forId && React.isValidElement<{ id?: string; "aria-describedby"?: string }>(children)) {
    forId = children.props.id ?? auto;
    if (!children.props.id) child = React.cloneElement(children, { id: forId });
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <Label htmlFor={forId}>
              {label}
              {required && <span className="ml-0.5 text-negative" aria-hidden>*</span>}
            </Label>
          )}
          {aside}
        </div>
      )}
      {child}
      {error ? (
        <p className="text-[0.8125rem] text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]" {...props} />
      <span className="min-w-0">
        <span className="text-ink">{label}</span>
        {description && <span className="block text-[0.8125rem] text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  className?: string;
  size?: "sm" | "md";
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("inline-flex rounded-[var(--radius-ctl)] border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[6px] px-3 font-medium text-ink-2 transition-colors duration-150 hover:text-ink",
            size === "sm" ? "h-7 text-[0.8125rem]" : "h-9 text-sm",
            value === o.value && "bg-surface text-ink shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
