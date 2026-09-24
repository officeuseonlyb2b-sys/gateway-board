// src/lib/crm/types.ts
// CRM / Query Tracking data model (leads, queries, tasks, activities).

export type Stage =
  | "New"
  | "Requirement Review"
  | "Costing"
  | "Quotation Sent"
  | "Follow-up"
  | "Nurturing"
  | "Won"
  | "Lost";

export const STAGES: Stage[] = [
  "New",
  "Requirement Review",
  "Costing",
  "Quotation Sent",
  "Follow-up",
  "Nurturing",
  "Won",
  "Lost",
];

/** Stages shown as the lifecycle stepper on the detail page. */
export const LIFECYCLE: string[] = [
  "New",
  "Assigned",
  "Requirement Review",
  "Costing",
  "Quotation Sent",
  "Follow-up",
  "Won / Lost",
];

export const LEAD_SOURCES = [
  "Website",
  "Phone Call",
  "Email",
  "Referral",
  "Walk-in",
  "Social Media",
  "Google / Ads",
  "Exhibition",
  "Repeat Guest",
];

export const MARKETS = [
  "Domestic - India",
  "Inbound - Europe",
  "Inbound - USA",
  "Inbound - Asia",
  "MICE / Corporate",
];

export const ENQUIRY_TYPES = [
  "Tour Package",
  "Customized Tour",
  "Group Tour",
  "MICE / Corporate",
  "Only Hotel Booking",
  "Only Transport",
  "Pilgrimage",
];

export const TRAVEL_TYPES = [
  "Family Tour",
  "Group Tour",
  "Pilgrimage",
  "Honeymoon",
  "Corporate",
  "Solo",
  "Wildlife",
];

export const DESTINATIONS = [
  "Madhya Pradesh",
  "Rajasthan",
  "Gujarat",
  "Uttar Pradesh",
  "Maharashtra",
  "Kerala",
  "Golden Triangle",
];

export const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

export type AssignmentStatus = "Awaiting Assignment" | "Assigned";
export type WorkStatus = "Open" | "Won" | "Lost";
export type CustomerType = "B2B Agent" | "B2C Client";
export type DataScope = "Own" | "Team" | "Department" | "Unit" | "Organisation" | "Custom";
export type Department =
  | "Sales"
  | "Operations"
  | "Product"
  | "Contracting"
  | "Vendor Management"
  | "Accounts"
  | "Marketing"
  | "Technology"
  | "Management"
  | "Admin";
export type AppRole =
  | "Sales Executive"
  | "Assistant Manager"
  | "Sales Manager"
  | "Sales Head"
  | "Operations Executive"
  | "Unit Head"
  | "Administrator"
  | "Owner / Director"
  | "Product Executive"
  | "Contracting Executive"
  | "Vendor Executive";

export interface AssignmentRecord {
  assigned_at: string;
  assigned_by: string;
  assigned_to: string;
  assigned_from?: string;
  reason?: string;
}

export interface OperationsHandoff {
  id: string;
  status: "Awaiting Operations Acceptance" | "Accepted";
  created_at: string;
  created_by: string;
  accepted_at?: string;
  accepted_by?: string;
  note?: string;
}

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
  closed_reason?: string;
  category?: "Follow-up" | "Query" | "Rate Gap" | "Operations" | "General";
  // NEW: daily progress updates
  updates?: {
    timestamp: string;
    text: string;
    by?: string;
  }[];
}

export interface Commercials {
  cost_price: number;
  selling_price: number;
  commission_pct: number;
  bottom_line?: number;
  top_line?: number;
  final_cost?: number;
  final_selling?: number;
  margin_value?: number;
  margin_pct?: number;
}

export interface CostingVersion {
  version: number;
  saved_at: string;
  saved_by: string;
  draft_id?: string;
  quote: import("@/lib/quotes-store").SavedQuote;
}

export interface CrmQuery {
  id: string;
  query_id: string;
  lead_id: string;
  created_at: string;
  assigned_on: string;
  created_by?: string;
  assignment_status?: AssignmentStatus;
  assigned_at?: string;
  first_action_at?: string;
  stage_changed_at?: string;
  requirement_completed_at?: string;
  costing_started_at?: string;
  costing_completed_at?: string;
  first_quotation_sent_at?: string;
  latest_quotation_sent_at?: string;
  first_followup_at?: string;
  last_followup_at?: string;
  nurturing_at?: string;
  revisit_at?: string;
  manager_escalated_at?: string;
  assignment_history?: AssignmentRecord[];
  work_status?: WorkStatus;
  primary_unit?: string;
  participating_units?: string[];

