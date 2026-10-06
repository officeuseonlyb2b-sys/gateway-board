import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccessibleQueries } from "@/lib/crm/access";
import { useCrmTasks, useEmployees } from "@/lib/crm/store";
import { getEmployeeWorkloads } from "@/lib/crm/workload";

export default function ExecutiveWorkload() {
  const queries = useAccessibleQueries();
  const tasks = useCrmTasks();
  const rows = getEmployeeWorkloads(useEmployees(), queries, tasks);
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-teal-700">Sales Manager · team view</p>
        <h1 className="text-3xl font-bold">Executive Workload</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live workload, follow-up pressure and task commitments for assignment decisions.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workload board</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-y bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Executive</th>
                <th>Active</th>
                <th>Quotes</th>
                <th>Due today</th>
                <th>Overdue</th>
                <th>Open tasks</th>
                <th className="min-w-44">Load</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee.id} className="border-b">
                  <td className="p-3">
                    <Link
                      to="/queries/query-tracker"
                      className="font-semibold text-teal-700 hover:underline"
                    >
                      {row.employee.name}
                    </Link>
                    <p className="text-xs text-slate-500">{row.employee.designation}</p>
                  </td>
                  <td>{row.openQueries}</td>
                  <td>{row.draftQuotations}</td>
                  <td>{row.followupsDueToday}</td>
                  <td className={row.overdueFollowups ? "font-bold text-red-600" : ""}>
                    {row.overdueFollowups}
                  </td>
                  <td>{row.openTasks}</td>
                  <td className="pr-4">
                    <Progress value={Math.min(100, row.score * 2)} />
                    <p className="mt-1 text-xs text-slate-500">
                      {row.level} · {row.score} points
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
