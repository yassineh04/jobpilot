import {
  BarChart3, Briefcase, CalendarDays, LayoutDashboard, MessageSquareText, MessagesSquare, Settings, UserRound, Users,
} from "lucide-react";

export const NAV = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/applications", label: "Applications", icon: Briefcase },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Prepare",
    items: [
      { href: "/interviews", label: "Interview prep", icon: MessagesSquare },
      { href: "/profile", label: "Profile & resumes", icon: UserRound },
      { href: "/contacts", label: "Contacts", icon: Users },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/assistant", label: "Ask JobPilot", icon: MessageSquareText },
    ],
  },
];

export const SETTINGS_ITEM = { href: "/settings", label: "Settings", icon: Settings };

export const ALL_PAGES = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];
