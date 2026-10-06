import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  IndianRupee,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { ReassignQuery } from "@/components/crm/assign";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccessibleQueries } from "@/lib/crm/access";
import { attentionFor, durationLabel, hoursBetween } from "@/lib/crm/insights";
import { useCrmTasks, useEmployees } from "@/lib/crm/store";

const today = (value?: string) =>
  value && new Date(value).toDateString() === new Date().toDateString();
const openStage = (stage: string) => !["Won", "Lost"].includes(stage);

export default function SalesControlTower() {
  const queries = useAccessibleQueries();
  const employees = useEmployees().filter(
    (e) => e.active !== false && (e.department || "Sales") === "Sales",
  );
  const tasks = useCrmTasks();
  const now = Date.now();
  const open = queries.filter((q) => openStage(q.stage));
  const waiting = open
    .filter((q) => q.assignment_status !== "Assigned" || !q.owner)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const interventions = open
    .map((query) => ({ query, ...attentionFor(query, tasks) }))
    .filter((x) => ["Critical", "Attention"].includes(x.level));
  const metrics = [
    { label: "New today", value: queries.filter((q) => today(q.created_at)).length, icon: Inbox },
    { label: "Waiting assignment", value: waiting.length, icon: Clock3 },
    {
      label: "Assigned today",
      value: queries.filter((q) => today(q.assigned_at)).length,
      icon: Users,
    },
    {
      label: "First action pending",
      value: open.filter((q) => q.assignment_status === "Assigned" && !q.first_action_at).length,
      icon: Target,
    },
    {
      label: "Quotes pending",
      value: open.filter((q) => ["Requirement Review", "Costing"].includes(q.stage)).length,
      icon: FileText,
    },
    {
      label: "Follow-ups due",
      value: open.filter((q) => today(q.followup_due)).length,
      icon: CheckCircle2,
    },
    {
      label: "Overdue",
      value: open.filter((q) => q.followup_due && new Date(q.followup_due).getTime() < now).length,
      icon: AlertTriangle,
    },
    {
      label: "Wins today",
      value: queries.filter((q) => q.stage === "Won" && today(q.closed_at)).length,
      icon: Trophy,
    },
    {
      label: "Open opportunity",
      value: `₹${(open.reduce((s, q) => s + (q.commercials.top_line || q.value || 0), 0) / 100000).toFixed(1)}L`,
      icon: IndianRupee,
    },
  ];
  const workload = employees
    .map((employee) => {
      const mine = open.filter((q) => q.owner === employee.name);
      const overdue = mine.filter(
        (q) => q.followup_due && new Date(q.followup_due).getTime() < now,
      ).length;
      const due = mine.filter((q) => today(q.followup_due)).length;
      const quotes = mine.filter((q) => ["Requirement Review", "Costing"].includes(q.stage)).length;
      const score = Math.min(100, mine.length * 7 + overdue * 15 + due * 8 + quotes * 5);
      return { employee, mine: mine.length, overdue, due, quotes, score };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-950 via-[#073d3c] to-[#087d78] p-6 text-white md:flex-row md:items-center">
        <div>
          <p className="text-sm text-teal-100">Madhya Pradesh · Manager workspace</p>
          <h1 className="text-3xl font-bold">Sales Control Tower</h1>
          <p className="mt-1 text-sm text-teal-100">
            Live assignment, team capacity, intervention, SOD and commercial health.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild className="bg-white text-teal-800">
            <Link to="/queries/assignment-desk">Assignment Desk</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/40 bg-transparent text-white">
            <Link to="/queries/query-tracker">All Queries</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-9">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex justify-between">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <Icon className="h-4 w-4 text-teal-600" />
              </div>
              <p className="mt-3 text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Assignment Desk · oldest waiting first</CardTitle>
            <p className="text-sm text-slate-500">
              Manager confirms ownership; capacity guidance stays advisory.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {waiting.slice(0, 6).map((q) => (
              <div
                key={q.id}
                className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_auto_260px] lg:items-center"
              >
                <div>
                  <Link to="/queries/$id" params={{ id: q.id }} className="font-bold text-teal-700">
                    {q.query_id}
                  </Link>
                  <p className="font-semibold">{q.customer}</p>
                  <p className="text-xs text-slate-500">
                    {q.destination} · {q.pax} pax · {q.priority}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <p className="text-xs text-slate-500">Waiting</p>
                  <strong>{durationLabel(hoursBetween(q.created_at))}</strong>
                </div>
                <ReassignQuery queryId={q.query_id} owner="" />
              </div>
            ))}
            {!waiting.length && (
              <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">
                All Queries are assigned.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Intervention Centre</CardTitle>
            <p className="text-sm text-slate-500">
              SLA, missing next action and overdue exceptions.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {interventions.slice(0, 8).map(({ query, level, reason }) => (
              <Link
                key={query.id}
                to="/queries/$id"
                params={{ id: query.id }}
                className="block rounded-xl border p-3 hover:border-teal-400"
              >
                <div className="flex justify-between gap-2">
                  <p className="font-semibold">{query.customer}</p>
                  <Badge variant={level === "Critical" ? "destructive" : "outline"}>{level}</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {query.query_id} · {query.owner || "Unassigned"}
                </p>
                <p className="mt-1 text-sm">{reason}</p>
              </Link>
            ))}
            {!interventions.length && (
              <p className="text-sm text-slate-500">No manager interventions required.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Team Capacity & SOD Board</CardTitle>
          <p className="text-sm text-slate-500">
            Composite workload considers active queries, quote work, today’s follow-ups and overdue
            commitments.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Advisor</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Quotes</th>
                  <th>Due today</th>
                  <th>Overdue</th>
                  <th>Load</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {workload.map((row) => (
                  <tr key={row.employee.id} className="border-b">
                    <td className="p-3">
                      <p className="font-semibold">{row.employee.name}</p>
                      <p className="text-xs text-slate-500">
                        {row.employee.employee_code || row.employee.id}
                      </p>
                    </td>
                    <td>{row.employee.designation || row.employee.role}</td>
                    <td>{row.mine}</td>
                    <td>{row.quotes}</td>
                    <td>{row.due}</td>
                    <td className={row.overdue ? "font-bold text-red-600" : ""}>{row.overdue}</td>
                    <td className="min-w-40">
                      <Progress value={row.score} />
                      <p className="mt-1 text-xs text-slate-500">
                        {row.score < 35 ? "Available" : row.score < 70 ? "Balanced" : "High load"}
                      </p>
                    </td>
                    <td>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/queries/follow-up-desk">Review</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!workload.length && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Add Sales employees in Team & Access.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Query Ageing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["0–2 days", 0, 48],
              ["3–7 days", 48, 168],
              ["8–15 days", 168, 360],
              ["15+ days", 360, Infinity],
            ].map(([label, min, max]) => {
              const count = open.filter((q) => {
                const h = hoursBetween(q.created_at);
                return h >= Number(min) && h < Number(max);
              }).length;
              return (
                <div key={String(label)} className="flex justify-between border-b pb-2">
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Source Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from(new Set(queries.map((q) => q.lead_source)))
              .slice(0, 6)
              .map((source) => (
                <div key={source} className="flex justify-between border-b pb-2">
                  <span>{source || "Unknown"}</span>
                  <strong>{queries.filter((q) => q.lead_source === source).length}</strong>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Manager Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild>
              <Link to="/queries/assignment-desk">Assign waiting Queries</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/queries/follow-up-desk">Run SOD follow-up review</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/queries/performance">Review team performance</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/queries/analytics">Open Sales analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
