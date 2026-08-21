import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Building2, Plane, ShoppingBag, Landmark, Compass, UserCheck,
  Calculator, FileText, BarChart2, Settings as SettingsIcon, LogOut, ChevronLeft, ChevronRight,
  FolderClock, Bell, Users, MapPin, UtensilsCrossed, Search, UserPlus, CheckSquare,
  Route as RouteIcon, ShieldCheck, Gauge,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth-mock";
import { useBranding } from "@/lib/branding";
import { useDraftCount } from "@/lib/drafts-store";
import { useUnreadCount } from "@/lib/notifications-store";
import { useIsManager } from "@/lib/crm/role";

interface Item {
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
  badgeKey?: "drafts" | "notifications";
  managerOnly?: boolean;
}

interface Section {
  label: string;
  items: Item[];
  managerOnly?: boolean;
}

const SECTIONS: Section[] = [
  { label: "Overview", items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Sales & Queries",
    items: [
      { label: "Manager Dashboard", to: "/manager-dashboard", icon: Gauge, managerOnly: true },
      { label: "Query Tracker", to: "/query-tracker", icon: Search },
      { label: "New Lead", to: "/new-lead", icon: UserPlus },
      { label: "My Tasks", to: "/my-tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Product",
    items: [
      { label: "Destinations & Tours", to: "/destinations", icon: MapPin },
      { label: "Entrance Fees", to: "/entrances", icon: Landmark },
      { label: "Routing & Programs", to: "/routing-programs", icon: RouteIcon },
    ],
  },
  {
    label: "Contracting",
    items: [
      { label: "Hotels", to: "/hotels", icon: Building2 },
      { label: "Restaurants & Meals", to: "/meals", icon: UtensilsCrossed },
    ],
  },
  {
    label: "Vendor Management",
    items: [
      { label: "Transport", to: "/travels", icon: Plane },
      { label: "Guides", to: "/guide", icon: UserCheck },
      { label: "Activities & Experiences", to: "/activities", icon: Compass },
      { label: "Other Services", to: "/miscellaneous", icon: ShoppingBag },
    ],
  },
  { label: "Partner Management", items: [{ label: "Travel Partners", to: "/agents", icon: Users }] },
  {
    label: "Quotations",
    items: [
      { label: "New Quotation", to: "/costing", icon: Calculator, badgeKey: "drafts" },
      { label: "Drafts", to: "/drafts", icon: FolderClock },
      { label: "Saved Quotes", to: "/quotes", icon: FileText },
    ],
  },
  {
    label: "Analytics",
    managerOnly: true,
    items: [{ label: "Reports & Insights", to: "/reports", icon: BarChart2, managerOnly: true }],
  },
  {
    label: "System",
    items: [
      { label: "Users & Roles", to: "/users-roles", icon: ShieldCheck, managerOnly: true },
      { label: "Notifications", to: "/notifications", icon: Bell, badgeKey: "notifications" },
      { label: "Settings", to: "/settings", icon: SettingsIcon },
    ],
  },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brand = useBranding();
  const draftCount = useDraftCount();
  const unread = useUnreadCount();
  const isManager = useIsManager();
  const badgeFor = (k?: Item["badgeKey"]) =>
    k === "drafts" ? draftCount : k === "notifications" ? unread : 0;

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
          <div className="h-9 w-9 rounded-lg border-2 border-accent flex items-center justify-center shrink-0">
            <span className="text-accent font-bold text-sm">MP</span>
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">{brand.companyName || "MP Tourism"}</div>
            <div className="text-[11px] text-sidebar-foreground/60 leading-tight truncate">{brand.tagline || "Operations Hub"}</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {SECTIONS.filter((s) => !s.managerOnly || isManager).map((section) => {
          const items = section.items.filter((it) => !it.managerOnly || isManager);
          if (!items.length) return null;
          return (
            <div key={section.label} className="mb-3">
              {!collapsed && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-accent/80">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((it) => {
                  const Icon = it.icon;
                  const active = it.to && (pathname === it.to || pathname.startsWith(it.to + "/"));
                  const badge = badgeFor(it.badgeKey);
                  const content = (
                    <>
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />}
                      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-sidebar-foreground/70")} />
                      {!collapsed && <span className="truncate flex-1">{it.label}</span>}
                      {badge > 0 && (
                        <span
                          className={cn(
                            "ml-auto rounded-full bg-accent text-accent-foreground text-[10px] font-semibold flex items-center justify-center",
                            collapsed ? "absolute top-1 right-1 h-4 min-w-4 px-1" : "h-4 min-w-4 px-1.5",
                          )}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
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
            </div>
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
