// Advanced lead-tracking derivations: daily employee activity, follow-up
// buckets, inactivity detection and smart alerts.
// Everything here is derived from the SAME store as the rest of the CRM
// (src/lib/crm/store.ts) — no duplicate state, no static numbers.
import { useMemo } from "react";
import type { CrmEvent, CrmQuery, CrmTask, Employee, Stage } from "./types";
import { CONTACT_EVENTS, STAGES } from "./types";
import { inactiveHours, useCrmEvents, useCrmQueries, useCrmTasks, useEmployees } from "./store";
import { isOpen, sameDay, startOfDay } from "./metrics";

export type FollowupState = "Completed" | "Overdue" | "Due Today" | "Upcoming" | "None";

export function followupState(q: CrmQuery, now = new Date()): FollowupState {
  if (!isOpen(q)) return "Completed";
  if (!q.followup_due) return "None";
  if (q.followup_done_at && new Date(q.followup_done_at) >= new Date(q.followup_due)) return "Completed";
  const due = new Date(q.followup_due).getTime();
  if (due < now.getTime()) return sameDay(q.followup_due, startOfDay(now)) ? "Due Today" : "Overdue";
  return sameDay(q.followup_due, startOfDay(now)) ? "Due Today" : "Upcoming";
}

export interface DailyRow {
  employee: Employee;
  assigned: number;
  active: number;
  newToday: number;
  contactedToday: number;
  callsToday: number;
  connectedToday: number;
  followupsDoneToday: number;
  followupsDueToday: number;
  followupsPending: number;
  overdue: number;
  quotationsCreated: number;
  quotationsSent: number;
  converted: number;
  lost: number;
  conversion: number;
  noActivityLeads: number;
  lastActivityAt?: string;
  avgResponseHours: number;
}

export interface InactiveBuckets {
  h24: CrmQuery[];
  h48: CrmQuery[];
  d3: CrmQuery[];
  d7: CrmQuery[];
}

export interface LeadAlert {
  key: string;
  label: string;
  count: number;
  tone: "red" | "orange" | "blue" | "purple";
  queries: CrmQuery[];
}

export interface LeadTracking {
  queries: CrmQuery[];
  tasks: CrmTask[];
  events: CrmEvent[];
  employees: Employee[];
  daily: DailyRow[];
  pipeline: { stage: Stage; count: number }[];
  followups: {
    dueToday: CrmQuery[];
    upcoming: CrmQuery[];
    overdue: CrmQuery[];
    completedToday: CrmQuery[];
    noDate: CrmQuery[];
  };
  inactive: InactiveBuckets;
  unassigned: CrmQuery[];
  highPriority: CrmQuery[];
  urgent: CrmQuery[];
  awaitingQuotation: CrmQuery[];
  alerts: LeadAlert[];
}