  // Lead / customer
  lead_source: string;
  customer: string; // travel partner / source partner
  contact_person: string;
  mobile: string;
  email: string;
  market: string;
  priority: string;
  requirement: string;
  customer_type?: CustomerType;
  agent_id?: string;
  agent_contact_id?: string;
  client_id?: string;
  relationship_owner?: string;

  // Trip
  enquiry_type: string;
  travel_type: string;
  destination: string;
  travel_start: string; // yyyy-mm-dd
  travel_end: string;
  pax: number;
  adults: number;
  children: number;
  min_pax?: number;
  max_pax?: number;
  costing_basis?: string;
  hotel_category_from?: string;
  hotel_category_to?: string;
  program_id?: string;
  program_name?: string;
  routing?: string;
  special_requirements?: string;

  // Progress
  stage: Stage;
  owner: string;
  value: number;
  next_action: string;
  followup_due: string; // ISO datetime
  lifecycle: LifecycleStep[];
  activities: ActivityItem[];
  commercials: Commercials;
  costing_versions?: CostingVersion[];

  /** Pricing audience used when a linked quotation is pre-filled. */
  traveler_type?: "indian" | "foreign" | "student";

  // --- ownership / tracking (optional so existing records keep working) ---
  assigned_by?: string;
  last_updated_by?: string;
  last_activity_at?: string;
  followup_note?: string;
  followup_done_at?: string;
  lost_reason?: string;
  lost_notes?: string;
  closed_at?: string;
  operations_handoff?: OperationsHandoff;
  last_costing_prepared_by?: string;
  last_quotation_prepared_by?: string;
  last_quotation_sent_by?: string;
  last_followup_by?: string;
  last_status_changed_by?: string;

  // Source-tracker fields retained during the FY 26-27 Excel migration.
  // These remain optional so newly created Queries and older cloud records
  // continue to use the same authoritative Query model.
  source_serial?: number;
  source_workbook?: string;
  query_market_source?: string;
  query_base_city?: string;
  query_source_type?: string;
  conversation_medium?: string;
  tour_start_city?: string;
  tour_end_city?: string;
  travel_period?: string;
  program_type?: string;
  program_region?: string;
  per_person_package_cost?: number;
  source_followup_dates?: string[];
  source_status_flags?: {
    new_status?: string;
    working?: string;
    nurturing?: string;
  };
}

export interface Executive {
  id: string;
  name: string;
  role: AppRole;
  email: string;
  department?: Department;
  unit?: string;
  data_scope?: DataScope;
  manager_id?: string;
  designation?: string;
  unit_scope?: string[];
  permissions?: string[];
}

export interface Employee extends Executive {
  employee_code?: string;
  phone?: string;
  target_monthly?: number;
  active: boolean;
  joined_at: string; // ISO
  employee_status?: "Active" | "Inactive" | "On Leave" | "Exited";
  account_status?: "Active" | "Suspended" | "Disabled";
  dashboard_template?:
    "My Sales Desk" | "Sales Control Tower" | "Operations Desk" | "Admin Console";
  destination_expertise?: string[];
  product_expertise?: string[];
  languages?: string[];
  permission_grants?: string[];
  permission_restrictions?: string[];
  login_email_pending?: boolean;
  roster_revision?: string;
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
  | "priority_changed"
  | "lost_reason_recorded"
  | "operations_handoff_created"
  | "operations_handoff_accepted"
  | "manager_escalated"
  // NEW: progress update on a task
  | "task_updated";

export interface CrmEvent {
  id: string;
  type: CrmEventType;
  at: string; // ISO datetime
  by: string; // who performed the action
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
  lost_reason_recorded: "Lost reason recorded",
  operations_handoff_created: "Operations handoff created",
  operations_handoff_accepted: "Operations handoff accepted",
  manager_escalated: "Manager escalated",
  task_updated: "Task updated", // NEW
};

/** Activity event types that count as "the employee worked this lead". */
export const CONTACT_EVENTS: CrmEventType[] = [
  "call_made",
  "call_connected",
  "call_not_connected",
  "whatsapp_sent",
  "email_sent",
  "followup_logged",
  "followup_completed",
  "customer_replied",
  "negotiation_started",
];

export const LEAD_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
