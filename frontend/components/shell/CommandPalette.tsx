"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Loader2, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useDebounced } from "@/lib/use-async";
import type { SearchGroup } from "@/lib/types";
import { ALL_PAGES } from "./nav";

interface Item { key: string; title: string; subtitle?: string | null; snippet?: string | null; href: string; group: string; icon?: React.ReactNode }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query.trim(), 200);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when reopened
      setQuery("");
      setGroups([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (debounced.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results
      setGroups([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.search(debounced)
      .then((r) => { if (!cancelled) setGroups(r.groups); })
      .catch(() => { if (!cancelled) setGroups([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions: Item[] = [
      { key: "new-app", title: "New application", href: "/applications?new=1", group: "Actions", icon: <Plus className="size-4" /> },
      ...ALL_PAGES.map((p) => ({ key: p.href, title: p.label, href: p.href, group: "Go to", icon: <p.icon className="size-4" /> })),
    ].filter((a) => !q || a.title.toLowerCase().includes(q));
    const results: Item[] = groups.flatMap((g) => g.items.map((i) => ({
      key: `${g.type}-${i.id}`, title: i.title, subtitle: i.subtitle, snippet: i.snippet, href: i.href, group: g.label,
    })));
    return [...results, ...actions];
  }, [groups, query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the highlighted row valid
  useEffect(() => { setActive(0); }, [items.length]);

  if (!open) return null;

  const go = (item?: Item) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
    else if (e.key === "Escape") onClose();
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/45 px-4 pt-[12vh] animate-fade-in"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Search"
           className="h-fit w-full max-w-xl overflow-hidden rounded-lg border border-stone-200 bg-white shadow-pop animate-pop-in">
        <div className="flex items-center gap-2.5 border-b border-stone-100 px-4">
          {loading ? <Loader2 className="size-4 animate-spin text-stone-500" /> : <Search className="size-4 text-stone-500" />}
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                 placeholder="Search applications, contacts, questions, skills…"
                 className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" />
          <kbd className="rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1.5 scroll-thin">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-stone-500">
              {debounced.length >= 2 && !loading ? `No results for “${debounced}”.` : "Type at least 2 characters."}
            </p>
          )}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header && <p className="px-4 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-stone-500">{header}</p>}
                <button type="button" onMouseEnter={() => setActive(index)} onClick={() => go(item)}
                        className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", index === active && "bg-stone-100")}>
                  {item.icon && <span className="text-stone-500">{item.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-stone-900">{item.title}</span>
                    {(item.subtitle || item.snippet) && (
                      <span className="block truncate text-xs text-stone-500">
                        {[item.subtitle, item.snippet].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {index === active
                    ? <CornerDownLeft className="size-3.5 text-stone-500" />
                    : <ArrowRight className="size-3.5 text-transparent" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