export function computeTracking(
  queries: CrmQuery[], tasks: CrmTask[], employees: Employee[], events: CrmEvent[],
): LeadTracking {
  const now = new Date();
  const today = startOfDay(now);

  const evToday = events.filter((e) => sameDay(e.at, today));
  const countToday = (by: string, types: CrmEvent["type"][]) =>
    evToday.filter((e) => e.by === by && types.includes(e.type)).length;

  const openList = queries.filter(isOpen);
  const states = new Map(queries.map((q) => [q.id, followupState(q, now)] as const));

  const bucket = (s: FollowupState) => openList.filter((q) => states.get(q.id) === s);
  const dueToday = bucket("Due Today");
  const upcoming = bucket("Upcoming");
  const overdue = bucket("Overdue");
  const noDate = openList.filter((q) => !q.followup_due);
  const completedToday = queries.filter((q) => q.followup_done_at && sameDay(q.followup_done_at, today));

  const inactiveOf = (min: number, max: number) =>
    openList.filter((q) => {
      const h = inactiveHours(q);
      return h >= min && h < max;
    });
  const inactive: InactiveBuckets = {
    h24: inactiveOf(24, 48),
    h48: inactiveOf(48, 72),
    d3: inactiveOf(72, 168),
    d7: openList.filter((q) => inactiveHours(q) >= 168),
  };

  const unassigned = queries.filter((q) => isOpen(q) && !q.owner);
  const highPriority = openList.filter((q) => q.priority === "High");
  const urgent = openList.filter((q) => q.priority === "Urgent");
  const awaitingQuotation = openList.filter((q) => q.stage === "Costing" || q.stage === "Requirement Review");

  const daily: DailyRow[] = employees
    .filter((e) => e.active !== false)
    .map((employee) => {
      const mine = queries.filter((q) => q.owner === employee.name);
      const mineOpen = mine.filter(isOpen);
      const converted = mine.filter((q) => q.stage === "Confirmed").length;
      const lost = mine.filter((q) => q.stage === "Lost").length;
      const myEvents = events.filter((e) => e.by === employee.name);
      const lastActivityAt = myEvents.reduce<string | undefined>(
        (acc, e) => (!acc || e.at > acc ? e.at : acc), undefined,
      );
      const respSamples = myEvents
        .filter((e) => e.from_stage === "New" && typeof e.duration_hours === "number")
        .map((e) => e.duration_hours!);
      const contactedLeadIds = new Set(
        evToday.filter((e) => e.by === employee.name && CONTACT_EVENTS.includes(e.type) && e.query_id).map((e) => e.query_id!),
      );
      return {
        employee,
        assigned: mine.length,
        active: mineOpen.length,
        newToday: mine.filter((q) => sameDay(q.created_at, today)).length,
        contactedToday: contactedLeadIds.size,
        callsToday: countToday(employee.name, ["call_made", "call_connected", "call_not_connected"]),
        connectedToday: countToday(employee.name, ["call_connected"]),
        followupsDoneToday: countToday(employee.name, ["followup_completed", "followup_logged"]),
        followupsDueToday: dueToday.filter((q) => q.owner === employee.name).length,
        followupsPending: mineOpen.filter((q) => {
          const s = states.get(q.id);
          return s === "Upcoming" || s === "Due Today";
        }).length,
        overdue: overdue.filter((q) => q.owner === employee.name).length,
        quotationsCreated: countToday(employee.name, ["quotation_started", "quotation_updated"]),
        quotationsSent: myEvents.filter((e) => e.type === "quotation_sent").length,
        converted,
        lost,
        conversion: converted + lost ? (converted / (converted + lost)) * 100 : 0,
        noActivityLeads: mineOpen.filter((q) => inactiveHours(q) >= 24).length,
        lastActivityAt,
        avgResponseHours: respSamples.length ? respSamples.reduce((s, v) => s + v, 0) / respSamples.length : 0,
      };
    })
    .sort((a, b) => b.assigned - a.assigned);

  const alerts: LeadAlert[] = [
    { key: "unassigned", label: "Unassigned leads", count: unassigned.length, tone: "red", queries: unassigned },
    { key: "due", label: "Follow-ups due today", count: dueToday.length, tone: "blue", queries: dueToday },
    { key: "overdue", label: "Overdue follow-ups", count: overdue.length, tone: "red", queries: overdue },
    {
      key: "inactive", label: "Leads with no activity (24h+)",
      count: inactive.h24.length + inactive.h48.length + inactive.d3.length + inactive.d7.length,
      tone: "orange",
      queries: [...inactive.h24, ...inactive.h48, ...inactive.d3, ...inactive.d7],
    },
    { key: "urgent", label: "Urgent leads", count: urgent.length, tone: "red", queries: urgent },
    { key: "high", label: "High priority leads", count: highPriority.length, tone: "orange", queries: highPriority },
    { key: "quote", label: "Waiting for quotation", count: awaitingQuotation.length, tone: "purple", queries: awaitingQuotation },
    { key: "nodate", label: "No follow-up date set", count: noDate.length, tone: "orange", queries: noDate },
  ];

  return {
    queries, tasks, events, employees,
    daily,
    pipeline: STAGES.map((stage) => ({ stage, count: queries.filter((q) => q.stage === stage).length })),
    followups: { dueToday, upcoming, overdue, completedToday, noDate },
    inactive,
    unassigned, highPriority, urgent, awaitingQuotation,
    alerts,
  };
}

export function useLeadTracking(): LeadTracking {
  const queries = useCrmQueries();
  const tasks = useCrmTasks();
  const employees = useEmployees();
  const events = useCrmEvents();
  return useMemo(() => computeTracking(queries, tasks, employees, events), [queries, tasks, employees, events]);
}
