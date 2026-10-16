import { forwardRef, useId } from "react";
import { cn } from "@/lib/format";

export const controlClass = cn(
  "w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900",
  "placeholder:text-stone-400 transition-colors",
  "hover:border-stone-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20",
  "disabled:bg-stone-50 disabled:text-stone-500",
  "aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/20",
);

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
}

/** Label + control + hint/error, with ids wired for accessibility. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-stone-700">
          {label}
          {optional && <span aria-hidden className="ml-1 font-normal text-stone-500">optional</span>}
        </label>
      )}
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string; hint?: string; error?: string | null; optional?: boolean; wrapperClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, wrapperClassName, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {(id, describedBy) => (
        <input ref={ref} id={id} aria-describedby={describedBy} aria-invalid={!!error}
               className={cn(controlClass, "h-8.5", className)} {...rest} />
      )}
    </Field>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string; hint?: string; error?: string | null; optional?: boolean; wrapperClassName?: string;
};

export function Textarea({ label, hint, error, optional, wrapperClassName, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {(id, describedBy) => (
        <textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={!!error}
                  className={cn(controlClass, "resize-y leading-relaxed", className)} {...rest} />
      )}
    </Field>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string; hint?: string; error?: string | null; optional?: boolean; wrapperClassName?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function Select({ label, hint, error, optional, wrapperClassName, className, options, placeholder, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={!!error}
                className={cn(controlClass, "h-8.5 pr-8", className)} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
      {message}
    </div>
  );
}
