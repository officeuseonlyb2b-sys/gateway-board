import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock3, IndianRupee, Target, TrendingUp, Users } from "lucide-react";
import { QueryFilters, useQueryFilters } from "@/components/crm/query-filters";
import { inr } from "@/components/crm/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessibleQueries } from "@/lib/crm/access";
import { useCrmTasks, useEmployees } from "@/lib/crm/store";
import { STAGES } from "@/lib/crm/types";

export default function QueryDashboard() {
  const navigate = useNavigate();
  const queries = useAccessibleQueries();
  const tasks = useCrmTasks();
  const employees = useEmployees().filter((employee) => employee.active !== false);
  const scope = useQueryFilters(queries);
  const list = scope.filtered;
  const now = new Date();
  const won = list.filter((query) => query.stage === "Won");
  const lost = list.filter((query) => query.stage === "Lost");
  const closed = won.length + lost.length;
  const pipelineValue = list
    .filter((query) => !["Won", "Lost"].includes(query.stage))
    .reduce((sum, query) => sum + (query.commercials.top_line || query.value || 0), 0);
  const wonValue = won.reduce(
    (sum, query) => sum + (query.commercials.final_selling || query.value || 0),
    0,
  );
  const overdue = list.filter(
    (query) =>
      query.followup_due &&
      new Date(query.followup_due) < now &&
      !["Won", "Lost"].includes(query.stage),
  );
  const workload = employees
    .map((employee) => ({
      name: employee.name,
      open: list.filter(
        (query) => query.owner === employee.name && !["Won", "Lost"].includes(query.stage),
      ).length,
      overdue: overdue.filter((query) => query.owner === employee.name).length,
      won: won.filter((query) => query.owner === employee.name).length,
      tasks: tasks.filter((task) => task.owner === employee.name && !task.done).length,
    }))
    .sort((a, b) => b.open - a.open);
  const recent = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div>
          <p className="text-sm font-medium text-teal-700">
            Madhya Pradesh Unit · Sales command centre
          </p>
          <h1 className="text-3xl font-bold">Query Health Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            A result-oriented view of lead movement, commercial opportunity and actions needing
            attention.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/queries/query-tracker" })}>
          View all {list.length} Queries <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <QueryFilters
        state={scope.filters}
        onChange={scope.setFilters}
        options={scope.options}
        onReset={scope.reset}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Total Queries",
            value: list.length,
            sub: `${list.filter((query) => query.assignment_status !== "Assigned").length} awaiting assignment`,
            icon: Users,
          },
          {
            label: "Pipeline value",
            value: inr(pipelineValue),
            sub: "Current top-line opportunity",
            icon: IndianRupee,
          },
          {
            label: "Business won",
            value: inr(wonValue),
            sub: `${won.length} won Queries`,
            icon: Target,
          },
          {
            label: "Win rate",
            value: `${(closed ? (won.length / closed) * 100 : 0).toFixed(1)}%`,
            sub: "Won ÷ closed",
            icon: TrendingUp,
          },
          {
            label: "Overdue actions",
            value: overdue.length,
            sub: "Needs immediate ownership",
            icon: Clock3,
          },
        ].map(({ label, value, sub, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex justify-between">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <Icon className="h-5 w-5 text-teal-600" />
              </div>
              <p className="mt-4 text-3xl font-bold">{value}</p>
              <p className="mt-2 text-xs text-slate-500">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Pipeline Health</CardTitle>
              <p className="text-sm text-slate-500">Volume and top-line value by lifecycle stage</p>
            </div>
            <Button variant="outline" onClick={() => navigate({ to: "/queries/pipeline-board" })}>
              Open board
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {STAGES.map((stage) => {
              const stageList = list.filter((query) => query.stage === stage);
              const value = stageList.reduce(
                (sum, query) => sum + (query.commercials.top_line || query.value || 0),
                0,
              );
              return (
                <div
                  key={stage}
                  className="grid grid-cols-[150px_1fr_60px_120px] items-center gap-3"
                >
                  <p className="text-sm font-semibold">{stage}</p>
                  <div className="h-2 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full bg-teal-600"
                      style={{
                        width: `${list.length ? Math.max(2, (stageList.length / list.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-right text-sm font-bold">{stageList.length}</p>
                  <p className="text-right text-xs text-slate-500">{inr(value)}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Advisor Workload</CardTitle>
            <p className="text-sm text-slate-500">Open load, overdue commitments, tasks and wins</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {workload.map((row) => (
              <div key={row.name} className="rounded-lg border p-3">
                <div className="flex justify-between">
                  <p className="font-semibold">{row.name}</p>
                  <Badge variant="outline">{row.open} open</Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 text-xs text-slate-500">
                  <span className={row.overdue ? "font-bold text-red-600" : ""}>
                    {row.overdue} overdue
                  </span>
                  <span>{row.tasks} tasks</span>
                  <span>{row.won} won</span>
                </div>
              </div>
            ))}
            {!workload.length && (
              <p className="text-sm text-slate-500">No active employee records.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recently Received Queries</CardTitle>
            <p className="text-sm text-slate-500">Open any row to work the full Query 360 file</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.map((query) => (
              <button
                key={query.id}
                className="grid w-full gap-2 rounded-lg border p-3 text-left hover:bg-slate-50 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"
                onClick={() => navigate({ to: "/queries/$id", params: { id: query.id } })}
              >
                <div>
                  <p className="font-semibold">{query.customer}</p>
                  <p className="text-xs text-slate-500">{query.query_id}</p>
                </div>
                <p className="text-sm">
                  {query.travel_start
                    ? new Date(query.travel_start).toLocaleDateString("en-GB")
                    : "Dates pending"}
                </p>
                <p className="font-bold">{inr(query.commercials.top_line || query.value || 0)}</p>
                <Badge variant="outline">{query.stage}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="border-teal-800 bg-gradient-to-br from-teal-900 to-teal-700 text-white">
          <CardContent className="p-6">
            <p className="text-2xl font-bold">{overdue.length} follow-ups need attention</p>
            <p className="mt-3 text-sm text-teal-100">
              The priority desk sorts overdue items first and escalates those beyond 48 hours to
              managers.
            </p>
            <Button
              className="mt-6 bg-white text-teal-800"
              onClick={() => navigate({ to: "/queries/follow-up-desk" })}
            >
              Work through follow-ups <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
