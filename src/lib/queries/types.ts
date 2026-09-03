// Query Tracking (QTS) — data model.

export type MarketSource = "B2B" | "B2C";
export type WorkingStatus = "New" | "Working" | "Nurturing";
export type FinalLeadStatus = "New" | "Working" | "Nurturing" | "WIN" | "LOST";

export const MARKET_SOURCES: MarketSource[] = ["B2B", "B2C"];
export const WORKING_STATUSES: WorkingStatus[] = ["New", "Working", "Nurturing"];
export const FINAL_STATUSES: FinalLeadStatus[] = ["New", "Working", "Nurturing", "WIN", "LOST"];

export const QUERY_TYPES = [
  "Regular Tour Package - FIT",
  "Regular Tour Package - GIT",
  "Regular Tour Package - FIT/GIT",
  "Customized Tour",
  "MICE / Corporate",
  "Wildlife Special",
  "Pilgrimage",
  "Only Hotel Booking",
  "Only Transport",
];

export const SOURCE_TYPES = [
  "Agent", "Direct", "Website", "Referral", "Walk-in", "Social Media",
  "Google / Ads", "Exhibition / Trade Fair", "Repeat Guest",
];

export const CONVERSATION_MEDIUMS = [
  "Phone Call", "WhatsApp", "Email", "In Person", "Website Form", "Social Media",
];

export const PROGRAM_TYPES = [
  "Heritage", "Wildlife", "Pilgrimage", "Adventure", "Leisure", "Cultural", "Mixed",
];

export const COSTING_BASIS = ["Per Person", "Group / Package", "Per Vehicle", "Per Room Night", "Not Decided"];

/** Unlimited activity log entry attached to a query. */
export type QueryActivityType =
  | "call" | "whatsapp" | "email" | "meeting" | "note"
  | "status_change" | "followup" | "quotation_sent";

export const ACTIVITY_LABELS: Record<QueryActivityType, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Meeting",
  note: "Internal Note",
  status_change: "Status Change",
  followup: "Follow-up",
  quotation_sent: "Quotation Sent",
};

export interface QueryActivity {
  id: string;
  type: QueryActivityType;
  /** ISO datetime the activity was logged */
  at: string;
  by: string;
  note: string;
  /** For scheduled follow-ups: when it is due (ISO datetime) */
  due_at?: string;
  done?: boolean;
  done_at?: string;
  notified?: boolean;
}

export interface FollowUp {
  /** Planned follow-up date (yyyy-mm-dd) */
  date: string;
  /** Optional reminder datetime (yyyy-mm-ddThh:mm) */
  reminder_at: string;
  /** Short note about this follow up */
  note: string;
  /** Set once the reminder notification has fired */
  notified?: boolean;
  done?: boolean;
}

export const emptyFollowUp = (): FollowUp => ({ date: "", reminder_at: "", note: "" });


export interface QueryRecord {
  id: string;
  serial: number;
  query_no: string;

  // Query / Lead information
  query_date: string;
  query_market_source: MarketSource;
  query_market_region: string;
  query_type: string;
  query_for: string;
  query_base_city: string;
  query_source_type: string;
  query_source_name: string;
  contact_person: string;
  contact_number: string;
  email_id: string;

  // Travel details
  tour_starting_date: string;
  tour_ending_date: string;
  no_of_pax: number;
  per_person_cost: number;
  /** Auto = pax x per person, unless overridden */
  total_query_amount: number | null;
  tour_starting_city: string;
  tour_ending_city: string;
  hotel_category: string;

  // Program
  interested_program_routing: string;
  interested_program_code: string;
  interested_program_name: string;
  program_type: string;
  program_region: string;
  travel_advisor: string;
  conversation_medium: string;

  // Working status flags (Ack / Yes style)
  status_new: boolean;
  status_working: boolean;
  status_nurturing: boolean;

  // Follow ups — phase 1 (1-3), phase 2 (4-6)
  follow_ups: FollowUp[];

  // Outcome
  final_status: FinalLeadStatus;
  remarks: string;

  // --- Query Management extensions (optional so older records keep working) ---
  /** Unlimited activity log (calls, emails, notes, follow-ups, status changes). */
  activities?: QueryActivity[];
  /** Free-text next action shown in the tracker. */
  next_action?: string;
  costing_basis?: string;
  loss_reason?: string;
  escalated_at?: string;

  created_at: string;
  updated_at: string;
  won_at?: string;
}


export type QueryInput = Omit<QueryRecord, "id" | "serial" | "query_no" | "created_at" | "updated_at">;

export function blankQuery(): QueryInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    query_date: today,
    query_market_source: "B2B",
    query_market_region: "",
    query_type: QUERY_TYPES[2],
    query_for: "",
    query_base_city: "",
    query_source_type: "Agent",
    query_source_name: "",
    contact_person: "",
    contact_number: "",
    email_id: "",
    tour_starting_date: "",
    tour_ending_date: "",
    no_of_pax: 2,
    per_person_cost: 0,
    total_query_amount: null,
    tour_starting_city: "",
    tour_ending_city: "",
    hotel_category: "",
    interested_program_routing: "",
    interested_program_code: "",
    interested_program_name: "",
    program_type: "",
    program_region: "",
    travel_advisor: "",
    conversation_medium: "Phone Call",
    status_new: true,
    status_working: false,
    status_nurturing: false,
    follow_ups: [emptyFollowUp(), emptyFollowUp(), emptyFollowUp(), emptyFollowUp(), emptyFollowUp(), emptyFollowUp()],
    final_status: "New",
    remarks: "",
    activities: [],
    next_action: "",
    costing_basis: COSTING_BASIS[0],
  };

}
