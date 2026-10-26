"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { DATA_CHANGED } from "@/lib/use-async";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AgentProvider, useAgent } from "@/components/agent/AgentProvider";
import { CommandPalette } from "./CommandPalette";
import { NAV, SETTINGS_ITEM, type BadgeKey, type NavItem } from "./nav";
import { ShortcutsDialog, useGlobalShortcuts } from "./Shortcuts";
import { UserMenu } from "./UserMenu";

type Badges = Partial<Record<BadgeKey, number>>;

/** Navigation counters, refreshed on route change and when the tab regains focus. */
function useBadges(enabled: boolean) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges>({});
  const load = useCallback(() => {
    api.badges().then((b) => setBadges({ agenda: b.agenda, contacts: b.contacts })).catch(() => {});
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load, pathname]);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", load);
    window.addEventListener(DATA_CHANGED, load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener(DATA_CHANGED, load);
    };
  }, [enabled, load]);
  return badges;
}

function NavLink({ item, count, onNavigate }: { item: NavItem; count?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
          title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
          className={cn("group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                        active ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
                               : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900")}>
      <Icon className={cn("size-4 shrink-0", active ? "text-accent-600" : "text-stone-500 group-hover:text-stone-700")} />
      <span className="flex-1 truncate">{item.label}</span>
      {!!count && (
        <span className="min-w-5 rounded-full bg-accent-600 px-1.5 text-center text-[11px] font-semibold leading-5 text-on-accent tabular-nums">
          {count > 99 ? "99+" : count}<span className="sr-only"> need attention</span>
        </span>
      )}
    </Link>
  );
}

function SidebarContent({ badges, onNavigate, onSearch, onShortcuts }: {
  badges: Badges; onNavigate?: () => void; onSearch: () => void; onShortcuts: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" onClick={onNavigate} aria-label="JobPilot overview"><Logo /></Link>
        <Link href="/applications?new=1" onClick={onNavigate} aria-label="New application" title="New application (N)"
              className="mr-8 flex size-7 items-center justify-center rounded-md text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-white hover:text-stone-900 lg:mr-0">
          <Plus className="size-4" />
        </Link>
      </div>
      <div className="px-3">
        <button type="button" onClick={onSearch}
                className="flex h-8 w-full items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 text-[13px] text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700">
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-stone-200 px-1 text-[10px] font-medium text-stone-500">Ctrl K</kbd>
        </button>
      </div>
      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4 scroll-thin" aria-label="Main">
        {NAV.map((group, i) => (
          <div key={i}>
            {group.label && <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-stone-600">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} count={item.badge ? badges[item.badge] : undefined} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-stone-200 p-3">
        <NavLink item={SETTINGS_ITEM} onNavigate={onNavigate} />
        <UserMenu onShortcuts={onShortcuts} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <AgentProvider><Shell>{children}</Shell></AgentProvider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { setOpen: setAgentOpen } = useAgent();
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const badges = useBadges(!!isAuthenticated);

  useEffect(() => {
    if (isAuthenticated === false) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isAuthenticated, pathname, router]);

  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const toggleAgent = useCallback(() => {
    if (pathname !== "/assistant") setAgentOpen((o) => !o);
  }, [pathname, setAgentOpen]);
  useGlobalShortcuts({ onPalette: togglePalette, onHelp: openHelp, onAgent: toggleAgent });

  if (!isAuthenticated) {
    return <div className="flex h-screen items-center justify-center"><Logo className="opacity-40" /></div>;
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main"
         className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-stone-200 bg-stone-100/70 lg:block">
        <SidebarContent badges={badges} onSearch={() => setPaletteOpen(true)} onShortcuts={openHelp} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-stone-200 bg-stone-50/90 px-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" className="relative rounded p-1.5 text-stone-600 hover:bg-stone-200/60">
          <Menu className="size-5" />
          {!!(badges.agenda || badges.contacts) && <span className="absolute right-1 top-1 size-2 rounded-full bg-accent-600" />}
        </button>
        <Logo />
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className="rounded p-1.5 text-stone-600 hover:bg-stone-200/60">
          <Search className="size-5" />
        </button>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-stone-200 bg-stone-100 animate-pop-in">
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu"
                    className="absolute right-2 top-3.5 rounded p-1.5 text-stone-500 hover:bg-stone-200/60">
              <X className="size-4" />
            </button>
            <SidebarContent badges={badges} onNavigate={() => setMobileOpen(false)} onShortcuts={openHelp}
                            onSearch={() => { setMobileOpen(false); setPaletteOpen(true); }} />
          </aside>
        </div>
      )}

      {/* Room at the bottom so the agent button never hides the last row (no button on the agent page) */}
      <main id="main" className={cn("mx-auto w-full max-w-[1280px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8",
                                    pathname === "/assistant" ? "pb-6 lg:pb-8" : "pb-24")}>{children}</main>
      <AgentPanel />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
