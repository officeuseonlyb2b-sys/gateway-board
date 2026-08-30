// Derived CRM metrics. EVERY number shown anywhere in the CRM comes from here,
// which in turn reads only from src/lib/crm/store.ts — one source of truth.
import { useMemo } from "react";
import type { CrmEvent, CrmQuery, CrmTask, Employee, Stage } from "./types";
import { STAGES } from "./types";
import { useCrmEvents, useCrmQueries, useCrmTasks, useEmployees } from "./store";

export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const sameDay = (a: string | Date, b: Date) =>
  startOfDay(new Date(a)).getTime() === startOfDay(b).getTime();

const OPEN_STAGES: Stage[] = ["New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up", "Nurturing"];
export const isOpen = (q: CrmQuery) => OPEN_STAGES.includes(q.stage);

export interface WorkloadRow {
  employee: Employee;
  assigned: number;
  newToday: number;
  inProgress: number;
  quotations: number;
  completedToday: number;
  overdue: number;
  nurturing: number;
  confirmed: number;
  conversion: number;   // %
  revenue: number;      // pipeline value
  // today's snapshot
  leadsReceived: number;
  leadsAssigned: number;
  quotesSentToday: number;
  followupsDoneToday: number;
  tasksClosedToday: number;
}

export interface CrmMetrics {
  queries: CrmQuery[];
  tasks: CrmTask[];
  employees: Employee[];
  events: CrmEvent[];
  today: Date;

  // shared counters (used by both Query Tracker and dashboards)
  totalQueries: number;
  activeQueries: number;
  quotesSentToday: number;
  followupsDueToday: number;
  overdueFollowups: number;
  newLeadsToday: number;
  leadsAssignedToday: number;
  tasksCompletedToday: number;
  pendingQuotations: number;

  // yesterday comparison
  prev: {
    newLeads: number; assigned: number; tasksCompleted: number;
    followupsDue: number; overdue: number; pendingQuotations: number;
  };

  workload: WorkloadRow[];
  pipeline: { label: Stage; value: number; pct: number }[];
  monthly: {
    label: string; prevLabel: string;
    totalLeads: number; quotesSent: number; confirmed: number; lost: number; nurturing: number; conversion: number;
    prevTotalLeads: number; prevQuotesSent: number; prevConfirmed: number; prevLost: number; prevNurturing: number; prevConversion: number;
  };
  partners: { name: string; revenue: number; share: number }[];
  weekly: {
    avgResponseHours: number;
    avgQuotationHours: number;
    conversion: number;
    topPerformer?: WorkloadRow;
    leadsPendingAction: number;
  };
  totalPipelineValue: number;
  avgLeadsPerExecutive: number;
}

function hoursBetween(a?: string, b?: string) {
  if (!a || !b) return 0;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5);
}

