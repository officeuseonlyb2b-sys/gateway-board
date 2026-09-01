// CRM / Query Tracking data model (leads, queries, tasks, activities).

export type Stage =
  | "New"
  | "Requirement Review"
  | "Costing"
  | "Quotation Sent"
  | "Follow-up"
  | "Nurturing"
  | "Confirmed"
  | "Lost";

export const STAGES: Stage[] = [
  "New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up", "Nurturing", "Confirmed", "Lost",
];

/** Stages shown as the lifecycle stepper on the detail page. */
export const LIFECYCLE: string[] = [
  "New", "Assigned", "Requirement Review", "Costing", "Quotation Sent", "Follow-up", "Confirmed / Lost",
];

export const LEAD_SOURCES = [
  "Website", "Phone Call", "Email", "Referral", "Walk-in", "Social Media", "Google / Ads", "Exhibition", "Repeat Guest",
];

export const MARKETS = ["Domestic - India", "Inbound - Europe", "Inbound - USA", "Inbound - Asia", "MICE / Corporate"];

export const ENQUIRY_TYPES = [
  "Tour Package", "Customized Tour", "Group Tour", "MICE / Corporate", "Only Hotel Booking", "Only Transport", "Pilgrimage",
];

export const TRAVEL_TYPES = ["Family Tour", "Group Tour", "Pilgrimage", "Honeymoon", "Corporate", "Solo", "Wildlife"];

export const DESTINATIONS = [
  "Madhya Pradesh", "Rajasthan", "Gujarat", "Uttar Pradesh", "Maharashtra", "Kerala", "Golden Triangle",
];

export const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

export interface LifecycleStep {
  label: string;
  at?: string; // ISO datetime, absent = not reached
}

export interface ActivityItem {
  id: string;
  title: string;
  at: string;
  by: string;
  meta?: string;
}

export interface CrmTask {
  id: string;
  title: string;
  query_id: string;
  due_at: string;
  note?: string;
  owner: string;
  done: boolean;
  assigned_by?: string;
  assigned_at?: string;
  priority?: string;
  completed_at?: string;
}


export interface Commercials {
  cost_price: number;
  selling_price: number;
  commission_pct: number;
}

export interface CrmQuery {
  id: string;
  query_id: string;
  lead_id: string;
  created_at: string;
  assigned_on: string;

  // Lead / customer
  lead_source: string;
  customer: string;        // travel partner / source partner
  contact_person: string;
  mobile: string;
  email: string;
  market: string;
  priority: string;
  requirement: string;

  // Trip
  enquiry_type: string;
  travel_type: string;
  destination: string;
  travel_start: string;    // yyyy-mm-dd
  travel_end: string;
  pax: number;
  adults: number;
  children: number;

  // Progress
  stage: Stage;
  owner: string;
  value: number;
  next_action: string;
  followup_due: string;    // ISO datetime
  lifecycle: LifecycleStep[];
  activities: ActivityItem[];
  commercials: Commercials;

  // --- ownership / tracking (optional so existing records keep working) ---
  assigned_by?: string;
  last_updated_by?: string;
  last_activity_at?: string;
  followup_note?: string;
  followup_done_at?: string;
}


export interface Executive {
  id: string;
  name: string;
  role: "Sales Executive" | "Sales Manager";
  email: string;
}

export interface Employee extends Executive {
  phone?: string;
  target_monthly?: number;
  active: boolean;
  joined_at: string; // ISO
}

/** Every tracked employee action in the CRM. */
export type CrmEventType =
  | "lead_created"
  | "lead_assigned"
  | "lead_reassigned"
  | "task_assigned"
  | "task_reassigned"
  | "stage_changed"
  | "quotation_sent"
  | "followup_logged"
  | "task_completed"
  | "note_added"
  | "followup_overdue"
  | "task_overdue"
  | "won"
  | "lost"
  // --- advanced lead tracking ---
  | "lead_viewed"
  | "call_made"
  | "call_connected"
  | "call_not_connected"
  | "whatsapp_sent"
  | "email_sent"
  | "followup_created"
  | "followup_completed"
  | "followup_missed"
  | "quotation_started"
  | "quotation_updated"
  | "customer_replied"
  | "negotiation_started"
  | "priority_changed";

export interface CrmEvent {
  id: string;
  type: CrmEventType;
  at: string;          // ISO datetime
  by: string;          // who performed the action
  title: string;
  detail?: string;
  query_id?: string;
  lead_id?: string;
  /** assignment tracking */
  assigned_to?: string;
  assigned_from?: string;
  assign_reason?: string;
  task_id?: string;
  /** generic previous → new value tracking (status, priority, owner, …) */
  prev_value?: string;
  new_value?: string;
  /** stage-change tracking (before / after + how long it sat in from_stage) */
  from_stage?: Stage;
  to_stage?: Stage;
  duration_hours?: number;
  /** overdue tracking */
  overdue_hours?: number;
}

export const EVENT_LABELS: Record<CrmEventType, string> = {
  lead_created: "Lead created",
  lead_assigned: "Assigned",
  lead_reassigned: "Reassigned",
  task_assigned: "Task added",
  task_reassigned: "Task reassigned",
  stage_changed: "Stage changed",
  quotation_sent: "Quotation sent",
  followup_logged: "Follow-up logged",
  task_completed: "Task completed",
  note_added: "Note added",
  followup_overdue: "Follow-up overdue",
  task_overdue: "Task overdue",
  won: "Marked Won",
  lost: "Marked Lost",
  lead_viewed: "Lead viewed",
  call_made: "Call made",
  call_connected: "Call connected",
  call_not_connected: "Call not connected",
  whatsapp_sent: "WhatsApp sent",
  email_sent: "Email sent",
  followup_created: "Follow-up added",
  followup_completed: "Follow-up completed",
  followup_missed: "Follow-up missed",
  quotation_started: "Quotation started",
  quotation_updated: "Quotation updated",
  customer_replied: "Customer replied",
  negotiation_started: "Negotiation started",
  priority_changed: "Priority changed",
};

/** Activity event types that count as "the employee worked this lead". */
export const CONTACT_EVENTS: CrmEventType[] = [
  "call_made", "call_connected", "call_not_connected", "whatsapp_sent", "email_sent",
  "followup_logged", "followup_completed", "customer_replied", "negotiation_started",
];

export const LEAD_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];



