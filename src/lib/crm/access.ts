import { useMemo } from "react";
import { useAuth } from "@/lib/auth-mock";
import { listEmployees, useCrmQueries, useEmployees } from "./store";
import type { AppRole, DataScope, Department, Employee } from "./types";

export interface AccessProfile {
  employee?: Employee;
  role: AppRole;
  department: Department;
  dataScope: DataScope;
  unit: string;
  canAssign: boolean;
  canManageTeam: boolean;
  permissions: string[];
}

export function isSalesAssignmentEligible(employee: Employee) {
  return (
    employee.active !== false &&
    (employee.department === "Sales" ||
      employee.role === "Owner / Director" ||
      employee.permissions?.includes("query.assignment.receive") ||
      employee.permission_grants?.includes("query.assignment.receive"))
  );
}

export function dashboardPathForEmail(email?: string) {
  const employee = email
    ? listEmployees().find((item) => item.email.toLowerCase() === email.toLowerCase())
    : undefined;
  const template = employee?.dashboard_template;
  if (template === "Sales Control Tower") return "/queries/sales-control-tower" as const;
  if (template === "Operations Desk") return "/operations-handoffs" as const;
  if (template === "Admin Console") return "/team-access" as const;
  if (employee?.department === "Sales" || !employee) return "/queries/my-sales-desk" as const;
  return "/dashboard" as const;
}

export function useAccessProfile(): AccessProfile {
  const user = useAuth();
  const employees = useEmployees();
  const employee = employees.find(
    (item) =>
      item.email.toLowerCase() === user?.email.toLowerCase() ||
      (item.login_email_pending && item.name.toLowerCase() === user?.name?.toLowerCase()),
  );
  const role: AppRole =
    employee?.role || (user?.role === "admin" ? "Administrator" : "Sales Executive");
  const managementRoles: AppRole[] = [
    "Assistant Manager",
    "Sales Manager",
    "Sales Head",
    "Unit Head",
    "Administrator",
    "Owner / Director",
  ];
  return {
    employee,
    role,
    department: employee?.department || (role === "Operations Executive" ? "Operations" : "Sales"),
    dataScope: employee?.data_scope || (managementRoles.includes(role) ? "Unit" : "Own"),
    unit: employee?.unit || "Madhya Pradesh",
    canAssign:
      employee?.permissions?.includes("query.assign") ||
      ["Sales Manager", "Sales Head", "Unit Head", "Administrator", "Owner / Director"].includes(
        role,
      ),
    canManageTeam: managementRoles.includes(role),
    permissions: employee?.permissions?.length
      ? employee.permissions
      : managementRoles.includes(role)
        ? ["query.read", "query.work", "query.assign", "task.manage", "performance.read"]
        : ["query.create", "query.read.own", "query.work.own", "task.work.own"],
  };
}

export function useAccessibleQueries() {
  const queries = useCrmQueries();
  const employees = useEmployees();
  const profile = useAccessProfile();
  return useMemo(() => {
    if (!profile.employee || ["Administrator", "Owner / Director"].includes(profile.role))
      return queries;
    if (profile.dataScope === "Organisation" || profile.dataScope === "Custom") return queries;
    if (profile.dataScope === "Unit")
      return queries.filter((query) => (query.primary_unit || "Madhya Pradesh") === profile.unit);
    if (profile.dataScope === "Department") {
      const names = new Set(
        employees
          .filter((employee) => employee.department === profile.department)
          .map((employee) => employee.name),
      );
      return queries.filter(
        (query) => names.has(query.owner) || query.created_by === profile.employee?.name,
      );
    }
    if (profile.dataScope === "Team") {
      const names = new Set([
        profile.employee.name,
        ...employees
          .filter((employee) => employee.manager_id === profile.employee?.id)
          .map((employee) => employee.name),
      ]);
      return queries.filter(
        (query) => names.has(query.owner) || query.created_by === profile.employee?.name,
      );
    }
    return queries.filter(
      (query) =>
        query.owner === profile.employee?.name || query.created_by === profile.employee?.name,
    );
  }, [queries, employees, profile]);
}
