import { AlertCircle, Info } from "lucide-react";
import { STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/format";
import type { Status } from "@/lib/types";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-stone-200 bg-white", className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, description, action, className }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-stone-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-stone-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, children }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Badge({ children, className, tone = "bg-stone-100 text-stone-700" }: {
  children: React.ReactNode; className?: string; tone?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4", tone, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

export function StatusDot({ status }: { status: Status }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_META[status].dot)} />;
}

export function EmptyState({ icon, title, children, action, className }: {
  icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-stone-100 text-stone-500">{icon}</div>}
      <p className="text-sm font-medium text-stone-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-[13px] leading-relaxed text-stone-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-stone-200/60", className)} />;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">
      <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" />{message}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline-offset-2 hover:underline">Retry</button>}
    </div>
  );
}

export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex gap-2 text-xs leading-relaxed text-stone-500", className)}>
      <Info className="mt-px size-3.5 shrink-0 text-stone-500" />
      <span>{children}</span>
    </p>
  );
}

export function LimitedData({ label = "Limited data" }: { label?: string }) {
  return <Badge tone="bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70">{label}</Badge>;
}

/** Horizontal bar; value is 0-100. */
export function Meter({ value, className, tone = "bg-accent-500" }: { value: number | null; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-stone-100", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone)}
           style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("px-4 py-3.5", className)}>
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-stone-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-5 overflow-x-auto border-b border-stone-200", className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
                className={cn("-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
                              value === t.id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800")}>
          {t.label}
          {t.count !== undefined && <span className="rounded bg-stone-100 px-1.5 text-[11px] tabular-nums text-stone-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; icon?: React.ReactNode }[]; value: T; onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-stone-300 bg-white p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium transition-colors",
                              value === o.id ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
