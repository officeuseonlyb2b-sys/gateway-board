import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Building2, Plane, ShoppingBag, Landmark, Compass, UserCheck,
  Calculator, FileText, BarChart2, Settings as SettingsIcon, LogOut, ChevronLeft, ChevronRight,
  FolderClock, Bell,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth-mock";
import { useBranding } from "@/lib/branding";
import { useDraftCount } from "@/lib/drafts-store";
import { useUnreadCount } from "@/lib/notifications-store";

interface Item {
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
  badgeKey?: "drafts" | "notifications";
}

const SECTIONS: Item[][] = [
  [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
  [
    { label: "Hotels", to: "/hotels", icon: Building2 },
    { label: "Travels", to: "/travels", icon: Plane },
    { label: "Miscellaneous", to: "/miscellaneous", icon: ShoppingBag },
    { label: "Entrances", to: "/entrances", icon: Landmark },
    { label: "Guide", to: "/guide", icon: UserCheck },
    { label: "Activity & Experience", to: "/activities", icon: Compass },
  ],
  [
    { label: "New Quotation", to: "/costing", icon: Calculator },
    { label: "Drafts", to: "/drafts", icon: FolderClock, badgeKey: "drafts" },
    { label: "Saved Quotes", to: "/quotes", icon: FileText },
    { label: "Reports", to: "/reports", icon: BarChart2 },
  ],
  [
    { label: "Notifications", to: "/notifications", icon: Bell, badgeKey: "notifications" },
    { label: "Settings", to: "/settings", icon: SettingsIcon },
  ],
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brand = useBranding();

  return (
    <aside
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-[width] duration-200 print:hidden",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sidebar-border">
        {brand.logo ? (
          <img
            src={brand.logo}
            alt="logo"
            className="h-9 w-9 rounded-lg object-contain bg-white/95 p-0.5 shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-accent-foreground font-bold text-sm">MP</span>
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">{brand.companyName || "MP Tourism"}</div>
            <div className="text-[11px] text-sidebar-foreground/60 leading-tight truncate">{brand.tagline}</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {SECTIONS.map((section, si) => (
          <div key={si} className={cn("space-y-1", si > 0 && "mt-3 pt-3 border-t border-sidebar-border/60")}>
            {section.map((it) => {
              const Icon = it.icon;
              const active = it.to && (pathname === it.to || pathname.startsWith(it.to + "/"));
              const content = (
                <>
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />}
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-sidebar-foreground/70")} />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                </>
              );
              const base = cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent/60 text-accent"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                it.disabled && "opacity-40 cursor-not-allowed",
              );
              if (it.disabled || !it.to) {
                return (
                  <div key={it.label} className={base} title={collapsed ? it.label : undefined}>
                    {content}
                  </div>
                );
              }
              return (
                <Link key={it.label} to={it.to} className={base} title={collapsed ? it.label : undefined}>
                  {content}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => auth.signOut()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