export function computeMetrics(
  queries: CrmQuery[], tasks: CrmTask[], employees: Employee[], events: CrmEvent[],
): CrmMetrics {
  const today = startOfDay(new Date());
  const yesterday = new Date(today.getTime() - 864e5);

  const evOn = (type: CrmEvent["type"], day: Date, by?: string) =>
    events.filter((e) => e.type === type && sameDay(e.at, day) && (!by || e.by === by)).length;

  const active = queries.filter(isOpen);
  const dueOn = (day: Date, list = queries) => list.filter((q) => isOpen(q) && sameDay(q.followup_due, day)).length;
  const overdueList = (list = queries) =>
    list.filter((q) => isOpen(q) && new Date(q.followup_due).getTime() < today.getTime());

  const pendingQuotations = queries.filter((q) => q.stage === "Costing" || q.stage === "Quotation Sent").length;

  const roster: Employee[] = employees.length ? employees : [];
  const workload: WorkloadRow[] = roster
    .filter((e) => e.active !== false)
    .map((employee) => {
      const mine = queries.filter((q) => q.owner === employee.name);
      const mineActive = mine.filter(isOpen);
      const confirmed = mine.filter((q) => q.stage === "Confirmed").length;
      const closed = mine.filter((q) => q.stage === "Confirmed" || q.stage === "Lost").length;
      return {
        employee,
        assigned: mineActive.length,
        newToday: mine.filter((q) => sameDay(q.created_at, today)).length,
        inProgress: mine.filter((q) => q.stage === "Requirement Review" || q.stage === "Costing").length,
        quotations: mine.filter((q) => q.stage === "Quotation Sent").length,
        completedToday: evOn("task_completed", today, employee.name),
        overdue: overdueList(mine).length,
        nurturing: mine.filter((q) => q.stage === "Nurturing" || q.stage === "Follow-up").length,
        confirmed,
        conversion: closed ? (confirmed / closed) * 100 : 0,
        revenue: mine.filter((q) => q.stage === "Confirmed").reduce((s, q) => s + q.value, 0)
          || mineActive.reduce((s, q) => s + q.value, 0),
        leadsReceived: mine.filter((q) => sameDay(q.created_at, today)).length,
        leadsAssigned: evOn("lead_assigned", today, employee.name),
        quotesSentToday: evOn("quotation_sent", today, employee.name),
        followupsDoneToday: evOn("followup_logged", today, employee.name),
        tasksClosedToday: evOn("task_completed", today, employee.name),
      };
    })
    .sort((a, b) => b.assigned - a.assigned);

  const pipeline = STAGES.map((label) => {
    const value = queries.filter((q) => q.stage === label).length;
    return { label, value, pct: queries.length ? (value / queries.length) * 100 : 0 };
  });

  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const thisMonth = monthKey(today);
  const inMonth = (q: CrmQuery, m: number) => monthKey(new Date(q.created_at)) === m;
  const monthStats = (m: number) => {
    const list = queries.filter((q) => inMonth(q, m));
    const confirmed = list.filter((q) => q.stage === "Confirmed").length;
    return {
      total: list.length,
      quotes: list.filter((q) => ["Quotation Sent", "Follow-up", "Confirmed", "Lost"].includes(q.stage)).length,
      confirmed,
      lost: list.filter((q) => q.stage === "Lost").length,
      nurturing: list.filter((q) => q.stage === "Nurturing").length,
      conversion: list.length ? (confirmed / list.length) * 100 : 0,
    };
  };
  const cur = monthStats(thisMonth);
  const prevM = monthStats(thisMonth - 1);
  const monthName = (offset: number) => {
    const d = new Date(today); d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  };

  const partnerMap = new Map<string, number>();
  queries.forEach((q) => partnerMap.set(q.customer, (partnerMap.get(q.customer) ?? 0) + q.value));
  const partnerTotal = [...partnerMap.values()].reduce((s, v) => s + v, 0);
  const partners = [...partnerMap.entries()]
    .map(([name, revenue]) => ({ name, revenue, share: partnerTotal ? (revenue / partnerTotal) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

  // ---- stage durations from REAL stage-change events ----
  const stageEvents = events.filter((e) => e.to_stage && typeof e.duration_hours === "number");
  const ownerOf = (queryId?: string) => queries.find((q) => q.query_id === queryId)?.owner ?? "";

  const stageAverages = STAGES.map((stage) => {
    const samples = stageEvents.filter((e) => e.from_stage === stage).map((e) => e.duration_hours!);
    return { stage, avgHours: avg(samples), samples: samples.length };
  });

  const stageAveragesByEmployee = new Map<string, { stage: Stage; avgHours: number; samples: number }[]>();
  roster.forEach((emp) => {
    stageAveragesByEmployee.set(
      emp.name,
      STAGES.map((stage) => {
        const samples = stageEvents
          .filter((e) => e.from_stage === stage && ownerOf(e.query_id) === emp.name)
          .map((e) => e.duration_hours!);
        return { stage, avgHours: avg(samples), samples: samples.length };
      }),
    );
  });

  // Response time = how long a query sat in "New" before someone moved it on.
  const respSamples = stageEvents.filter((e) => e.from_stage === "New").map((e) => e.duration_hours!);
  // Quotation turnaround = lead creation → the quotation_sent event.
  const quoteSamples = events
    .filter((e) => e.type === "quotation_sent" && e.query_id)
    .map((e) => hoursBetween(queries.find((q) => q.query_id === e.query_id)?.created_at, e.at))
    .filter((h) => h > 0);

  // ---- source / partner conversion analytics ----
  const bucketStats = (keyOf: (q: CrmQuery) => string) => {
    const map = new Map<string, { total: number; won: number; lost: number; open: number; value: number }>();
    queries.forEach((q) => {
      const key = keyOf(q) || "Unspecified";
      const row = map.get(key) ?? { total: 0, won: 0, lost: 0, open: 0, value: 0 };
      row.total++;
      if (q.stage === "Confirmed") { row.won++; row.value += q.value; }
      else if (q.stage === "Lost") row.lost++;
      else row.open++;
      map.set(key, row);
    });
    return [...map.entries()]
      .map(([name, r]) => ({ name, ...r, conversion: r.total ? (r.won / r.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  };
  const sourceStats = bucketStats((q) => q.lead_source);
  const partnerStats = bucketStats((q) => q.customer);

  // ---- weekly employee / team trends from real event timestamps ----
  const weekStart = (d: Date) => {
    const x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
    return x;
  };
  const weeks: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 7; i >= 0; i--) {
    const s = weekStart(new Date(today.getTime() - i * 7 * 864e5));
    const e = new Date(s.getTime() + 7 * 864e5);
    weeks.push({ key: s.toISOString().slice(0, 10), label: s.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), start: s, end: e });
  }
  const inRange = (at: string, s: Date, e: Date) => {
    const t = new Date(at).getTime();
    return t >= s.getTime() && t < e.getTime();
  };
  const trends = weeks.map(({ key, label, start, end }) => {
    const created = events.filter((e) => e.type === "lead_created" && inRange(e.at, start, end));
    const won = events.filter((e) => e.type === "won" && inRange(e.at, start, end));
    const lost = events.filter((e) => e.type === "lost" && inRange(e.at, start, end));
    const byEmployee: Record<string, { leads: number; won: number; lost: number; conversion: number }> = {};
    roster.forEach((emp) => {
      const l = created.filter((e) => ownerOf(e.query_id) === emp.name || e.by === emp.name).length;
      const w = won.filter((e) => e.by === emp.name || ownerOf(e.query_id) === emp.name).length;
      const ls = lost.filter((e) => e.by === emp.name || ownerOf(e.query_id) === emp.name).length;
      byEmployee[emp.name] = { leads: l, won: w, lost: ls, conversion: w + ls ? (w / (w + ls)) * 100 : 0 };
    });
    return {
      key, label,
      leads: created.length, won: won.length, lost: lost.length,
      conversion: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
      byEmployee,
    };
  });

  // ---- SLA escalations (live, from current time) ----
  const nowMs = Date.now();
  const escalations = queries
    .filter((q) => isOpen(q) && new Date(q.followup_due).getTime() < nowMs)
    .map((q) => ({ query: q, overdueHours: (nowMs - new Date(q.followup_due).getTime()) / 36e5 }))
    .sort((a, b) => b.overdueHours - a.overdueHours);
  const criticalEscalations = escalations.filter((e) => e.overdueHours > 24);

  const closedAll = queries.filter((q) => q.stage === "Confirmed" || q.stage === "Lost").length;
  const conversion = queries.length
    ? (queries.filter((q) => q.stage === "Confirmed").length / queries.length) * 100
    : 0;


  return {
    queries, tasks, employees: roster, events, today,
    totalQueries: queries.length,
    activeQueries: active.length,
    quotesSentToday: evOn("quotation_sent", today),
    followupsDueToday: dueOn(today),
    overdueFollowups: overdueList().length,
    newLeadsToday: queries.filter((q) => sameDay(q.created_at, today)).length,
    leadsAssignedToday: evOn("lead_assigned", today),
    tasksCompletedToday: evOn("task_completed", today),
    pendingQuotations,
    prev: {
      newLeads: queries.filter((q) => sameDay(q.created_at, yesterday)).length,
      assigned: evOn("lead_assigned", yesterday),
      tasksCompleted: evOn("task_completed", yesterday),
      followupsDue: dueOn(yesterday),
      overdue: queries.filter((q) => isOpen(q) && new Date(q.followup_due).getTime() < yesterday.getTime()).length,
      pendingQuotations,
    },
    workload,
    pipeline,
    monthly: {
      label: monthName(0), prevLabel: monthName(-1),
      totalLeads: cur.total, quotesSent: cur.quotes, confirmed: cur.confirmed, lost: cur.lost,
      nurturing: cur.nurturing, conversion: cur.conversion,
      prevTotalLeads: prevM.total, prevQuotesSent: prevM.quotes, prevConfirmed: prevM.confirmed,
      prevLost: prevM.lost, prevNurturing: prevM.nurturing, prevConversion: prevM.conversion,
    },
    partners,
    weekly: {
      avgResponseHours: avg(respSamples),
      avgQuotationHours: avg(quoteSamples),
      conversion: closedAll ? conversion : conversion,
      topPerformer: [...workload].sort((a, b) => b.conversion - a.conversion)[0],
      leadsPendingAction: queries.filter((q) => q.stage === "New" || q.stage === "Requirement Review").length,
    },
    totalPipelineValue: active.reduce((s, q) => s + q.value, 0),
    avgLeadsPerExecutive: workload.length ? active.length / workload.length : 0,
  };
}

export function useCrmMetrics(): CrmMetrics {
  const queries = useCrmQueries();
  const tasks = useCrmTasks();
  const employees = useEmployees();
  const events = useCrmEvents();
  return useMemo(() => computeMetrics(queries, tasks, employees, events), [queries, tasks, employees, events]);
}

/** Per-employee slice used by the personal dashboard / My Tasks. */
export function usePersonalMetrics(ownerName: string) {
  const m = useCrmMetrics();
  return useMemo(() => {
    const mine = m.queries.filter((q) => q.owner === ownerName);
    const myTasks = m.tasks.filter((t) => t.owner === ownerName);
    const today = m.today;
    return {
      ...m,
      mine,
      myTasks,
      todaysTasks: myTasks.filter((t) => !t.done && new Date(t.due_at).getTime() <= today.getTime() + 864e5)
        .sort((a, b) => (a.due_at < b.due_at ? -1 : 1)),
      newAssigned: mine.filter((q) => q.stage === "New").length,
      quotationsPending: mine.filter((q) => q.stage === "Costing" || q.stage === "Quotation Sent").length,
      followupsDueToday: mine.filter((q) => isOpen(q) && sameDay(q.followup_due, today)).length,
      overdueTasks: myTasks.filter((t) => !t.done && new Date(t.due_at).getTime() < today.getTime()).length,
      tasksCompletedToday: m.events.filter((e) => e.type === "task_completed" && e.by === ownerName && sameDay(e.at, today)).length,
      pipeline: (["New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up", "Nurturing"] as Stage[])
        .map((label) => ({ label, count: mine.filter((q) => q.stage === label).length })),
      nurturing: mine.filter((q) => q.stage === "Nurturing").slice(0, 5),
    };
  }, [m, ownerName]);
}
