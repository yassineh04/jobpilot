import { cn } from "@/lib/format";

/** Wordmark: a compass-like mark (pipeline stages converging) + name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="size-5.5" aria-hidden>
        <rect width="24" height="24" rx="6" className="fill-stone-900" />
        <path d="M6 16.5 10.5 12 13.5 15 18 8.5" fill="none" className="stroke-white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="8.5" r="1.6" className="fill-accent-300" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-stone-900">JobPilot</span>
    </span>
  );
}
