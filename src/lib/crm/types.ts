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
}

export interface Executive {
  id: string;
  name: string;
  role: "Sales Executive" | "Sales Manager";
  email: string;
}
