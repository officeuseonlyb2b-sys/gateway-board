import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessibleQueries } from "@/lib/crm/access";
import { useCrmTasks, useEmployees } from "@/lib/crm/store";
import { getEmployeeWorkloads } from "@/lib/crm/workload";

export default function SalesTeam() {
  const queries = useAccessibleQueries();
  const tasks = useCrmTasks();
  const rows = getEmployeeWorkloads(useEmployees(), queries, tasks);
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-teal-700">Madhya Pradesh Unit</p>
        <h1 className="text-3xl font-bold">Sales Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Read-only team directory and current operating load. Access administration remains with
          Owner / Administrator.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Team directory</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-y bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Employee</th>
                <th>Role</th>
                <th>Designation</th>
                <th>Open Queries</th>
                <th>Overdue Follow-ups</th>
                <th>Open Tasks</th>
                <th>Workload</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, openQueries, overdueFollowups, openTasks, level }) => {
                return (
                  <tr key={employee.id} className="border-b">
                    <td className="p-3">
                      <p className="font-semibold">{employee.name}</p>
                      <p className="text-xs text-slate-500">{employee.email}</p>
                    </td>
                    <td>{employee.role}</td>
                    <td>{employee.designation || employee.role}</td>
                    <td>
                      <Link
                        to="/queries/query-tracker"
                        className="font-semibold text-teal-700 hover:underline"
                      >
                        {openQueries}
                      </Link>
                    </td>
                    <td className={overdueFollowups ? "font-bold text-red-600" : ""}>
                      {overdueFollowups}
                    </td>
                    <td>{openTasks}</td>
                    <td>
                      <Badge variant={level === "Overloaded" ? "destructive" : "secondary"}>
                        {level}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant={employee.account_status === "Active" ? "default" : "secondary"}
                      >
                        {employee.account_status || "Active"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                    No active Sales employees.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
