"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn, initials } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { CommandPalette } from "./CommandPalette";
import { NAV, SETTINGS_ITEM } from "./nav";

function NavLink({ href, label, icon: Icon, onNavigate }: {
  href: string; label: string; icon: React.ComponentType<{ className?: string }>; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
          className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                        active ? "bg-white text-stone-900 shadow-[0_0_0_1px_rgb(231_229_228)]"
                               : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900")}>
      <Icon className={cn("size-4", active ? "text-accent-600" : "text-stone-500")} />
      {label}
    </Link>
  );
}

function SidebarContent({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const { user, logout } = useAuth();
  const name = user?.full_name || user?.email || "";
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" onClick={onNavigate}><Logo /></Link>
      </div>
      <div className="px-3">
        <button onClick={onSearch}
                className="flex h-8 w-full items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 text-[13px] text-stone-500 transition-colors hover:border-stone-300">
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] font-medium text-stone-500">Ctrl K</kbd>
        </button>
      </div>
      <nav className="mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-4 scroll-thin" aria-label="Main">
        {NAV.map((group, i) => (
          <div key={i}>
            {group.label && <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-stone-600">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map((item) => <NavLink key={item.href} {...item} onNavigate={onNavigate} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-stone-200 p-3">
        <NavLink {...SETTINGS_ITEM} onNavigate={onNavigate} />
        <div className="mt-2 flex items-center gap-2.5 px-2.5 py-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-800">
            {name ? initials(name) : ""}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-stone-900">{user?.full_name || "—"}</p>
            <p className="truncate text-[11px] text-stone-600">{user?.email}</p>
          </div>
          <button onClick={logout} aria-label="Log out" title="Log out"
                  className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-200/60 hover:text-stone-700">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated === false) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isAuthenticated, pathname, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!isAuthenticated) {
    return <div className="flex h-screen items-center justify-center"><Logo className="opacity-40" /></div>;
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-stone-200 bg-stone-100/70 lg:block">
        <SidebarContent onSearch={() => setPaletteOpen(true)} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-stone-200 bg-stone-50/90 px-3 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded p-1.5 text-stone-600 hover:bg-stone-200/60">
          <Menu className="size-5" />
        </button>
        <Logo />
        <button onClick={() => setPaletteOpen(true)} aria-label="Search" className="rounded p-1.5 text-stone-600 hover:bg-stone-200/60">
          <Search className="size-5" />
        </button>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/30 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-stone-200 bg-stone-100 animate-pop-in">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
                    className="absolute right-2 top-3 rounded p-1.5 text-stone-500 hover:bg-stone-200/60">
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)}
                            onSearch={() => { setMobileOpen(false); setPaletteOpen(true); }} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
