import type { CrmQuery, CrmTask, Employee } from "./types";

export type WorkloadLevel = "Light" | "Balanced" | "Busy" | "Overloaded";
export interface EmployeeWorkload {
  employee: Employee;
  openQueries: number;
  priorityQueries: number;
  followupsDueToday: number;
  overdueFollowups: number;
  openTasks: number;
  tasksDueToday: number;
  overdueTasks: number;
  draftQuotations: number;
  queryReviews: number;
  quotationReviews: number;
  assistanceAssignments: number;
  upcomingTravel: number;
  won: number;
  lost: number;
  score: number;
  level: WorkloadLevel;
}
const closed = (query: CrmQuery) => ["Won", "Lost"].includes(query.stage);
const sameDay = (value: string | undefined, day: Date) =>
  Boolean(value && new Date(value).toDateString() === day.toDateString());

/** Shared real-data calculation used by workload and team views. */
export function getEmployeeWorkloads(
  employees: Employee[],
  queries: CrmQuery[],
  tasks: CrmTask[],
  now = new Date(),
): EmployeeWorkload[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  return employees
    .filter(
      (employee) =>
        employee.department === "Sales" &&
        employee.active !== false &&
        employee.account_status !== "Disabled" &&
        ["Sales Manager", "Senior Sales Executive", "Sales Executive"].includes(employee.role),
    )
    .map((employee) => {
      const mine = queries.filter(
        (query) => query.owner === employee.name || query.owner === employee.id,
      );
      const open = mine.filter((query) => !closed(query));
      const employeeTasks = tasks.filter(
        (task) => task.owner === employee.name || task.owner === employee.id,
      );
      const openTasks = employeeTasks.filter((task) => !task.done);
      const result = {
        employee,
        openQueries: open.length,
        priorityQueries: open.filter((query) => ["High", "Urgent"].includes(query.priority)).length,
        followupsDueToday: open.filter((query) => sameDay(query.followup_due, today)).length,
        overdueFollowups: open.filter(
          (query) => query.followup_due && new Date(query.followup_due).getTime() < today.getTime(),
        ).length,
        openTasks: openTasks.length,
        tasksDueToday: openTasks.filter((task) => sameDay(task.due_at, today)).length,
        overdueTasks: openTasks.filter((task) => new Date(task.due_at).getTime() < today.getTime())
          .length,
        draftQuotations: open.filter((query) => query.stage === "Costing").length,
        queryReviews: queries.filter((query) => query.reviewer_employee_ids?.includes(employee.id))
          .length,
        quotationReviews: queries.filter(
          (query) =>
            query.reviewer_employee_ids?.includes(employee.id) &&
            Boolean(query.costing_versions?.length),
        ).length,
        assistanceAssignments: queries.filter((query) =>
          query.assistance_employee_ids?.includes(employee.id),
        ).length,
        upcomingTravel: open.filter((query) => {
          const travel = new Date(query.travel_start).getTime();
          return travel >= today.getTime() && travel <= weekAhead.getTime();
        }).length,
        won: mine.filter((query) => query.stage === "Won").length,
        lost: mine.filter((query) => query.stage === "Lost").length,
      };
      const score =
        result.openQueries * 4 +
        result.priorityQueries * 4 +
        result.overdueFollowups * 8 +
        result.openTasks * 2 +
        result.overdueTasks * 7 +
        (result.queryReviews + result.quotationReviews + result.assistanceAssignments) * 3 +
        result.upcomingTravel * 2;
      const level: WorkloadLevel =
        score >= 45 ? "Overloaded" : score >= 28 ? "Busy" : score >= 12 ? "Balanced" : "Light";
      return { ...result, score, level };
    })
    .sort((a, b) => b.score - a.score || a.employee.name.localeCompare(b.employee.name));
}
