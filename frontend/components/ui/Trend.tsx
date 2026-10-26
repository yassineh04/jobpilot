import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/format";

/** Tiny line chart; values are drawn relative to their own max. */
export function Sparkline({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-7 w-24 overflow-visible", className)}
         role="img" aria-label={label ?? `Trend: ${values.join(", ")}`}>
      <polygon points={area} className="fill-accent-500/10" />
      <polyline points={line} fill="none" className="stroke-accent-500" strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="2.2" className="fill-accent-600" />
    </svg>
  );
}

/** "+3 vs last week" style change indicator. Neutral wording: more is not always better. */
export function Delta({ current, previous, suffix = "vs last week" }: { current: number; previous: number; suffix?: string }) {
  const diff = current - previous;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs",
                        diff > 0 ? "text-accent-700" : diff < 0 ? "text-stone-600" : "text-stone-500")}>
      <Icon className="size-3.5" aria-hidden />
      {diff === 0 ? "Same" : `${diff > 0 ? "+" : ""}${diff}`} {suffix}
    </span>
  );
}
