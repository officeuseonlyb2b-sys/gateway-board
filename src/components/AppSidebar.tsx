import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Building2, Plane, ShoppingBag, Landmark, Compass, UserCheck,
  Calculator, FileText, Settings as SettingsIcon, LogOut, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth-mock";
import { useBranding } from "@/lib/branding";


interface Item {
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
  badge?: string;
}

const ITEMS: Item[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Hotels", to: "/hotels", icon: Building2 },
  { label: "Travels", to: "/travels", icon: Plane },
  { label: "Miscellaneous", to: "/miscellaneous", icon: ShoppingBag },
  { label: "Entrances", to: "/entrances", icon: Landmark },
  { label: "Guide", to: "/guide", icon: UserCheck },
  { label: "Activity & Experience", to: "/activities", icon: Compass },
  { label: "Final Costing", to: "/costing", icon: Calculator },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
];


export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-[width] duration-200 print:hidden",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-gold flex items-center justify-center shrink-0">
          <span className="text-gold-foreground font-bold text-sm">MP</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">MP Tourism</div>
            <div className="text-[11px] text-sidebar-foreground/60 leading-tight">Operations Hub</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active = it.to && (pathname === it.to || pathname.startsWith(it.to + "/"));
          const content = (
            <>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{it.label}</span>}
              {!collapsed && it.badge && (
                <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-sidebar-accent/60 text-sidebar-foreground/70">
                  {it.badge}
                </span>
              )}
            </>
          );
          const base = cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
            active
              ? "bg-gold text-gold-foreground shadow-sm"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            it.disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-sidebar-foreground/80",
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
