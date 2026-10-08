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
  CalendarCheck2,
  Handshake,
  Boxes,
  TrendingUp,
  Database,
  BriefcaseBusiness,
  RadioTower,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth-mock";
import { useBranding } from "@/lib/branding";
import { useDraftCount } from "@/lib/drafts-store";
import { useUnreadCount } from "@/lib/notifications-store";
import { useAccessProfile } from "@/lib/crm/access";
import type { AppRole } from "@/lib/crm/types";

interface Item {
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
  badgeKey?: "drafts" | "notifications";
  /** A second contextual entry may intentionally open an existing shared page. */
  allowDuplicatePath?: boolean;
  managerOnly?: boolean;
  roles?: AppRole[];
}

interface Section {
  label: string;
  items: Item[];
  managerOnly?: boolean;
  roles?: AppRole[];
}

const SALES_ROLES: AppRole[] = [
  "Sales Executive",
  "Senior Sales Executive",
  "Assistant Manager",
  "Sales Manager",
  "Sales Head",
  "Unit Head",
  "Administrator",
  "Owner / Director",
];
const MANAGEMENT_ROLES: AppRole[] = [
  "Assistant Manager",
  "Sales Manager",
  "Sales Head",
  "Unit Head",
  "Administrator",
  "Owner / Director",
];
const MASTER_ROLES: AppRole[] = ["Unit Head", "Administrator", "Owner / Director"];

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
    roles: SALES_ROLES,
    items: [
      {
        label: "My Sales Desk",
        to: "/queries/my-sales-desk",
        icon: BriefcaseBusiness,
      },
      {
        label: "Sales Control Tower",
        to: "/queries/sales-control-tower",
        icon: RadioTower,
        roles: MANAGEMENT_ROLES,
      },
      {
        label: "Assignment Desk",
        to: "/queries/assignment-desk",
        icon: Gauge,
        roles: ["Sales Manager", "Sales Head", "Unit Head", "Administrator", "Owner / Director"],
      },
      {
        label: "Query Health Dashboard",
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
        label: "Program Intelligence",
        to: "/routing-programs",
        icon: RouteIcon,
      },
      {
        label: "Follow-up Desk",
        to: "/queries/follow-up-desk",
        icon: ClipboardCheck,
      },
      {
        label: "My Day",
        to: "/my-tasks",
        icon: CalendarCheck2,
      },
      {
        label: "Analytics",
        to: "/queries/analytics",
        icon: BarChart2,
        roles: MANAGEMENT_ROLES,
      },
      {
        label: "Performance Review",
        to: "/queries/performance",
        icon: TrendingUp,
        roles: SALES_ROLES,
      },
      {
        label: "Data Readiness",
        to: "/data-readiness",
        icon: Database,
        roles: MANAGEMENT_ROLES,
      },
    ],
  },

  // =========================================================
  // PRODUCT
  // =========================================================
  {
    label: "Product",
    roles: ["Product Executive", ...MASTER_ROLES],
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
    roles: ["Contracting Executive", ...MASTER_ROLES],
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
    roles: ["Vendor Executive", ...MASTER_ROLES],
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
    roles: SALES_ROLES,
    items: [
      {
        label: "B2B Agents",
        to: "/agents",
        icon: Users,
      },
      { label: "B2C Clients", to: "/clients", icon: Handshake },
    ],
  },

  // =========================================================
  // QUOTATIONS
  // =========================================================
  {
    label: "Quotations",
    roles: SALES_ROLES,
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
        label: "Recent Quotes",
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
    roles: MANAGEMENT_ROLES,
    items: [
      {
        label: "Reports & Insights",
        to: "/reports",
        icon: BarChart2,
        managerOnly: true,
      },
    ],
  },

  {
    label: "Operations Handoff",
    roles: ["Operations Executive", ...MANAGEMENT_ROLES],
    items: [
      {
        label: "Won Query Intake",
        to: "/operations-handoffs",
        icon: Boxes,
        roles: ["Operations Executive", ...MANAGEMENT_ROLES],
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
        label: "Employees & Login Access",
        to: "/team-access",
        icon: ShieldCheck,
        roles: ["Administrator", "Owner / Director"],
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
        roles: ["Administrator", "Owner / Director"],
      },
    ],
  },
];

