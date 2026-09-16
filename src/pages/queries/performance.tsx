import { useMemo, useState } from "react";
import { BarChart3, Clock3, Target, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccessibleQueries, useAccessProfile } from "@/lib/crm/access";
import { computeMetrics } from "@/lib/crm/metrics";
import { useCrmEvents, useCrmTasks, useEmployees } from "@/lib/crm/store";

export default function PerformanceReview() {
  const queries = useAccessibleQueries();
  const tasks = useCrmTasks();
  const events = useCrmEvents();
  const employees = useEmployees();
  const access = useAccessProfile();
  const metrics = useMemo(() => {
    const roster = access.canManageTeam
      ? employees
      : employees.filter((employee) => employee.id === access.employee?.id);
    const queryIds = new Set(queries.map((query) => query.query_id));
    return computeMetrics(
      queries,
      tasks.filter((task) => !task.query_id || queryIds.has(task.query_id)),
      roster,
      events.filter((event) => !event.query_id || queryIds.has(event.query_id)),
    );
  }, [queries, tasks, events, employees, access.canManageTeam, access.employee?.id]);
  const [windowName, setWindowName] = useState("8weeks");
  const visibleTrends = windowName === "4weeks" ? metrics.trends.slice(-4) : metrics.trends;
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">MP Unit · Weekly review</p>
          <h1 className="text-3xl font-bold">Sales Performance</h1>
          <p className="text-sm text-slate-500">
            Stage speed, response discipline, conversion and advisor accountability from actual
            Query events.
          </p>
        </div>
        <Select value={windowName} onValueChange={setWindowName}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4weeks">Last 4 weeks</SelectItem>
            <SelectItem value="8weeks">Last 8 weeks</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Avg. first response", `${metrics.weekly.avgResponseHours.toFixed(1)} h`, Clock3],
          ["Avg. quote turnaround", `${metrics.weekly.avgQuotationHours.toFixed(1)} h`, BarChart3],
          ["Conversion", `${metrics.weekly.conversion.toFixed(1)}%`, Target],
          ["Top performer", metrics.weekly.topPerformer?.employee.name || "—", Trophy],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <Icon className="h-5 w-5 text-teal-600" />
              <p className="mt-3 text-sm text-slate-500">{String(label)}</p>
              <p className="mt-1 text-2xl font-bold">{String(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Advisor Scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Advisor</th>
                  <th>Open</th>
                  <th>Overdue</th>
                  <th>Quotes today</th>
                  <th>Follow-ups today</th>
                  <th>Won</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {metrics.workload.map((row) => (
                  <tr key={row.employee.id} className="border-b">
                    <td className="p-3 font-semibold">{row.employee.name}</td>
                    <td>{row.assigned}</td>
                    <td className={row.overdue ? "font-bold text-red-600" : ""}>{row.overdue}</td>
                    <td>{row.quotesSentToday}</td>
                    <td>{row.followupsDoneToday}</td>
                    <td>{row.confirmed}</td>
                    <td>{row.conversion.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Weekly Query Outcomes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {visibleTrends.map((week) => (
            <div
              key={week.key}
              className="grid grid-cols-[90px_1fr_80px_80px_100px] items-center gap-3"
            >
              <p className="text-sm font-semibold">{week.label}</p>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-teal-600"
                  style={{
                    width: `${Math.min(100, week.leads ? (week.won / week.leads) * 100 : 0)}%`,
                  }}
                />
              </div>
              <span>{week.leads} leads</span>
              <span>{week.won} won</span>
              <strong>{week.conversion.toFixed(1)}%</strong>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stage Speed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.stageAverages
            .filter((row) => row.stage !== "Won" && row.stage !== "Lost")
            .map((row) => (
              <div key={row.stage} className="rounded-lg border p-4">
                <p className="text-sm font-semibold">{row.stage}</p>
                <p className="mt-2 text-2xl font-bold">
                  {row.samples ? `${row.avgHours.toFixed(1)} h` : "—"}
                </p>
                <p className="text-xs text-slate-500">{row.samples} recorded transitions</p>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
