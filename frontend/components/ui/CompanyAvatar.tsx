import { cn, initials } from "@/lib/format";

/** Stable hue per company name, so the same company always gets the same color. */
export function hueFor(name: string) {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

const SIZES = { xs: "size-5 text-[9px] rounded", sm: "size-7 text-[11px] rounded-md", md: "size-9 text-xs rounded-md", lg: "size-11 text-sm rounded-lg" };

export function CompanyAvatar({ name, size = "sm", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  const style = { "--h": hueFor(name || "?") } as React.CSSProperties;
  return (
    <span aria-hidden style={style}
          className={cn("inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-tight",
                        "bg-[hsl(var(--h)_45%_92%)] text-[hsl(var(--h)_45%_28%)] ring-1 ring-inset ring-[hsl(var(--h)_35%_84%)]",
                        "dark:bg-[hsl(var(--h)_30%_20%)] dark:text-[hsl(var(--h)_55%_82%)] dark:ring-[hsl(var(--h)_25%_28%)]",
                        SIZES[size], className)}>
      {initials(name || "?").slice(0, 2)}
    </span>
  );
}
