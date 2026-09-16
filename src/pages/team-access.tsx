import { Link } from "@tanstack/react-router";
import { Building2, LayoutDashboard, Network, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrmEvents, useCrmTasks, useEmployees } from "@/lib/crm/store";
import { useAccessibleQueries } from "@/lib/crm/access";

export default function TeamAccess() {
  const employees = useEmployees();
  const queries = useAccessibleQueries();
  const tasks = useCrmTasks();
  const events = useCrmEvents();
  const active = employees.filter((e) => e.active !== false && e.employee_status !== "Exited");
  const departments = Array.from(new Set(employees.map((e) => e.department || "Sales")));
  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-teal-700">
            Organisation structure · access · dashboard mapping
          </p>
          <h1 className="text-3xl font-bold">Team & Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Department, designation and system role stay separate; operational ownership remains
            auditable.
          </p>
        </div>
        <Button asChild>
          <Link to="/users-roles">Manage Employees & Roles</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Employees", employees.length, Users],
          [
            "Active accounts",
            active.filter((e) => e.account_status !== "Disabled").length,
            UserCheck,
          ],
          ["Departments", departments.length, Building2],
          [
            "Access events",
            events.filter((e) =>
              ["lead_assigned", "lead_reassigned", "task_assigned", "task_reassigned"].includes(
                e.type,
              ),
            ).length,
            ShieldCheck,
          ],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-bold">{value}</p>
              </div>
              <Icon className="h-6 w-6 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Employee Directory & Effective Access</CardTitle>
          <p className="text-sm text-slate-500">
            Permanent employee identity, reporting line, scope and landing dashboard.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Employee</th>
                  <th>Department / designation</th>
                  <th>System role</th>
                  <th>Reports to</th>
                  <th>Data scope</th>
                  <th>Dashboard</th>
                  <th>Operational load</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const manager = employees.find((e) => e.id === employee.manager_id);
                  const owned = queries.filter(
                    (q) => q.owner === employee.name && !["Won", "Lost"].includes(q.stage),
                  ).length;
                  const openTasks = tasks.filter(
                    (t) => t.owner === employee.name && !t.done,
                  ).length;
                  return (
                    <tr key={employee.id} className="border-b">
                      <td className="p-3">
                        <p className="font-semibold">{employee.name}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {employee.employee_code || employee.id}
                        </p>
                      </td>
                      <td>
                        <p>{employee.department || "Sales"}</p>
                        <p className="text-xs text-slate-500">
                          {employee.designation || employee.role}
                        </p>
                      </td>
                      <td>{employee.role}</td>
                      <td>{manager?.name || "Organisation head"}</td>
                      <td>
                        <Badge variant="outline">{employee.data_scope || "Own"}</Badge>
                        <p className="mt-1 text-xs text-slate-500">
                          {employee.unit || "Madhya Pradesh"}
                        </p>
                      </td>
                      <td>
                        <Badge className="bg-teal-700">
                          <LayoutDashboard className="mr-1 h-3 w-3" />
                          {employee.dashboard_template ||
                            ([
                              "Sales Manager",
                              "Sales Head",
                              "Unit Head",
                              "Administrator",
                              "Owner / Director",
                            ].includes(employee.role)
                              ? "Sales Control Tower"
                              : "My Sales Desk")}
                        </Badge>
                      </td>
                      <td>
                        {owned} Queries · {openTasks} tasks
                      </td>
                      <td>
                        <Badge variant={employee.active !== false ? "default" : "secondary"}>
                          {employee.employee_status ||
                            (employee.active !== false ? "Active" : "Inactive")}
                        </Badge>
                        <p className="mt-1 text-xs text-slate-500">
                          Account {employee.account_status || "Active"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
                {!employees.length && (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-500">
                      No employees configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <Network className="mr-2 inline h-5 w-5" />
              Reporting Hierarchy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {employees
              .filter((e) => !e.manager_id)
              .map((head) => (
                <div key={head.id} className="rounded-xl border p-4">
                  <p className="font-bold">{head.name}</p>
                  <p className="text-xs text-slate-500">{head.designation || head.role}</p>
                  <div className="mt-3 space-y-2 border-l-2 border-teal-200 pl-3">
                    {employees
                      .filter((e) => e.manager_id === head.id)
                      .map((report) => (
                        <div key={report.id}>
                          <p className="text-sm font-semibold">{report.name}</p>
                          <p className="text-xs text-slate-500">
                            {report.designation || report.role}
                          </p>
                        </div>
                      ))}
                    {!employees.some((e) => e.manager_id === head.id) && (
                      <p className="text-xs text-slate-400">No direct reports mapped</p>
                    )}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Effective Permission Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border p-3">
              <strong>Sales Executive</strong>
              <p className="text-slate-500">
                Create Query · work own Queries · own tasks · own performance
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <strong>Sales Manager / Head</strong>
              <p className="text-slate-500">
                Unit Queries · assignment · team tasks · performance · interventions
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <strong>Operations Executive</strong>
              <p className="text-slate-500">Won Query intake · Operations handoff acceptance</p>
            </div>
            <p className="text-xs text-slate-500">
              Individual grants and restrictions can be stored on each employee and layered over
              role defaults.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access Audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events
              .filter((e) =>
                ["lead_assigned", "lead_reassigned", "task_assigned", "task_reassigned"].includes(
                  e.type,
                ),
              )
              .slice(0, 8)
              .map((event) => (
                <div key={event.id} className="border-b pb-2">
                  <p className="text-sm font-semibold">{event.title}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(event.at).toLocaleString("en-GB")} · {event.by}
                  </p>
                </div>
              ))}
            {!events.length && (
              <p className="text-sm text-slate-500">No access-related audit events yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
