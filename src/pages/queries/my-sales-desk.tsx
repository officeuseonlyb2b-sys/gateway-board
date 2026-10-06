import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  Inbox,
  IndianRupee,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccessProfile, useAccessibleQueries } from "@/lib/crm/access";
import { attentionFor } from "@/lib/crm/insights";
import { useCrmTasks } from "@/lib/crm/store";
import { STAGES } from "@/lib/crm/types";

const sameDay = (value?: string) =>
  value && new Date(value).toDateString() === new Date().toDateString();
const isOpen = (stage: string) => !["Won", "Lost"].includes(stage);

export default function MySalesDesk() {
  const profile = useAccessProfile();
  const accessible = useAccessibleQueries();
  const tasks = useCrmTasks();
  const name = profile.employee?.name;
  const queries = name
    ? accessible.filter((query) => query.owner === name || query.created_by === name)
    : accessible;
  const mineTasks = name ? tasks.filter((task) => task.owner === name) : tasks;
  const now = Date.now();
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  const open = queries.filter((query) => isOpen(query.stage));
  const overdue = open.filter(
    (query) => query.followup_due && new Date(query.followup_due).getTime() < now,
  );
  const dueToday = open.filter((query) => sameDay(query.followup_due));
  const attention = open
    .map((query) => ({ query, ...attentionFor(query, mineTasks) }))
    .filter((item) => item.level !== "Healthy")
    .sort(
      (a, b) =>
        ["Critical", "Attention", "Upcoming"].indexOf(a.level) -
        ["Critical", "Attention", "Upcoming"].indexOf(b.level),
    );
  const cards = [
    { label: "Active queries", value: open.length, icon: Inbox, tone: "text-teal-700" },
    {
      label: "First action pending",
      value: open.filter((q) => q.assignment_status === "Assigned" && !q.first_action_at).length,
      icon: Clock3,
      tone: "text-amber-600",
    },
    {
      label: "Quotes pending",
      value: open.filter((q) => ["Requirement Review", "Costing"].includes(q.stage)).length,
      icon: FileText,
      tone: "text-blue-600",
    },
    {
      label: "Follow-ups today",
      value: dueToday.length,
      icon: CalendarCheck2,
      tone: "text-indigo-600",
    },
    { label: "Overdue", value: overdue.length, icon: AlertTriangle, tone: "text-red-600" },
    {
      label: "Tasks today",
      value: mineTasks.filter((task) => !task.done && sameDay(task.due_at)).length,
      icon: CheckCircle2,
      tone: "text-cyan-600",
    },
    {
      label: "Completed today",
      value: mineTasks.filter((task) => task.done && sameDay(task.completed_at)).length,
      icon: CheckCircle2,
      tone: "text-emerald-600",
    },
    {
      label: "Urgent leads",
      value: open.filter((q) => q.priority === "Urgent").length,
      icon: Flame,
      tone: "text-orange-600",
    },
  ];
  const won = queries.filter((query) => query.stage === "Won");
  const closed = queries.filter((query) => ["Won", "Lost"].includes(query.stage));
  const conversion = closed.length ? Math.round((won.length / closed.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#063b3a] to-[#078c87] p-6 text-white md:flex-row md:items-center">
        <div>
          <p className="text-sm text-teal-100">
            {profile.employee?.designation || profile.role} · Madhya Pradesh Unit
          </p>
          <h1 className="mt-1 text-3xl font-bold">Good day, {name?.split(" ")[0] || "Advisor"}</h1>
          <p className="mt-1 text-sm text-teal-100">
            Your live action desk for{" "}
            {new Date().toLocaleDateString("en-GB", { dateStyle: "full" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild className="bg-white text-teal-800">
            <Link to="/new-lead">Create Query</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/40 bg-transparent text-white">
            <Link to="/queries/follow-up-desk">Open Follow-ups</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <Icon className={`h-5 w-5 ${tone}`} />
              </div>
              <p className="mt-3 text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Attention Centre</CardTitle>
            <p className="text-sm text-slate-500">
              Exceptions ranked by urgency so important leads do not get missed.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention.slice(0, 8).map(({ query, level, reason }) => (
              <div
                key={query.id}
                className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={level === "Critical" ? "destructive" : "outline"}>
                      {level}
                    </Badge>
                    <Link
                      to="/queries/$id"
                      params={{ id: query.id }}
                      className="font-bold text-teal-700 hover:underline"
                    >
                      {query.query_id}
                    </Link>
                  </div>
                  <p className="mt-1 font-semibold">{query.customer}</p>
                  <p className="text-xs text-slate-500">{reason}</p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">{query.next_action || "Action required"}</p>
                  <p className="text-xs text-slate-500">
                    {query.followup_due
                      ? new Date(query.followup_due).toLocaleString("en-GB")
                      : "No due date"}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link to="/queries/$id" params={{ id: query.id }}>
                    Work now
                  </Link>
                </Button>
              </div>
            ))}
            {!attention.length && (
              <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
                No exceptions in your current scope.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My Pipeline</CardTitle>
            <p className="text-sm text-slate-500">Current active movement by Sales stage.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {STAGES.filter((s) => !["Won", "Lost"].includes(s)).map((stage) => {
              const count = open.filter((query) => query.stage === stage).length;
              const pct = open.length ? (count / open.length) * 100 : 0;
              return (
                <div key={stage}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{stage}</span>
                    <strong>{count}</strong>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>My Day</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mineTasks
              .filter((t) => !t.done)
              .sort((a, b) => a.due_at.localeCompare(b.due_at))
              .slice(0, 6)
              .map((task) => (
                <div key={task.id} className="rounded-lg border p-3">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-semibold">{task.title}</p>
                    <Badge
                      variant={new Date(task.due_at).getTime() < now ? "destructive" : "outline"}
                    >
                      {new Date(task.due_at).toLocaleDateString("en-GB")}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {task.category} · {task.query_id || "General"}
                  </p>
                </div>
              ))}
            {!mineTasks.some((t) => !t.done) && (
              <p className="text-sm text-slate-500">No open tasks.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Nurturing & Revisit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {open
              .filter((q) => q.stage === "Nurturing")
              .slice(0, 6)
              .map((query) => (
                <Link
                  key={query.id}
                  to="/queries/$id"
                  params={{ id: query.id }}
                  className="block rounded-lg border p-3 hover:border-teal-400"
                >
                  <div className="flex justify-between">
                    <p className="font-semibold">{query.customer}</p>
                    <Badge variant="outline">{query.priority}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Revisit{" "}
                    {query.revisit_at || query.followup_due
                      ? new Date(query.revisit_at || query.followup_due).toLocaleDateString("en-GB")
                      : "date missing"}
                  </p>
                </Link>
              ))}
            {!open.some((q) => q.stage === "Nurturing") && (
              <p className="text-sm text-slate-500">No nurturing queries.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personal Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-teal-50 p-4">
              <div>
                <p className="text-xs text-slate-500">Conversion</p>
                <p className="text-3xl font-bold text-teal-800">{conversion}%</p>
              </div>
              <IndianRupee className="h-8 w-8 text-teal-600" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-slate-500">Wins</p>
                <p className="text-2xl font-bold">{won.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-slate-500">Won value</p>
                <p className="text-lg font-bold">
                  ₹
                  {(
                    won.reduce((sum, q) => sum + (q.commercials.final_selling || q.value || 0), 0) /
                    100000
                  ).toFixed(1)}
                  L
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/queries/performance">Open Performance Review</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
