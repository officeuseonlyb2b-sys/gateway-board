import { useAuth, type AuthUser } from "@/lib/auth-mock";
import { listEmployees, useCrmQueries, useEmployees } from "./store";
import type { AppRole, DataScope, Department, Employee } from "./types";

export interface AccessProfile {
  employee?: Employee;
  role: AppRole | "";
  department: Department;
  dataScope: DataScope;
  unit: string;
  canAssign: boolean;
  canManageTeam: boolean;
  permissions: string[];
  accountReady: boolean;
}

export const isSalesRole = (role: AppRole | "" | null) =>
  [
    "Sales Executive",
    "Senior Sales Executive",
    "Assistant Manager",
    "Sales Manager",
    "Sales Head",
  ].includes(role || "");
export const isSeniorSalesRole = (role: AppRole | "" | null) => role === "Senior Sales Executive";
export const isSalesManagerRole = (role: AppRole | "" | null) =>
  ["Assistant Manager", "Sales Manager", "Sales Head"].includes(role || "");

/** Sales records created before role casing was standardised still resolve safely. */
export function normalizeRole(role?: string | null): AppRole | "" {
  const normalized = role?.trim().toLocaleLowerCase();
  if (normalized === "sales manager") return "Sales Manager";
  if (normalized === "senior sales executive") return "Senior Sales Executive";
  if (normalized === "sales executive") return "Sales Executive";
  if (normalized === "super admin") return "Super Admin";
  return (role?.trim() as AppRole | undefined) || "";
}

export function employeeForAuthUser(employees: Employee[], user?: AuthUser | null) {
  if (!user) return undefined;
  const matches = employees.filter((employee) => employee.auth_user_id === user.id);
  return matches.length === 1 ? matches[0] : undefined;
}

export function employeeAccountActive(employee?: Employee) {
  return Boolean(
    employee?.auth_user_id &&
    employee.active === true &&
    employee.employee_status !== "Exited" &&
    employee.account_status === "Active",
  );
}

export function canAccessPath(profile: AccessProfile, pathname: string) {
  if (!profile.accountReady) return false;
  if (profile.role === "Super Admin") return true;
  const path = pathname.replace(/\/$/, "");
  const common = [
    "/employee-home",
    "/profile",
    "/help",
    "/notifications",
    "/my-tasks",
    "/tasks/calendar",
    "/agents",
    "/clients",
    "/costing",
    "/drafts",
    "/quotes",
    "/routing-programs",
    "/destinations",
    "/new-lead",
    "/queries/query-tracker",
    "/queries/pipeline-board",
    "/queries/follow-up-desk",
    "/queries/my-sales-desk",
    "/queries/dashboard",
    "/queries/performance",
    "/queries/analytics",
  ];
  if (common.includes(path)) return true;
  if (profile.role === "Sales Manager")
    return [
      "/queries/assignment-desk",
      "/queries/sales-control-tower",
      "/queries/executive-workload",
      "/sales-team",
    ].includes(path);
  if (profile.role === "Senior Sales Executive")
    return ["/queries/review", "/queries/quotation-review", "/queries/assisted"].includes(path);
  return /^\/queries\/[^/]+$/.test(path);
}

export function isSalesAssignmentEligible(employee: Employee) {
  return (
    employeeAccountActive(employee) &&
    employee.role !== "Employee" &&
    (employee.department === "Sales" ||
      employee.role === "Owner / Director" ||
      employee.permissions?.includes("query.assignment.receive") ||
      employee.permission_grants?.includes("query.assignment.receive"))
  );
}

export function dashboardPathForUser(user?: AuthUser | null) {
  const employee = employeeForAuthUser(listEmployees(), user);
  if (!employeeAccountActive(employee)) return "/employee-home" as const;
  if (employee?.role === "Super Admin") return "/admin-console" as const;
  if (employee?.role === "Sales Manager") return "/queries/sales-control-tower" as const;
  if (employee?.role === "Senior Sales Executive" || employee?.role === "Sales Executive")
    return "/queries/my-sales-desk" as const;
  return "/employee-home" as const;
}

export function useAccessProfile(): AccessProfile {
  const user = useAuth();
  const employee = employeeForAuthUser(useEmployees(), user);
  const accountReady = employeeAccountActive(employee);
  const role = accountReady ? normalizeRole(employee!.role) : "";
  const superAdmin = role === "Super Admin";
  return {
    employee,
    role,
    accountReady,
    department: employee?.department || "Unassigned",
    dataScope: employee?.data_scope || "Own",
    unit: employee?.unit || "",
    canAssign: superAdmin || role === "Sales Manager",
    canManageTeam: superAdmin || role === "Sales Manager",
    // Department grants are dormant until the next phase.
    permissions: superAdmin
      ? [
          "query.create",
          "query.read",
          "query.work",
          "query.assign",
          "quotation.create",
          "quotation.send",
          "task.manage",
          "performance.read",
          "employee.manage",
        ]
      : [],
  };
}

export function useAccessibleQueries() {
  const queries = useCrmQueries();
  const profile = useAccessProfile();
  const employees = useEmployees();
  if (!profile.accountReady || !profile.employee) return [];
  if (profile.role === "Super Admin") return queries;
  const employee = profile.employee;
  const own = (query: (typeof queries)[number]) =>
    [query.owner, query.created_by, query.last_updated_by].includes(employee.id) ||
    [query.owner, query.created_by, query.last_updated_by].includes(employee.name) ||
    Boolean(
      query.shared_with_employee_ids?.includes(employee.id) ||
      query.reviewer_employee_ids?.includes(employee.id) ||
      query.assistance_employee_ids?.includes(employee.id),
    );
  if (profile.role !== "Sales Manager") return queries.filter(own);
  const team = new Set(
    employees
      .filter((candidate) => candidate.department === "Sales" && candidate.unit === employee.unit)
      .flatMap((candidate) => [candidate.id, candidate.name]),
  );
  return queries.filter((query) => own(query) || !query.owner || team.has(query.owner));
}