const relationshipSection: Section = {
  label: "Relationships",
  items: [
    { label: "B2B Agent Master", to: "/agents", icon: Users },
    { label: "B2C Client Master", to: "/clients", icon: Handshake },
  ],
};

const quotationSection: Section = {
  label: "Quotations",
  items: [
    { label: "New Quotation", to: "/costing", icon: Calculator },
    { label: "Draft Quotations", to: "/drafts", icon: FolderClock, badgeKey: "drafts" },
    { label: "Recent Quotations", to: "/quotes", icon: FileText },
  ],
};

const resourcesSection: Section = {
  label: "Sales Resources",
  items: [
    { label: "Programmes & Routings", to: "/routing-programs", icon: RouteIcon },
    { label: "Destination & Tour Library", to: "/destinations", icon: MapPin },
  ],
};

const personalSection: Section = {
  label: "Personal",
  items: [
    { label: "Notifications", to: "/notifications", icon: Bell, badgeKey: "notifications" },
    { label: "My Profile", to: "/profile", icon: UserCheck },
    { label: "Help & Training", to: "/help", icon: Compass },
  ],
};

function salesSections(role: AppRole): Section[] | null {
  const manager = ["Assistant Manager", "Sales Manager", "Sales Head"].includes(role);
  const senior = role === "Senior Sales Executive";
  const executive = role === "Sales Executive";
  if (!manager && !senior && !executive) return null;

  if (manager) {
    return [
      {
        label: "Overview",
        items: [
          { label: "My Day", to: "/my-tasks", icon: CalendarCheck2 },
          { label: "My Sales Desk", to: "/queries/my-sales-desk", icon: BriefcaseBusiness },
          { label: "Sales Control Tower", to: "/queries/sales-control-tower", icon: RadioTower },
          { label: "Query Health Dashboard", to: "/queries/dashboard", icon: LayoutDashboard },
        ],
      },
      {
        label: "Sales & Queries",
        items: [
          { label: "Assignment Desk", to: "/queries/assignment-desk", icon: Gauge },
          { label: "Query Tracker", to: "/queries/query-tracker", icon: ClipboardList },
          { label: "Pipeline Board", to: "/queries/pipeline-board", icon: KanbanSquare },
          { label: "Follow-up Desk", to: "/queries/follow-up-desk", icon: ClipboardCheck },
          { label: "Tasks & Calendar", to: "/tasks/calendar", icon: CalendarCheck2 },
        ],
      },
      relationshipSection,
      quotationSection,
      resourcesSection,
      {
        label: "Analytics & Performance",
        items: [
          { label: "Query Analytics", to: "/queries/analytics", icon: BarChart2 },
          { label: "Sales Performance", to: "/queries/performance", icon: TrendingUp },
          { label: "Executive Workload", to: "/queries/executive-workload", icon: Users },
        ],
      },
      { label: "Team", items: [{ label: "Sales Team", to: "/sales-team", icon: Users }] },
      personalSection,
    ];
  }

  const sections: Section[] = [
    {
      label: "Overview",
      items: [
        { label: "My Day", to: "/my-tasks", icon: CalendarCheck2 },
        { label: "My Sales Desk", to: "/queries/my-sales-desk", icon: BriefcaseBusiness },
        { label: "My Query Health", to: "/queries/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "My Sales & Queries",
      items: [
        { label: "Query Tracker", to: "/queries/query-tracker", icon: ClipboardList },
        { label: "My Pipeline", to: "/queries/pipeline-board", icon: KanbanSquare },
        { label: "Follow-up Desk", to: "/queries/follow-up-desk", icon: ClipboardCheck },
        { label: "Tasks & Calendar", to: "/tasks/calendar", icon: CalendarCheck2 },
      ],
    },
  ];
  if (senior) {
    sections.push({
      label: "Review & Support",
      items: [
        { label: "Queries for Review", to: "/queries/review", icon: ClipboardCheck },
        { label: "Quotations for Review", to: "/queries/quotation-review", icon: FileText },
        { label: "Assisted Queries", to: "/queries/assisted", icon: Handshake },
      ],
    });
  }
  sections.push(
    relationshipSection,
    quotationSection,
    resourcesSection,
    {
      label: "My Performance",
      items: [
        { label: "My Query Analytics", to: "/queries/analytics", icon: BarChart2 },
        { label: "My Sales Performance", to: "/queries/performance", icon: TrendingUp },
        ...(senior
          ? [
              {
                label: "Support Contribution",
                to: "/queries/performance",
                icon: Handshake,
                allowDuplicatePath: true,
              },
            ]
          : []),
      ],
    },
    personalSection,
  );
  return sections;
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCollapsed(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const brand = useBranding();
  const draftCount = useDraftCount();
  const unread = useUnreadCount();
  const { role: currentRole, canManageTeam: isManager } = useAccessProfile();
  const employeeSections: Section[] = [
    {
      label: "Personal",
      items: [
        { label: "Home", to: "/employee-home", icon: LayoutDashboard },
        ...personalSection.items.filter((item) => item.to !== "/notifications"),
      ],
    },
  ];
  const roleSections =
    currentRole === "Super Admin"
      ? [
          {
            label: "Administration",
            items: [{ label: "Admin Console", to: "/admin-console", icon: LayoutDashboard }],
          },
          ...SECTIONS,
          {
            label: "Additional Workspaces",
            items: [
              ...(salesSections("Sales Manager") || []),
              ...(salesSections("Senior Sales Executive") || []),
            ]
              .flatMap((section) => section.items)
              .filter(
                (item, index, all) =>
                  item.to &&
                  !SECTIONS.some((section) =>
                    section.items.some((existing) => existing.to === item.to),
                  ) &&
                  !personalSection.items.some((personal) => personal.to === item.to) &&
                  all.findIndex((other) => other.to === item.to) === index,
              ),
          },
          {
            label: "Personal",
            items: personalSection.items.filter((item) => item.to !== "/notifications"),
          },
        ]
      : salesSections(currentRole as AppRole) || employeeSections;

  const seenPaths = new Set<string>();
  const uniqueSections = roleSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.to || item.disabled || (seenPaths.has(item.to) && !item.allowDuplicatePath))
        return false;
      seenPaths.add(item.to);
      return true;
    }),
  }));

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
            <span className="text-accent font-bold text-sm">MP</span>
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
        {uniqueSections
          .filter(
            (section) =>
              currentRole === "Super Admin" ||
              ((!section.managerOnly || isManager) &&
                (!section.roles || section.roles.includes(currentRole as AppRole))),
          )
          .map((section) => {
            const items = section.items.filter(
              (item) =>
                currentRole === "Super Admin" ||
                ((!item.managerOnly || isManager) &&
                  (!item.roles || item.roles.includes(currentRole as AppRole))),
            );

            if (!items.length) {
              return null;
            }

            return (
              <div key={section.label} className="mb-3">
                {/* SECTION TITLE */}
                {!collapsed && (
                  <div
                    className={cn(
                      "px-3 pb-1 pt-2",
                      "text-[10px] font-semibold uppercase tracking-wider",
                      "text-accent/80",

                      section.label === "Sales & Queries" && "text-accent",
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
                      (pathname === item.to || pathname.startsWith(`${item.to}/`));

                    const badge = badgeFor(item.badgeKey);

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
                            active ? "text-accent" : "text-sidebar-foreground/70",
                          )}
                        />

                        {/* Label */}
                        {!collapsed && <span className="truncate flex-1">{item.label}</span>}

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
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </>
                    );

                    const base = cn(
                      "relative flex items-center gap-3",
                      "px-3 py-2 rounded-md",
                      "text-sm font-medium",
                      "transition-colors",

                      collapsed && "justify-center px-2",

                      active
                        ? "bg-sidebar-accent/60 text-accent"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",

                      item.disabled && "opacity-40 cursor-not-allowed",
                    );

                    // Disabled / non-link
                    if (item.disabled || !item.to) {
                      return (
                        <div
                          key={item.label}
                          className={base}
                          title={collapsed ? item.label : undefined}
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
                        title={collapsed ? item.label : undefined}
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
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />

          {!collapsed && <span>Logout</span>}
        </button>

        {/* COLLAPSE / EXPAND */}
        <button
          onClick={() => setCollapsed((current) => !current)}
          className={cn(
            "w-full flex items-center gap-3",
            "px-3 py-2 rounded-md",
            "text-sm",
            "text-sidebar-foreground/60",
            "hover:bg-sidebar-accent",
            "hover:text-sidebar-accent-foreground",
            "transition-colors",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
          )}

          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
