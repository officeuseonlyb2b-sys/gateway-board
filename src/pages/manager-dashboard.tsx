import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  Gauge,
  ListChecks,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { fmtDur, useCrmEvents, useEmployees } from "@/lib/crm/store";
import { useCrmMetrics, type WorkloadRow } from "@/lib/crm/metrics";
import type { CrmEvent } from "@/lib/crm/types";
import { AssignLeadsDialog, NewTaskDialog } from "@/components/crm/assign";

// Updated Clean Theme (White/Slate + Teal Accents + Decorative Circles)
const navCardClass =
  "rounded-2xl bg-white border border-slate-200 shadow-sm";

const smallLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.02em] text-slate-500";

const DONUT_COLORS = ["#0d9488", "#f59e0b", "#38a94c", "#7042c7", "#1ca6bd", "#d95a8a", "#8ea832"];

const inr = (n: number) => "₹ " + Math.round(n).toLocaleString("en-IN");
const pct1 = (n: number) => `${n.toFixed(1)}%`;
const pct2 = (n: number) => `${n.toFixed(2)}%`;
const hm = (hours: number) => {
  if (!hours) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};
const delta = (cur: number, prev: number) => {
  if (!prev) return { value: cur ? "100%" : "0%", positive: cur >= prev };
  const d = ((cur - prev) / prev) * 100;
  return { value: `${Math.abs(d).toFixed(1)}%`, positive: d >= 0 };
};
const initialsOf = (name: string) =>
  name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const timeOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  if (same) return time;
  const yest = new Date(today.getTime() - 864e5);
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${time}`;
};
const BAD_EVENTS: CrmEvent["type"][] = ["lost"];

function Avatar({ initials, index }: { initials: string; index: number }) {
  const classes = [
    "bg-teal-600",
    "bg-amber-500",
    "bg-emerald-600",
    "bg-purple-600",
    "bg-blue-600",
  ];

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white/15 ${classes[index % classes.length]}`}
    >
      {initials}
    </div>
  );
}

function Trend({
  value,
  positive = true,
}: {
  value: string;
  positive?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
        positive ? "text-emerald-600" : "text-red-600"
      }`}
    >
      {positive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {value}
    </span>
  );
}

// ✅ EXACT MATCH KPI Card (Query Performance Centre Style)
function KpiCard({
  title,
  value,
  prev,
  icon: Icon, // Icon is accepted but not rendered to match Query Performance Centre exactly
  iconClass,
  invert = false,
  accentColor, // Color for decorative circle
}: {
  title: string;
  value: number;
  prev: number;
  icon: typeof Users;
  iconClass: string;
  invert?: boolean;
  accentColor: string; // e.g., "bg-teal-100/60"
}) {
  const d = delta(value, prev);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm p-5 min-w-0`}>
      {/* Decorative Circle */}
      <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full ${accentColor}`}></div>
      
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-tight">
            {title}
          </p>
        </div>
        {/* Tiny Trend indicator (kept clean, no big icons) */}
        <Trend value={d.value} positive={invert ? !d.positive : d.positive} />
      </div>

      <div className="relative z-10 mt-3">
        <p className="text-3xl font-bold leading-none tracking-tight text-slate-900">
          {value}
        </p>
      </div>

      <p className="relative z-10 mt-2 text-xs text-slate-500">
        vs yesterday <span className="text-slate-400">({prev})</span>
      </p>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof Users;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-teal-600" />
        <h2 className="truncate text-[14px] font-bold text-slate-900">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function DonutChart({ slices, total }: { slices: { value: number; color: string }[]; total: number }) {
  const gradient = useMemo(() => {
    if (!total) return "conic-gradient(#e2e8f0 0deg 360deg)";
    let acc = 0;
    const parts = slices.map((s) => {
      const start = (acc / total) * 360;
      acc += s.value;
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${parts.join(", ")})`;
  }, [slices, total]);

  return (
    <div className="relative h-[156px] w-[156px] shrink-0">
      <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
      <div className="absolute inset-[28px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-[25px] font-bold text-slate-900">{total}</span>
        <span className="text-[10px] text-slate-500">Active Leads</span>
      </div>
    </div>
  );
}

