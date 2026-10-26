import type { ComponentType } from "react";
import {
  BarChart3, Briefcase, CalendarDays, LayoutDashboard, MessagesSquare, Settings, UserRound, Users,
} from "lucide-react";
import { AgentMark } from "@/components/agent/AgentMark";

export type BadgeKey = "agenda" | "contacts";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
  badge?: BadgeKey;
}

export const NAV: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, shortcut: "G O" },
      { href: "/applications", label: "Applications", icon: Briefcase, shortcut: "G A" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, shortcut: "G G", badge: "agenda" },
    ],
  },
  {
    label: "Prepare",
    items: [
      { href: "/interviews", label: "Interview prep", icon: MessagesSquare, shortcut: "G I" },
      { href: "/profile", label: "Profile & resumes", icon: UserRound, shortcut: "G P" },
      { href: "/contacts", label: "Contacts", icon: Users, shortcut: "G C", badge: "contacts" },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, shortcut: "G Y" },
      { href: "/assistant", label: "JobPilot agent", icon: AgentMark, shortcut: "G J" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, shortcut: "G S" };

export const ALL_PAGES = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];
