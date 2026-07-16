// Wizard draft types for the 18-step Tour Quotation Builder.
import type { MealPlan } from "@/lib/mock-store";

export type QueryType = "B2B" | "B2C" | "Brochure";
export type TourType = "FIT" | "GIT" | "Brochure";

export interface AgentInfo {
  agent_id?: string;
  name: string;
  agency: string;
  phone: string;
  email: string;
}
export interface GuestInfo {
  name: string;
  phone: string;
  email: string;
  city: string;
}
export interface BrochureInfo {
  tour_type: string;
  theme: string;
  event: string;
  period_start: string;
  period_end: string;
}
export interface ChildInfo {
  age: number;
}
export interface TravelDetail {
  from_city?: string;
  to_city?: string;
  flight_no?: string;
  train_name?: string;
  date?: string;
  time?: string;
  pnr?: string;
}
export interface RoutingDay {
  day: number;
  date: string;
  day_name?: string;
  city_id: string;          // primary storage — still used by Step 15 hotel lookups
  from_city?: string;       // free-text / city id, day 1 auto from departure_city
  to_city?: string;         // mirror of city_id (kept in sync); "Departure" on last day
  travel_by?: "Road" | "Train" | "Flight" | "Self Drive";
  program: string;
  program_mode: "text" | "select";
  overnight: boolean;
}
export type TransportRateFormat = "per_day" | "total" | "prefilled";
export interface TransportLine {
  id: string;
  travel_id: string;
  vehicles: number;
  days: number;
  rate: number;
  rate_format?: TransportRateFormat;
  reporting_cost?: number;
  total_override?: number;   // used when rate_format === "total"
  remarks?: string;
}
export interface PaxRangePrice {
  from_pax: number;
  to_pax: number;
  rate: number;
}
export interface ActivityLine {
  id: string;
  activity_id?: string;
  custom_name?: string;
  qty: number;
  rate: number;
  pax_ranges?: PaxRangePrice[];   // Brochure only
}
export interface EntranceLine {
  id: string;
  site_id?: string;
  custom_name?: string;
  indian_pax: number;
  indian_rate: number;
  foreign_pax: number;
  foreign_rate: number;
  student_pax?: number;
  student_rate?: number;
}
export interface GuideLine {
  id: string;
  guide_id: string;
  days: number;
  guides: number;
  rate: number;
  pax_ranges?: PaxRangePrice[];   // Brochure only
}
export interface MiscLine {
  id: string;
  item_id?: string;
  custom_name?: string;
  qty: number;
  rate: number;
  unit: string;
  pax_ranges?: PaxRangePrice[];   // Brochure only
}

export interface HotelSelection {
  city_id: string;
  hotel_id: string;
  room_id: string;
  meal_plan: MealPlan;
  is_fallback?: boolean;
}
export type OptionKey = "A" | "B" | "C" | "D";
export interface HotelOption {
  key: OptionKey;
  label: string;
  category?: string;
  selections: HotelSelection[];
  inclusions?: string[];
  exclusions?: string[];
}

export interface QuoteDraft {
  step: number;
  query_type: QueryType | null;
  tour_type?: TourType;
  agent: AgentInfo;
  guest: GuestInfo;
  brochure: BrochureInfo;

  // Duration & dates
  nights: number;
  has_dates?: boolean;
  start_date: string;
  brochure_validity_from?: string;
  brochure_validity_till?: string;

  program_mode: "existing" | "new";
  program_id?: string;
  program_name: string;

  // Pax
  adults: number;
  ss: number;
  children: ChildInfo[];
  pax_min?: number;
  pax_max?: number;

  categories: string[];      // legacy — no UI, retained for saved-quote fidelity
  departure_city: string;

  travel_modes: string[];
  travel_flight_class?: string;
  travel_train_class?: string;
  arrival_flight?: TravelDetail;
  departure_flight?: TravelDetail;
  arrival_train?: TravelDetail;
  departure_train?: TravelDetail;

  routing: RoutingDay[];
  transport: TransportLine[];
  activities: ActivityLine[];
  entrances: EntranceLine[];
  guides: GuideLine[];
  misc: MiscLine[];

  hotel_options: HotelOption[];
  markup_percent: number;
  inclusions: string[];
  exclusions: string[];
  recommended_option: OptionKey | null;
  optionals: ActivityLine[];
  included_option_keys?: OptionKey[];
  updated_at: string;
}

export const emptyDraft = (): QuoteDraft => ({
  step: 1,
  query_type: null,
  tour_type: undefined,
  agent: { name: "", agency: "", phone: "", email: "" },
  guest: { name: "", phone: "", email: "", city: "" },
  brochure: { tour_type: "", theme: "", event: "", period_start: "", period_end: "" },
  nights: 3,
  has_dates: true,
  start_date: new Date().toISOString().slice(0, 10),
  brochure_validity_from: "",
  brochure_validity_till: "",
  program_mode: "new",
  program_name: "",
  adults: 2,
  ss: 0,
  children: [],
  pax_min: 1,
  pax_max: 40,
  categories: [],
  departure_city: "",
  travel_modes: [],
  arrival_flight: {},
  departure_flight: {},
  arrival_train: {},
  departure_train: {},
  routing: [],
  transport: [],
  activities: [],
  entrances: [],
  guides: [],
  misc: [],
  hotel_options: [{ key: "A", label: "", category: "", selections: [] }],
  markup_percent: 10,
  inclusions: [],
  exclusions: [
    "Airfare / train fare unless specified",
    "Personal expenses (laundry, tips, phone calls)",
    "Anything not mentioned in inclusions",
  ],
  recommended_option: null,
  optionals: [],
  updated_at: new Date().toISOString(),
});
