// Wizard draft types for the 18-step Tour Quotation Builder.
import type { MealPlan } from "@/lib/mock-store";

export type QueryType = "B2B" | "B2C" | "Brochure";

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
export interface RoutingDay {
  day: number;
  date: string;
  city_id: string;
  program: string;
  program_mode: "text" | "select";
  overnight: boolean;
}
export interface TransportLine {
  id: string;
  travel_id: string;
  vehicles: number;
  days: number;
  rate: number;
}
export interface ActivityLine {
  id: string;
  activity_id?: string;
  custom_name?: string;
  qty: number;
  rate: number;
}
export interface EntranceLine {
  id: string;
  site_id?: string;
  custom_name?: string;
  indian_pax: number;
  indian_rate: number;
  foreign_pax: number;
  foreign_rate: number;
}
export interface GuideLine {
  id: string;
  guide_id: string;
  days: number;
  guides: number;
  rate: number;
}
export interface MiscLine {
  id: string;
  item_id?: string;
  custom_name?: string;
  qty: number;
  rate: number;
  unit: string;
}

export interface HotelSelection {
  city_id: string;
  hotel_id: string;
  room_id: string;
  meal_plan: MealPlan;
}
export type OptionKey = "A" | "B" | "C" | "D";
export interface HotelOption {
  key: OptionKey;
  label: string;
  category?: string;
  selections: HotelSelection[];
}

export interface QuoteDraft {
  step: number;
  query_type: QueryType | null;
  agent: AgentInfo;
  guest: GuestInfo;
  brochure: BrochureInfo;
  nights: number;
  program_mode: "existing" | "new";
  program_id?: string;
  program_name: string;
  start_date: string;
  adults: number;
  ss: number;
  children: ChildInfo[];
  categories: string[];
  departure_city: string;
  travel_modes: string[];
  travel_flight_class?: string;
  travel_train_class?: string;
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
  updated_at: string;
}

export const emptyDraft = (): QuoteDraft => ({
  step: 1,
  query_type: null,
  agent: { name: "", agency: "", phone: "", email: "" },
  guest: { name: "", phone: "", email: "", city: "" },
  brochure: { tour_type: "", theme: "", event: "", period_start: "", period_end: "" },
  nights: 3,
  program_mode: "new",
  program_name: "",
  start_date: new Date().toISOString().slice(0, 10),
  adults: 2,
  ss: 0,
  children: [],
  categories: [],
  departure_city: "",
  travel_modes: [],
  routing: [],
  transport: [],
  activities: [],
  entrances: [],
  guides: [],
  misc: [],
  hotel_options: [{ key: "A", label: "Standard", selections: [] }],
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