function PipelineBars({
  pipeline,
  total,
}: {
  pipeline: { label: string; value: number; pct: number }[];
  total: number;
}) {
  const max = Math.max(1, ...pipeline.map((s) => s.value));
  return (
    <div className="space-y-2.5 px-4 py-3">
      {pipeline.map((stage) => (
        <div key={stage.label} className="grid grid-cols-[92px_1fr_34px_38px] items-center gap-2">
          <span
            className={`truncate text-[10px] ${
              stage.label === "Confirmed"
                ? "text-emerald-600"
                : stage.label === "Lost"
                  ? "text-red-600"
                  : "text-slate-700"
            }`}
          >
            {stage.label}
          </span>
          <div className="h-2 overflow-hidden bg-slate-100 rounded-full">
            <div
              className={`h-full rounded-full ${
                stage.label === "Confirmed"
                  ? "bg-emerald-500"
                  : stage.label === "Lost"
                    ? "bg-red-500"
                    : "bg-teal-600"
              }`}
              style={{ width: `${(stage.value / max) * 100}%` }}
            />
          </div>
          <span className="text-right text-[9px] text-slate-700">
            {stage.value}
          </span>
          <span className="text-right text-[9px] text-slate-500">
            {pct1(stage.pct)}
          </span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[10px]">
        <span className="font-semibold text-slate-900">Total</span>
        <span className="text-slate-700">{total}</span>
        <span className="text-slate-500">100%</span>
      </div>
    </div>
  );
}

function exportWeeklyReview(rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weekly-review-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ManagerDashboard() {
  const m = useCrmMetrics();
  const employees = useEmployees();
  const events = useCrmEvents();
  const [stageView, setStageView] = useState<string>("__all");

  const stageRows = useMemo(() => {
    const rows = stageView === "__all"
      ? m.stageAverages
      : m.stageAveragesByEmployee.get(stageView) ?? [];
    return rows.filter((r) => r.samples > 0);
  }, [m.stageAverages, m.stageAveragesByEmployee, stageView]);


  const workload = m.workload;
  const totals = useMemo(() => {
    const sum = (pick: (r: WorkloadRow) => number) => workload.reduce((s, r) => s + pick(r), 0);
    return {
      assigned: sum((r) => r.assigned),
      newToday: sum((r) => r.newToday),
      inProgress: sum((r) => r.inProgress),
      quotations: sum((r) => r.quotations),
      completedToday: sum((r) => r.completedToday),
      overdue: sum((r) => r.overdue),
      nurturing: sum((r) => r.nurturing),
      revenue: sum((r) => r.revenue),
      leadsReceived: sum((r) => r.leadsReceived),
      leadsAssigned: sum((r) => r.leadsAssigned),
      quotesSent: sum((r) => r.quotesSentToday),
      followups: sum((r) => r.followupsDoneToday),
      tasksClosed: sum((r) => r.tasksClosedToday),
    };
  }, [workload]);

  const distribution = useMemo(
    () =>
      workload.map((r, i) => ({
        name: r.employee.name,
        value: r.assigned,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        share: totals.assigned ? (r.assigned / totals.assigned) * 100 : 0,
      })),
    [workload, totals.assigned],
  );

  const recent = useMemo(() => events.slice(0, 6), [events]);
  const half = Math.ceil(recent.length / 2);

  const monthly = m.monthly;
  const monthlyCards: { label: string; value: string; cur: number; prev: number; prevLabel: string }[] = [
    { label: "Total Leads", value: monthly.totalLeads.toLocaleString("en-IN"), cur: monthly.totalLeads, prev: monthly.prevTotalLeads, prevLabel: monthly.prevLabel },
    { label: "Quotes Sent", value: monthly.quotesSent.toLocaleString("en-IN"), cur: monthly.quotesSent, prev: monthly.prevQuotesSent, prevLabel: monthly.prevLabel },
    { label: "Confirmed", value: monthly.confirmed.toLocaleString("en-IN"), cur: monthly.confirmed, prev: monthly.prevConfirmed, prevLabel: monthly.prevLabel },
    { label: "Lost", value: monthly.lost.toLocaleString("en-IN"), cur: monthly.lost, prev: monthly.prevLost, prevLabel: monthly.prevLabel },
    { label: "Nurturing", value: monthly.nurturing.toLocaleString("en-IN"), cur: monthly.nurturing, prev: monthly.prevNurturing, prevLabel: monthly.prevLabel },
    { label: "Conversion Rate", value: pct2(monthly.conversion), cur: monthly.conversion, prev: monthly.prevConversion, prevLabel: monthly.prevLabel },
  ];

  const weeklyRows = [
    { label: "Average Response Time", value: hm(m.weekly.avgResponseHours), Icon: Clock3, positive: true },
    { label: "Average Quotation Turnaround", value: hm(m.weekly.avgQuotationHours), Icon: Clock3, positive: false },
    { label: "Team Conversion Rate", value: pct2(m.weekly.conversion), Icon: Gauge, positive: m.weekly.conversion >= monthly.prevConversion },
  ];

  return (
    <div className="min-h-full w-full bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-6 pt-4 lg:px-6">
        {/* Page heading */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Manager Dashboard — Sales &amp; Queries
              </h1>
              <TrendingUp className="h-5 w-5 text-teal-600" />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              360° team performance, assignments, and weekly review overview.
            </p>
          </div>
        </div>

        {/* KPI cards (EXACT MATCH: White bg, decorative circles, no icons) */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard title="New Leads Today" value={m.newLeadsToday} prev={m.prev.newLeads} icon={Users} iconClass="" accentColor="bg-teal-100/60" />
          <KpiCard title="Leads Assigned Today" value={m.leadsAssignedToday} prev={m.prev.assigned} icon={Users} iconClass="" accentColor="bg-yellow-100/70" />
          <KpiCard title="Tasks Completed Today" value={m.tasksCompletedToday} prev={m.prev.tasksCompleted} icon={CheckCircle2} iconClass="" accentColor="bg-emerald-100/70" />
          <KpiCard title="Pending Quotations" value={m.pendingQuotations} prev={m.prev.pendingQuotations} icon={FileText} iconClass="" accentColor="bg-blue-100/60" />
          <KpiCard title="Follow-ups Due Today" value={m.followupsDueToday} prev={m.prev.followupsDue} icon={CalendarDays} iconClass="" accentColor="bg-purple-100/60" invert />
          <KpiCard title="Overdue Queries" value={m.overdueFollowups} prev={m.prev.overdue} icon={CircleAlert} iconClass="" accentColor="bg-pink-200/30" invert />
        </div>

        {/* Main upper row */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.05fr)_minmax(330px,1fr)]">
          {/* Team workload */}
          <section className={`${navCardClass} min-w-0 overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Team Workload / Executive Performance"
              right={
                <div className="flex items-center gap-2">
                  <button className="hidden h-7 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 sm:flex">
                    View by: Executive
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() =>
                      exportWeeklyReview([
                        ["Executive", "Role", "Assigned", "New Today", "In Progress", "Quotations", "Completed Today", "Overdue", "Nurturing", "Conversion %", "Revenue"],
                        ...workload.map((r) => [
                          r.employee.name, r.employee.role, r.assigned, r.newToday, r.inProgress, r.quotations,
                          r.completedToday, r.overdue, r.nurturing, r.conversion.toFixed(2), r.revenue,
                        ].map(String)),
                      ])
                    }
                    className="hidden h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 md:flex"
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </button>
                </div>
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="border-r border-slate-200 px-3 py-2 text-left font-medium">
                      Executive
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      Assigned
                      <br />
                      Leads
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      New Today
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      In Progress
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      Quotations
                      <br />
                      Sent
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      Completed
                      <br />
                      Today
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      Overdue
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      Nurturing
                    </th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center font-medium">
                      Monthly
                      <br />
                      Conversion %
                    </th>
                    <th className="px-2 py-2 text-center font-medium">
                      Monthly Revenue / Pipeline Value
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {workload.map((row, index) => (
                    <tr
                      key={row.employee.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar initials={initialsOf(row.employee.name)} index={index} />
                          <div>
                            <div className="font-semibold text-slate-900">
                              {row.employee.name}
                            </div>
                            <div className="text-[9px] text-slate-500">
                              {row.employee.role}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center font-semibold text-slate-700">{row.assigned}</td>
                      <td className="text-center font-semibold text-slate-700">{row.newToday}</td>
                      <td className="text-center font-semibold text-slate-700">{row.inProgress}</td>
                      <td className="text-center font-semibold text-slate-700">{row.quotations}</td>
                      <td className="text-center font-semibold text-slate-700">{row.completedToday}</td>
                      <td className="text-center font-semibold text-red-600">{row.overdue}</td>
                      <td className="text-center font-semibold text-slate-700">{row.nurturing}</td>
                      <td className="text-center">
                        <span className="font-semibold text-slate-700">{pct1(row.conversion)}</span>
                      </td>
                      <td className="px-2 text-center">
                        <span className="font-semibold text-slate-900">{inr(row.revenue)}</span>
                      </td>
                    </tr>
                  ))}
                  {workload.length === 0 && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={10} className="px-3 py-6 text-center text-[10px] text-slate-500">
                        No employees registered yet. Add them in Users &amp; Roles.
                      </td>
                    </tr>
                  )}

                  <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                    <td className="px-3 py-2 text-slate-900">Team Total</td>
                    <td className="text-center text-slate-900">{totals.assigned}</td>
                    <td className="text-center text-slate-900">{totals.newToday}</td>
                    <td className="text-center text-slate-900">{totals.inProgress}</td>
                    <td className="text-center text-slate-900">{totals.quotations}</td>
                    <td className="text-center text-slate-900">{totals.completedToday}</td>
                    <td className="text-center text-red-600">{totals.overdue}</td>
                    <td className="text-center text-slate-900">{totals.nurturing}</td>
                    <td className="text-center text-slate-900">{pct1(m.weekly.conversion)}</td>
                    <td className="text-center text-slate-900">{inr(totals.revenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Lead distribution */}
          <section className={`${navCardClass} min-w-0 overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Lead Distribution / Assignment"
              right={
                <span className="text-[10px] text-slate-500">Active Leads</span>
              }
            />

            <div className="flex min-h-[274px] flex-col items-center justify-center gap-5 px-4 py-4 sm:flex-row">
              <DonutChart slices={distribution} total={totals.assigned} />

              <div className="w-full max-w-[190px] space-y-3">
                {distribution.map((d) => (
                  <div
                    key={d.name}
                    className="flex items-center justify-between gap-2 text-[10px]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="truncate text-slate-700">{d.name}</span>
                    </div>
                    <span className="shrink-0 font-semibold text-slate-900">
                      {d.value} <span className="text-slate-500">({Math.round(d.share)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 border-t border-slate-200">
              <div className="px-4 py-3">
                <p className={smallLabelClass}>Total Active Leads</p>
                <p className="mt-1 text-[17px] font-bold text-slate-900">{m.activeQueries}</p>
              </div>
              <div className="border-l border-slate-200 px-4 py-3">
                <p className={smallLabelClass}>Avg. Leads / Executive</p>
                <p className="mt-1 text-[17px] font-bold text-slate-900">{m.avgLeadsPerExecutive.toFixed(1)}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Middle row */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.02fr_1.02fr_1.15fr_1.05fr]">
          {/* Daily snapshot */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Daily Performance Snapshot (Today)"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[430px] border-collapse text-[9px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-3 py-2 text-left font-medium">Executive</th>
                    <th className="px-1 py-2 text-center font-medium">
                      Leads
                      <br />
                      Received
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Leads
                      <br />
                      Assigned
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Quotes
                      <br />
                      Sent
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Follow-ups
                      <br />
                      Done
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Tasks
                      <br />
                      Closed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((r) => (
                    <tr key={r.employee.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700">{r.employee.name}</td>
                      {[r.leadsReceived, r.leadsAssigned, r.quotesSentToday, r.followupsDoneToday, r.tasksClosedToday].map((value, index) => (
                        <td key={index} className="px-1 py-2 text-center text-slate-700">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                    <td className="px-3 py-2 text-slate-900">Total</td>
                    <td className="text-center text-slate-900">{totals.leadsReceived}</td>
                    <td className="text-center text-slate-900">{totals.leadsAssigned}</td>
                    <td className="text-center text-slate-900">{totals.quotesSent}</td>
                    <td className="text-center text-slate-900">{totals.followups}</td>
                    <td className="text-center text-slate-900">{totals.tasksClosed}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Monthly overview */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={BarChart3}
              title="Monthly Performance Overview"
              right={<span className="text-[10px] text-slate-500">({monthly.label})</span>}
            />
            <div className="grid grid-cols-3 gap-2 p-3">
              {monthlyCards.map((card) => {
                const d = delta(card.cur, card.prev);
                const positive = card.label === "Lost" ? !d.positive : d.positive;
                return (
                  <div
                    key={card.label}
                    className={`rounded-xl border p-3 ${
                      card.label === "Conversion Rate"
                        ? "border-teal-200 bg-teal-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="text-[9px] text-slate-500">{card.label}</p>
                    <p className="mt-1 text-[19px] font-bold leading-none text-slate-900">{card.value}</p>
                    <div className="mt-2">
                      <Trend value={d.value} positive={positive} />
                    </div>
                    <p className="mt-1 text-[8px] text-slate-500">
                      vs {card.prevLabel} ({card.label === "Conversion Rate" ? pct2(card.prev) : card.prev.toLocaleString("en-IN")})
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Pipeline */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Target} title="Query Stage Pipeline" />
            <PipelineBars pipeline={m.pipeline} total={m.totalQueries} />
          </section>

          {/* Weekly review */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={UserRound}
              title="Weekly Review / Management Summary"
            />
            <div className="space-y-0">
              {weeklyRows.map(({ label, value, positive, Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50">
                    <Icon className="h-3.5 w-3.5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] leading-3 text-slate-500">{label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-900">{value}</p>
                    <Trend value="" positive={positive} />
                  </div>
                </div>
              ))}

              <div className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50">
                    <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-slate-500">Top Performer of the Week</p>
                    <p className="text-[10px] font-semibold text-slate-900">{m.weekly.topPerformer?.employee.name ?? "—"}</p>
                  </div>
                  <div className="text-right text-[8px] text-slate-500">
                    Highest conversion
                    <br />
                    <span className="font-bold text-emerald-600">
                      {m.weekly.topPerformer ? pct1(m.weekly.topPerformer.conversion) : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50">
                    <CircleAlert className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-slate-500">Biggest Bottleneck</p>
                    <p className="text-[10px] font-semibold text-slate-900">Follow-ups</p>
                  </div>
                  <p className="text-right text-[8px] text-slate-500">
                    {m.followupsDueToday} due today | {m.overdueFollowups} overdue
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-slate-500">Leads Pending for Action</p>
                  </div>
                  <p className="text-[13px] font-bold text-slate-900">{m.weekly.leadsPendingAction}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Advanced tracking: stage durations, SLA escalations, source conversion */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Clock3} title="Average Time per Stage" />
            <div className="px-3 py-2">
              <select
                value={stageView}
                onChange={(e) => setStageView(e.target.value)}
                className="mb-2 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700"
              >
                <option value="__all">Whole team</option>
                {employees.filter((e) => e.active !== false).map((e) => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
              {stageRows.length === 0 && (
                <p className="py-3 text-[10px] text-slate-500">No stage-change history yet.</p>
              )}
              {stageRows.map((r) => {
                const max = Math.max(...stageRows.map((x) => x.avgHours), 1);
                return (
                  <div key={r.stage} className="mb-1.5">
                    <div className="flex justify-between text-[9px] text-slate-500">
                      <span>{r.stage}</span>
                      <span className="font-bold text-slate-900">{fmtDur(r.avgHours)} <span className="text-slate-400">({r.samples})</span></span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                      <div className="h-1.5 rounded bg-teal-600" style={{ width: `${(r.avgHours / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={AlertTriangle} title={`SLA Escalations (${m.escalations.length})`} />
            <div className="px-3 py-2">
              {m.escalations.length === 0 && (
                <p className="py-3 text-[10px] text-slate-500">Nothing overdue right now.</p>
              )}
              {m.escalations.slice(0, 8).map(({ query, overdueHours }) => (
                <Link
                  key={query.id}
                  to="/query/$queryId"
                  params={{ queryId: query.query_id }}
                  className="flex items-center gap-2 border-b border-slate-100 py-1.5 last:border-0"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdueHours > 24 ? "bg-red-500" : "bg-amber-400"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold text-slate-900">{query.query_id} · {query.customer}</p>
                    <p className="text-[9px] text-slate-500">{query.owner || "Unassigned"} · {query.stage}</p>
                  </div>
                  <span className={`text-[9px] font-bold ${overdueHours > 24 ? "text-red-600" : "text-amber-600"}`}>
                    {overdueHours > 24 ? "CRITICAL " : ""}{fmtDur(overdueHours)}
                  </span>
                </Link>
              ))}
              {m.criticalEscalations.length > 0 && (
                <p className="pt-2 text-[9px] text-red-600">
                  {m.criticalEscalations.length} overdue by more than 24 hours.
                </p>
              )}
            </div>
          </section>

          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Target} title="Conversion by Lead Source" />
            <div className="px-3 py-2">
              {m.sourceStats.length === 0 && (
                <p className="py-3 text-[10px] text-slate-500">No leads yet.</p>
              )}
              {m.sourceStats.slice(0, 8).map((s) => (
                <div key={s.name} className="border-b border-slate-100 py-1.5 last:border-0">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-700">{s.name}</span>
                    <span className="font-bold text-teal-600">{s.conversion.toFixed(0)}%</span>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    {s.total} leads · {s.won} won · {s.lost} lost · {s.open} open
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>


        {/* Bottom row */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.95fr_0.72fr]">
          {/* Recent activity */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Activity} title="Recent Team Activity / Alerts" />
            <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
              {[recent.slice(0, half), recent.slice(half)].map((column, ci) => (
                <div key={ci}>
                  {column.map((e) => {
                    const bad = BAD_EVENTS.includes(e.type);
                    return (
                      <div key={e.id} className="flex gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            bad ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                          }`}
                        >
                          {bad ? (
                            <AlertCircle className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold text-slate-900">{e.title}</p>
                          <p className="truncate text-[8px] text-slate-500">{e.detail ?? e.query_id ?? ""}</p>
                        </div>
                        <span className="shrink-0 text-[8px] text-slate-500">{timeOf(e.at)}</span>
                      </div>
                    );
                  })}
                  {column.length === 0 && ci === 0 && (
                    <div className="px-3 py-6 text-center text-[9px] text-slate-500">No activity recorded yet.</div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 px-4 py-2 text-center">
              <Link to="/notifications" className="text-[10px] font-medium text-teal-600 hover:text-teal-700">
                View all activities →
              </Link>
            </div>
          </section>

          {/* Partners */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Top Travel Partners"
              right={<span className="text-[10px] text-slate-500">by Revenue</span>}
            />
            <div>
              {m.partners.map((p, index) => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-[9px] font-bold text-teal-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-700">
                    {p.name}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-900">
                    {inr(p.revenue)}
                  </span>
                  <span className="w-9 text-right text-[9px] text-slate-500">
                    {Math.round(p.share)}%
                  </span>
                </div>
              ))}
              {m.partners.length === 0 && (
                <div className="px-3 py-6 text-center text-[9px] text-slate-500">No partner revenue yet.</div>
              )}
            </div>
            <div className="border-t border-slate-200 px-4 py-2 text-center">
              <Link to="/agents" className="text-[10px] font-medium text-teal-600 hover:text-teal-700">
                View all partners →
              </Link>
            </div>
          </section>

          {/* Quick actions */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={ListChecks} title="Quick Actions" />
            <div className="grid grid-cols-2 gap-2 p-3">
              <AssignLeadsDialog
                trigger={
                  <button
                    type="button"
                    className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-[9px] font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50"
                  >
                    <Users className="h-5 w-5 text-teal-600" />
                    Assign Leads ({m.pipeline.find((p) => p.label === "New")?.value ?? 0})
                  </button>
                }
              />
              <NewTaskDialog
                trigger={
                  <button
                    type="button"
                    className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-[9px] font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50"
                  >
                    <ListChecks className="h-5 w-5 text-emerald-600" />
                    Assign Task
                  </button>
                }
              />
              <Link
                to="/query-tracker"
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-[9px] font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50"
              >
                <CalendarDays className="h-5 w-5 text-red-600" />
                Review Overdues ({m.overdueFollowups})
              </Link>
              <Link
                to="/reports"
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-[9px] font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Team Performance ({employees.length})
              </Link>
              <button
                onClick={() =>
                  exportWeeklyReview([
                    ["Metric", "Value"],
                    ["New Leads Today", String(m.newLeadsToday)],
                    ["Leads Assigned Today", String(m.leadsAssignedToday)],
                    ["Tasks Completed Today", String(m.tasksCompletedToday)],
                    ["Pending Quotations", String(m.pendingQuotations)],
                    ["Follow-ups Due Today", String(m.followupsDueToday)],
                    ["Overdue Queries", String(m.overdueFollowups)],
                    ["Average Response Time", hm(m.weekly.avgResponseHours)],
                    ["Average Quotation Turnaround", hm(m.weekly.avgQuotationHours)],
                    ["Team Conversion Rate", pct2(m.weekly.conversion)],
                    ["Leads Pending for Action", String(m.weekly.leadsPendingAction)],
                    ["Total Pipeline Value", String(m.totalPipelineValue)],
                  ])
                }
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-[9px] font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50"
              >
                <Download className="h-5 w-5 text-slate-600" />
                Export Weekly Review
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}