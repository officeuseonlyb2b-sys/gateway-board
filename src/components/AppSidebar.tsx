import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Plane,
  ShoppingBag,
  Landmark,
  Compass,
  UserCheck,
  Calculator,
  FileText,
  BarChart2,
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FolderClock,
  Bell,
  Users,
  MapPin,
  UtensilsCrossed,
  UserPlus,
  Route as RouteIcon,
  ShieldCheck,
  Gauge,
  ClipboardList,
  KanbanSquare,
  ClipboardCheck,
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
  // =========================================================
  // OVERVIEW
  // =========================================================
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        to: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },

  // =========================================================
  // SALES & QUERIES
  // =========================================================
  {
    label: "Sales & Queries",
    items: [
      {
        label: "Manager Dashboard",
        to: "/manager-dashboard",
        icon: Gauge,
      },
      {
        label: "Query Dashboard",
        to: "/queries/dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "Query Tracker",
        to: "/queries/query-tracker",
        icon: ClipboardList,
      },
      {
        label: "Create Query",
        to: "/new-lead",
        icon: UserPlus,
      },
      {
        label: "Pipeline Board",
        to: "/queries/pipeline-board",
        icon: KanbanSquare,
      },
      {
        label: "Follow-up Desk",
        to: "/queries/follow-up-desk",
        icon: ClipboardCheck,
      },
      {
        label: "Analytics",
        to: "/queries/analytics",
        icon: BarChart2,
      },
    ],
  },

  // =========================================================
  // PRODUCT
  // =========================================================
  {
    label: "Product",
    items: [
      {
        label: "Destinations & Tours",
        to: "/destinations",
        icon: MapPin,
      },
      {
        label: "Entrance Fees",
        to: "/entrances",
        icon: Landmark,
      },
      {
        label: "Routing & Programs",
        to: "/routing-programs",
        icon: RouteIcon,
      },
    ],
  },

  // =========================================================
  // CONTRACTING
  // =========================================================
  {
    label: "Contracting",
    items: [
      {
        label: "Hotels",
        to: "/hotels",
        icon: Building2,
      },
      {
        label: "Restaurants & Meals",
        to: "/meals",
        icon: UtensilsCrossed,
      },
    ],
  },

  // =========================================================
  // VENDOR MANAGEMENT
  // =========================================================
  {
    label: "Vendor Management",
    items: [
      {
        label: "Transport",
        to: "/travels",
        icon: Plane,
      },
      {
        label: "Guides",
        to: "/guide",
        icon: UserCheck,
      },
      {
        label: "Activities & Experiences",
        to: "/activities",
        icon: Compass,
      },
      {
        label: "Other Services",
        to: "/miscellaneous",
        icon: ShoppingBag,
      },
    ],
  },

  // =========================================================
  // PARTNER MANAGEMENT
  // =========================================================
  {
    label: "Partner Management",
    items: [
      {
        label: "Travel Partners",
        to: "/agents",
        icon: Users,
      },
    ],
  },

  // =========================================================
  // QUOTATIONS
  // =========================================================
  {
    label: "Quotations",
    items: [
      {
        label: "New Quotation",
        to: "/costing",
        icon: Calculator,
        badgeKey: "drafts",
      },
      {
        label: "Drafts",
        to: "/drafts",
        icon: FolderClock,
      },
      {
        label: "Saved Quotes",
        to: "/quotes",
        icon: FileText,
      },
    ],
  },

  // =========================================================
  // EXISTING ANALYTICS
  // =========================================================
  {
    label: "Analytics",
    managerOnly: true,
    items: [
      {
        label: "Reports & Insights",
        to: "/reports",
        icon: BarChart2,
        managerOnly: true,
      },
    ],
  },

  // =========================================================
  // SYSTEM
  // =========================================================
  {
    label: "System",
    items: [
      {
        label: "Users & Roles",
        to: "/users-roles",
        icon: ShieldCheck,
      },
      {
        label: "Notifications",
        to: "/notifications",
        icon: Bell,
        badgeKey: "notifications",
      },
      {
        label: "Settings",
        to: "/settings",
        icon: SettingsIcon,
      },
    ],
  },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const brand = useBranding();
  const draftCount = useDraftCount();
  const unread = useUnreadCount();
  const isManager = useIsManager();

  const badgeFor = (key?: Item["badgeKey"]) => {
    if (key === "drafts") {
      return draftCount;
    }

    if (key === "notifications") {
      return unread;
    }

    return 0;
  };

  return (
    <aside
      className={cn(
        // Fixed viewport sidebar
        "sticky top-0 z-40 h-screen min-h-0 shrink-0",

        // Sidebar layout
        "bg-sidebar text-sidebar-foreground",
        "border-r border-sidebar-border",
        "flex flex-col",

        // Width transition
        "transition-[width] duration-200",

        // Print
        "print:hidden",

        // Width
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* =====================================================
          BRAND
      ===================================================== */}
      <div
        className={cn(
          "h-16 shrink-0",
          "flex items-center gap-3",
          "px-4",
          "border-b border-sidebar-border",
          collapsed && "justify-center px-2",
        )}
      >
        {brand.logo ? (
          <img
            src={brand.logo}
            alt="logo"
            className="h-9 w-9 rounded-lg object-contain bg-white/95 p-0.5 shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-lg border-2 border-accent flex items-center justify-center shrink-0">
            <span className="text-accent font-bold text-sm">
              MP
            </span>
          </div>
        )}

        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">
              {brand.companyName || "MP Tourism"}
            </div>

            <div className="text-[11px] text-sidebar-foreground/60 leading-tight truncate">
              {brand.tagline || "Operations Hub"}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          NAVIGATION
          Sidebar fixed.
          Only navigation area scrolls.
          Scrollbar completely hidden.
      ===================================================== */}
      <nav
        className={cn(
          "flex-1 min-h-0",
          "px-2 py-3",

          // Internal sidebar scrolling
          "overflow-y-auto overflow-x-hidden",

          // Prevent scroll from propagating to main page
          "overscroll-contain",

          // Hide scrollbar
          "[scrollbar-width:none]",
          "[-ms-overflow-style:none]",
          "[&::-webkit-scrollbar]:hidden",
        )}
      >
        {SECTIONS.filter(
          (section) =>
            !section.managerOnly || isManager,
        ).map((section) => {
          const items = section.items.filter(
            (item) =>
              !item.managerOnly || isManager,
          );

          if (!items.length) {
            return null;
          }

          return (
            <div
              key={section.label}
              className="mb-3"
            >
              {/* SECTION TITLE */}
              {!collapsed && (
                <div
                  className={cn(
                    "px-3 pb-1 pt-2",
                    "text-[10px] font-semibold uppercase tracking-wider",
                    "text-accent/80",

                    section.label ===
                      "Sales & Queries" &&
                      "text-accent",
                  )}
                >
                  {section.label}
                </div>
              )}

              {/* MENU ITEMS */}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;

                  const active =
                    Boolean(item.to) &&
                    (pathname === item.to ||
                      pathname.startsWith(
                        `${item.to}/`,
                      ));

                  const badge = badgeFor(
                    item.badgeKey,
                  );

                  const content = (
                    <>
                      {/* Active indicator */}
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />
                      )}

                      {/* Icon */}
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0",
                          active
                            ? "text-accent"
                            : "text-sidebar-foreground/70",
                        )}
                      />

                      {/* Label */}
                      {!collapsed && (
                        <span className="truncate flex-1">
                          {item.label}
                        </span>
                      )}

                      {/* Badge */}
                      {badge > 0 && (
                        <span
                          className={cn(
                            "ml-auto rounded-full",
                            "bg-accent text-accent-foreground",
                            "text-[10px] font-semibold",
                            "flex items-center justify-center",

                            collapsed
                              ? "absolute top-1 right-1 h-4 min-w-4 px-1"
                              : "h-4 min-w-4 px-1.5",
                          )}
                        >
                          {badge > 99
                            ? "99+"
                            : badge}
                        </span>
                      )}
                    </>
                  );

                  const base = cn(
                    "relative flex items-center gap-3",
                    "px-3 py-2 rounded-md",
                    "text-sm font-medium",
                    "transition-colors",

                    collapsed &&
                      "justify-center px-2",

                    active
                      ? "bg-sidebar-accent/60 text-accent"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",

                    item.disabled &&
                      "opacity-40 cursor-not-allowed",
                  );

                  // Disabled / non-link
                  if (
                    item.disabled ||
                    !item.to
                  ) {
                    return (
                      <div
                        key={item.label}
                        className={base}
                        title={
                          collapsed
                            ? item.label
                            : undefined
                        }
                      >
                        {content}
                      </div>
                    );
                  }

                  // Navigation link
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      className={base}
                      title={
                        collapsed
                          ? item.label
                          : undefined
                      }
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* =====================================================
          FOOTER
          Always visible
      ===================================================== */}
      <div
        className={cn(
          "shrink-0",
          "p-2",
          "border-t border-sidebar-border",
          "space-y-1",
          "bg-sidebar",
        )}
      >
        {/* LOGOUT */}
        <button
          onClick={() => auth.signOut()}
          className={cn(
            "w-full flex items-center gap-3",
            "px-3 py-2 rounded-md",
            "text-sm font-medium",
            "text-sidebar-foreground/80",
            "hover:bg-sidebar-accent",
            "hover:text-sidebar-accent-foreground",
            "transition-colors",
            collapsed &&
              "justify-center px-2",
          )}
          title={
            collapsed ? "Logout" : undefined
          }
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />

          {!collapsed && (
            <span>Logout</span>
          )}
        </button>

        {/* COLLAPSE / EXPAND */}
        <button
          onClick={() =>
            setCollapsed(
              (current) => !current,
            )
          }
          className={cn(
            "w-full flex items-center gap-3",
            "px-3 py-2 rounded-md",
            "text-sm",
            "text-sidebar-foreground/60",
            "hover:bg-sidebar-accent",
            "hover:text-sidebar-accent-foreground",
            "transition-colors",
            collapsed &&
              "justify-center px-2",
          )}
          title={
            collapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
          )}

          {!collapsed && (
            <span>Collapse</span>
          )}
        </button>
      </div>
    </aside>
  );
}