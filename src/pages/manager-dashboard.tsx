import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
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
import { useCrmEvents, useEmployees } from "@/lib/crm/store";
import { useCrmMetrics, type WorkloadRow } from "@/lib/crm/metrics";
import type { CrmEvent } from "@/lib/crm/types";
import { AssignLeadsDialog, NewTaskDialog } from "@/components/crm/assign";

const navCardClass =
  "rounded-xl border border-[#173b5e] bg-[#06223c] shadow-[0_8px_24px_rgba(0,0,0,0.18)]";

const smallLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.02em] text-[#9db1c7]";

const DONUT_COLORS = ["#1767d8", "#f59a05", "#38a94c", "#7042c7", "#1ca6bd", "#d95a8a", "#8ea832"];

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
    "bg-[#a58b65]",
    "bg-[#b56e5f]",
    "bg-[#5d9a68]",
    "bg-[#6f5a9f]",
    "bg-[#4d7698]",
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
        positive ? "text-[#58c83f]" : "text-[#ff5a63]"
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

function KpiCard({
  title,
  value,
  prev,
  icon: Icon,
  iconClass,
  invert = false,
}: {
  title: string;
  value: number;
  prev: number;
  icon: typeof Users;
  iconClass: string;
  /** true = growth is bad (overdue, follow-ups) */
  invert?: boolean;
}) {
  const d = delta(value, prev);
  return (
    <div className={`${navCardClass} min-w-0 p-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[12px] font-medium text-[#d5e0eb]">
              {title}
            </p>
            <Trend value={d.value} positive={invert ? !d.positive : d.positive} />
          </div>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-[27px] font-bold leading-none tracking-tight text-white">
              {value}
            </p>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[#8ca4bb]">
            vs yesterday
            <br />
            <span className="text-[#a9bacb]">({prev})</span>
          </p>
        </div>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
      </div>
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
    <div className="flex items-center justify-between gap-3 border-b border-[#173b5e] px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[#d6e3ee]" />
        <h2 className="truncate text-[14px] font-bold text-white">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function DonutChart({ slices, total }: { slices: { value: number; color: string }[]; total: number }) {
  const gradient = useMemo(() => {
    if (!total) return "conic-gradient(#123a5c 0deg 360deg)";
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
      <div className="absolute inset-[28px] flex flex-col items-center justify-center rounded-full bg-[#06213a]">
        <span className="text-[25px] font-bold text-white">{total}</span>
        <span className="text-[10px] text-[#91a8bd]">Active Leads</span>
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
                ? "text-[#5fd34b]"
                : stage.label === "Lost"
                  ? "text-[#ff6268]"
                  : "text-[#c7d4e1]"
            }`}
          >
            {stage.label}
          </span>
          <div className="h-2 overflow-hidden bg-transparent">
            <div
              className={`h-full rounded-r-sm ${
                stage.label === "Confirmed"
                  ? "bg-[#49bf3a]"
                  : stage.label === "Lost"
                    ? "bg-[#ef4b51]"
                    : "bg-[#2674dc]"
              }`}
              style={{ width: `${(stage.value / max) * 100}%` }}
            />
          </div>
          <span className="text-right text-[9px] text-[#d9e3ed]">
            {stage.value}
          </span>
          <span className="text-right text-[9px] text-[#9cb0c4]">
            {pct1(stage.pct)}
          </span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-[#173b5e] pt-2 text-[10px]">
        <span className="font-semibold text-white">Total</span>
        <span className="text-[#d4e0eb]">{total}</span>
        <span className="text-[#9cb0c4]">100%</span>
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
    <div className="min-h-full w-full bg-[#03182b] text-white">
      <div className="mx-auto w-full max-w-[1500px] px-3 pb-5 pt-3 sm:px-4 lg:px-5">
        {/* Page heading */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[21px] font-bold tracking-tight text-white sm:text-[23px]">
                Manager Dashboard — Sales &amp; Queries
              </h1>
              <TrendingUp className="h-5 w-5 text-[#ffd000]" />
            </div>
            <p className="mt-0.5 text-[11px] text-[#91a8bd]">
              360° team performance, assignments, and weekly review overview.
            </p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard title="New Leads Today" value={m.newLeadsToday} prev={m.prev.newLeads} icon={Users} iconClass="bg-[#1767d8]" />
          <KpiCard title="Leads Assigned Today" value={m.leadsAssignedToday} prev={m.prev.assigned} icon={Users} iconClass="bg-[#f28a00]" />
          <KpiCard title="Tasks Completed Today" value={m.tasksCompletedToday} prev={m.prev.tasksCompleted} icon={CheckCircle2} iconClass="bg-[#21b94d]" />
          <KpiCard title="Pending Quotations" value={m.pendingQuotations} prev={m.prev.pendingQuotations} icon={FileText} iconClass="bg-[#7627c8]" />
          <KpiCard title="Follow-ups Due Today" value={m.followupsDueToday} prev={m.prev.followupsDue} icon={CalendarDays} iconClass="bg-[#1767d8]" invert />
          <KpiCard title="Overdue Queries" value={m.overdueFollowups} prev={m.prev.overdue} icon={CircleAlert} iconClass="bg-[#f3262f]" invert />
        </div>

        {/* Main upper row */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.05fr)_minmax(330px,1fr)]">
          {/* Team workload */}
          <section className={`${navCardClass} min-w-0 overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Team Workload / Executive Performance"
              right={
                <div className="flex items-center gap-2">
                  <button className="hidden h-7 items-center gap-2 rounded-md border border-[#3a5874] bg-[#082640] px-2.5 text-[10px] text-[#d7e1eb] sm:flex">
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
                    className="hidden h-7 items-center gap-1.5 rounded-md border border-[#3a5874] bg-[#082640] px-2.5 text-[10px] text-[#d7e1eb] md:flex"
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
                  <tr className="bg-[#08233d] text-[#d2dce7]">
                    <th className="border-r border-[#173b5e] px-3 py-2 text-left font-medium">
                      Executive
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Assigned
                      <br />
                      Leads
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      New Today
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      In Progress
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Quotations
                      <br />
                      Sent
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Completed
                      <br />
                      Today
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Overdue
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Nurturing
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
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
                      className="border-t border-[#173b5e] hover:bg-[#0a2945]"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar initials={initialsOf(row.employee.name)} index={index} />
                          <div>
                            <div className="font-semibold text-white">
                              {row.employee.name}
                            </div>
                            <div className="text-[9px] text-[#819ab1]">
                              {row.employee.role}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center font-semibold">{row.assigned}</td>
                      <td className="text-center font-semibold">{row.newToday}</td>
                      <td className="text-center font-semibold">{row.inProgress}</td>
                      <td className="text-center font-semibold">{row.quotations}</td>
                      <td className="text-center font-semibold">{row.completedToday}</td>
                      <td className="text-center font-semibold text-[#ff525b]">{row.overdue}</td>
                      <td className="text-center font-semibold">{row.nurturing}</td>
                      <td className="text-center">
                        <span className="font-semibold text-[#d9e4ee]">{pct1(row.conversion)}</span>
                      </td>
                      <td className="px-2 text-center">
                        <span className="font-semibold text-[#dce7ef]">{inr(row.revenue)}</span>
                      </td>
                    </tr>
                  ))}
                  {workload.length === 0 && (
                    <tr className="border-t border-[#173b5e]">
                      <td colSpan={10} className="px-3 py-6 text-center text-[10px] text-[#8ca4bb]">
                        No employees registered yet. Add them in Users &amp; Roles.
                      </td>
                    </tr>
                  )}

                  <tr className="border-t border-[#31526f] bg-[#08243e] font-bold">
                    <td className="px-3 py-2 text-white">Team Total</td>
                    <td className="text-center">{totals.assigned}</td>
                    <td className="text-center">{totals.newToday}</td>
                    <td className="text-center">{totals.inProgress}</td>
                    <td className="text-center">{totals.quotations}</td>
                    <td className="text-center">{totals.completedToday}</td>
                    <td className="text-center text-[#ff525b]">{totals.overdue}</td>
                    <td className="text-center">{totals.nurturing}</td>
                    <td className="text-center">{pct1(m.weekly.conversion)}</td>
                    <td className="text-center">{inr(totals.revenue)}</td>
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
                <span className="text-[10px] text-[#8199ae]">Active Leads</span>
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
                      <span className="truncate text-[#d7e1eb]">{d.name}</span>
                    </div>
                    <span className="shrink-0 font-semibold text-white">
                      {d.value} <span className="text-[#a6b8c9]">({Math.round(d.share)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 border-t border-[#173b5e]">
              <div className="px-4 py-3">
                <p className={smallLabelClass}>Total Active Leads</p>
                <p className="mt-1 text-[17px] font-bold">{m.activeQueries}</p>
              </div>
              <div className="border-l border-[#173b5e] px-4 py-3">
                <p className={smallLabelClass}>Avg. Leads / Executive</p>
                <p className="mt-1 text-[17px] font-bold">{m.avgLeadsPerExecutive.toFixed(1)}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Middle row */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.02fr_1.02fr_1.15fr_1.05fr]">
          {/* Daily snapshot */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Daily Performance Snapshot (Today)"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[430px] border-collapse text-[9px]">
                <thead>
                  <tr className="bg-[#08233d] text-[#9db0c2]">
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
                    <tr key={r.employee.id} className="border-t border-[#173b5e]">
                      <td className="px-3 py-2 font-semibold text-[#dce5ee]">{r.employee.name}</td>
                      {[r.leadsReceived, r.leadsAssigned, r.quotesSentToday, r.followupsDoneToday, r.tasksClosedToday].map((value, index) => (
                        <td key={index} className="px-1 py-2 text-center text-[#d2deea]">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-[#31526f] bg-[#08243e] font-bold">
                    <td className="px-3 py-2">Total</td>
                    <td className="text-center">{totals.leadsReceived}</td>
                    <td className="text-center">{totals.leadsAssigned}</td>
                    <td className="text-center">{totals.quotesSent}</td>
                    <td className="text-center">{totals.followups}</td>
                    <td className="text-center">{totals.tasksClosed}</td>
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
              right={<span className="text-[10px] text-[#9bb0c3]">({monthly.label})</span>}
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
                        ? "border-[#f0c000] bg-[#102c44]"
                        : "border-[#173b5e] bg-[#082640]"
                    }`}
                  >
                    <p className="text-[9px] text-[#b3c1cf]">{card.label}</p>
                    <p className="mt-1 text-[19px] font-bold leading-none">{card.value}</p>
                    <div className="mt-2">
                      <Trend value={d.value} positive={positive} />
                    </div>
                    <p className="mt-1 text-[8px] text-[#829bb0]">
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
                  className="flex items-center gap-2 border-b border-[#173b5e] px-3 py-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8a900]">
                    <Icon className="h-3.5 w-3.5 text-[#ffd000]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] leading-3 text-[#c5d2de]">{label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-white">{value}</p>
                    <Trend value="" positive={positive} />
                  </div>
                </div>
              ))}

              <div className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f0a400]">
                    <TrendingUp className="h-3.5 w-3.5 text-[#ffbf00]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#aabccc]">Top Performer of the Week</p>
                    <p className="text-[10px] font-semibold">{m.weekly.topPerformer?.employee.name ?? "—"}</p>
                  </div>
                  <div className="text-right text-[8px] text-[#9db1c3]">
                    Highest conversion
                    <br />
                    <span className="font-bold text-[#57c53e]">
                      {m.weekly.topPerformer ? pct1(m.weekly.topPerformer.conversion) : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#ef4048]">
                    <CircleAlert className="h-3.5 w-3.5 text-[#ff525b]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#aabccc]">Biggest Bottleneck</p>
                    <p className="text-[10px] font-semibold">Follow-ups</p>
                  </div>
                  <p className="text-right text-[8px] text-[#e5edf4]">
                    {m.followupsDueToday} due today | {m.overdueFollowups} overdue
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#ef4048]">
                    <AlertCircle className="h-3.5 w-3.5 text-[#ff525b]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#aabccc]">Leads Pending for Action</p>
                  </div>
                  <p className="text-[13px] font-bold">{m.weekly.leadsPendingAction}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom row */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_0.95fr_0.72fr]">
          {/* Recent activity */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Activity} title="Recent Team Activity / Alerts" />
            <div className="grid grid-cols-1 divide-y divide-[#173b5e] md:grid-cols-2 md:divide-x md:divide-y-0">
              {[recent.slice(0, half), recent.slice(half)].map((column, ci) => (
                <div key={ci}>
                  {column.map((e) => {
                    const bad = BAD_EVENTS.includes(e.type);
                    return (
                      <div key={e.id} className="flex gap-2 border-b border-[#173b5e] px-3 py-2.5 last:border-b-0">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            bad ? "bg-[#e83840]" : "bg-[#20ae47]"
                          }`}
                        >
                          {bad ? (
                            <AlertCircle className="h-3.5 w-3.5 text-white" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold text-white">{e.title}</p>
                          <p className="truncate text-[8px] text-[#829ab0]">{e.detail ?? e.query_id ?? ""}</p>
                        </div>
                        <span className="shrink-0 text-[8px] text-[#8da4b8]">{timeOf(e.at)}</span>
                      </div>
                    );
                  })}
                  {column.length === 0 && ci === 0 && (
                    <div className="px-3 py-6 text-center text-[9px] text-[#829ab0]">No activity recorded yet.</div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-[#173b5e] px-4 py-2 text-center">
              <Link to="/notifications" className="text-[10px] font-medium text-[#59a8ff] hover:text-white">
                View all activities →
              </Link>
            </div>
          </section>

          {/* Partners */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Top Travel Partners"
              right={<span className="text-[10px] text-[#9db1c3]">by Revenue</span>}
            />
            <div>
              {m.partners.map((p, index) => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 border-b border-[#173b5e] px-3 py-2 last:border-b-0"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#102f4b] text-[9px] font-bold text-[#dce6ef]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium">
                    {p.name}
                  </span>
                  <span className="text-[9px] font-semibold text-[#dce5ed]">
                    {inr(p.revenue)}
                  </span>
                  <span className="w-9 text-right text-[9px] text-[#9fb2c4]">
                    {Math.round(p.share)}%
                  </span>
                </div>
              ))}
              {m.partners.length === 0 && (
                <div className="px-3 py-6 text-center text-[9px] text-[#829ab0]">No partner revenue yet.</div>
              )}
            </div>
            <div className="border-t border-[#173b5e] px-4 py-2 text-center">
              <Link to="/agents" className="text-[10px] font-medium text-[#59a8ff] hover:text-white">
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
                    className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]"
                  >
                    <Users className="h-5 w-5 text-[#ffbd00]" />
                    Assign Leads ({m.pipeline.find((p) => p.label === "New")?.value ?? 0})
                  </button>
                }
              />
              <NewTaskDialog
                trigger={
                  <button
                    type="button"
                    className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]"
                  >
                    <ListChecks className="h-5 w-5 text-[#4ad2a2]" />
                    Assign Task
                  </button>
                }
              />
              <Link
                to="/query-tracker"
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]"
              >
                <CalendarDays className="h-5 w-5 text-[#ff4d55]" />
                Review Overdues ({m.overdueFollowups})
              </Link>
              <Link
                to="/reports"
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]"
              >
                <BarChart3 className="h-5 w-5 text-[#74a9d8]" />
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
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]"
              >
                <Download className="h-5 w-5 text-[#8caecc]" />
                Export Weekly Review
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
