import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-300",
  secondary: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 hover:border-stone-400 disabled:text-stone-400",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:text-stone-300",
  subtle: "bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:text-stone-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px] gap-1.5",
  md: "h-8.5 px-3 text-sm gap-2",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap select-none",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40",
    "disabled:cursor-not-allowed",
    VARIANTS[variant], SIZES[size], extra,
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", icon, className, children }: {
  href: string; variant?: Variant; size?: Size; icon?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label}
            className={cn("inline-flex size-7 items-center justify-center rounded-md text-stone-500 transition-colors",
                          "hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40",
                          className)}
            {...rest}>
      {children}
    </button>
  );
}
