import { cn } from "@/lib/format";

/** The agent's icon: the logo's rising path, drawn as a line icon so it sits next to Lucide icons. */
export function AgentMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
         strokeLinejoin="round" className={cn("size-4", className)} aria-hidden>
      <path d="M3.5 17.5 9.5 11.5 13.5 15.5 19 8" />
      <circle cx="19.5" cy="7.5" r="2.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
