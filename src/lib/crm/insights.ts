import type { CrmEvent, CrmQuery, CrmTask } from "./types";

const HOUR = 36e5;
export const hoursBetween = (from?: string, to?: string) => {
  if (!from) return 0;
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, (end - new Date(from).getTime()) / HOUR);
};

export const durationLabel = (hours: number) => {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return `${days}d${remainder ? ` ${remainder}h` : ""}`;
};

export function queryClock(query: CrmQuery) {
  return {
    assignmentWait: hoursBetween(query.created_at, query.assigned_at),
    firstResponse: query.first_action_at
      ? hoursBetween(query.assigned_at || query.created_at, query.first_action_at)
      : null,
    quotationTat: query.first_quotation_sent_at
      ? hoursBetween(query.created_at, query.first_quotation_sent_at)
      : null,
    stageAge: hoursBetween(query.stage_changed_at || query.created_at),
    queryAge: hoursBetween(query.created_at),
    salesCycle: query.closed_at ? hoursBetween(query.created_at, query.closed_at) : null,
  };
}

export type AttentionLevel = "Critical" | "Attention" | "Upcoming" | "Healthy";
export function attentionFor(query: CrmQuery, tasks: CrmTask[] = []) {
  const now = Date.now();
  const due = query.followup_due ? new Date(query.followup_due).getTime() : 0;
  const travel = query.travel_start ? new Date(query.travel_start).getTime() : 0;
  const openTasks = tasks.filter((task) => task.query_id === query.query_id && !task.done);
  if (due && due < now - 48 * HOUR)
    return {
      level: "Critical" as AttentionLevel,
      reason: "Follow-up overdue by more than 48 hours",
    };
  if (query.assignment_status !== "Assigned" && hoursBetween(query.created_at) > 4)
    return { level: "Critical" as AttentionLevel, reason: "Waiting for assignment beyond 4 hours" };
  if (
    query.assignment_status === "Assigned" &&
    !query.first_action_at &&
    hoursBetween(query.assigned_at) > 4
  )
    return { level: "Attention" as AttentionLevel, reason: "First action SLA is at risk" };
  if (["Quotation Sent", "Follow-up", "Nurturing"].includes(query.stage) && !query.followup_due)
    return { level: "Attention" as AttentionLevel, reason: "No next follow-up scheduled" };
  if (openTasks.some((task) => new Date(task.due_at).getTime() < now))
    return { level: "Attention" as AttentionLevel, reason: "An open task is overdue" };
  if (travel && travel > now && travel - now < 7 * 24 * HOUR)
    return { level: "Upcoming" as AttentionLevel, reason: "Travel begins within 7 days" };
  return { level: "Healthy" as AttentionLevel, reason: "No immediate exception" };
}

export const stageEnteredAtFromEvents = (query: CrmQuery, events: CrmEvent[]) =>
  events
    .filter((event) => event.query_id === query.query_id && event.to_stage === query.stage)
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.at ||
  query.stage_changed_at ||
  query.created_at;
