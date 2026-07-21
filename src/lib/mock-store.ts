// Mock data store backed by localStorage with a tiny pub/sub for reactivity.
// Replace with Supabase later — keep this shape stable.

export type HotelCategory =
  | "3 Star"
  | "3 Star Deluxe"
  | "4 Star"
  | "4 Star Superior"
  | "5 Star"
  | "5 Star Deluxe"
  | "5 Star Luxury"
  | "Heritage"
  | "Excellent Budget";

export const HOTEL_CATEGORIES: HotelCategory[] = [
  "3 Star",
  "3 Star Deluxe",
  "4 Star",
  "4 Star Superior",
  "5 Star",
  "5 Star Deluxe",
  "5 Star Luxury",
  "Heritage",
  "Excellent Budget",
];

export type MealPlan = "CP" | "MAP" | "AP";
export const MEAL_PLANS: MealPlan[] = ["CP", "MAP", "AP"];

export type SupplementType = "fixed" | "per_person";

export interface City {
  id: string;
  name: string;
}

export interface Hotel {
  id: string;
  city_id: string;
  name: string;
  hotel_category: HotelCategory;
  contact_name: string;
  contact_phone: string;
  email: string;
  has_wifi: boolean;
  has_pool: boolean;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface RoomCategory {
  id: string;
  hotel_id: string;
  name: string;
  created_at: string;
}

export interface RatePlan {
  id: string;
  room_category_id: string;
  validity_start: string; // ISO date
  validity_end: string;
  season_label: string;
  meal_plan: MealPlan;
  double_rate: number;
  single_rate: number;
  extra_bed_rate: number;
  cwb_rate?: number | null;
  cwb_rule_text?: string | null;
  lunch_rate?: number | null;
  dinner_rate?: number | null;
  extra_breakfast_rate?: number | null;
  xmas_supplement?: number | null;
  xmas_supplement_type?: SupplementType;
  newyear_supplement?: number | null;
  newyear_supplement_type?: SupplementType;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  hotel_id: string;
  room_category_id: string;
  rate_plan_id: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  meal_plan: MealPlan;
  num_rooms: number;
  num_adults: number;
  extra_beds: number;
  cwb_count: number;
  include_lunch: boolean;
  include_dinner: boolean;
  include_extra_breakfast: boolean;
  xmas_applied: boolean;
  newyear_applied: boolean;
  subtotal: number;
  gst_rate: number;
  gst_amount: number;
  grand_total: number;
  generated_by: string;
  generated_by_name: string;
  hotel_name_snapshot: string;
  room_name_snapshot: string;
  city_name_snapshot: string;
  created_at: string;
}

export type MiscUnit = "per_person" | "per_day" | "fixed";
export interface MiscellaneousItem {
  id: string;
  name: string;
  description: string;
  rate: number;
  unit: MiscUnit;
  is_active: boolean;
  created_at: string;
}

export interface EntranceCity {
  id: string;
  name: string;
  created_at: string;
}
export interface EntranceSite {
  id: string;
  city_id: string;
  site_name: string;
  indian_rate: number;
  foreigner_rate: number;
  student_rate?: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

export interface ActivityDestination {
  id: string;
  name: string;
  created_at: string;
}
export type ActivityPricingType = "per_person" | "total_fixed" | "per_vehicle";
export interface Activity {
  id: string;
  destination_id: string;
  activity_name: string;
  description: string;
  pricing_type: ActivityPricingType;
  price: number;
  unit_label: string;
  is_active: boolean;
  created_at: string;
  // v2.0 pax-tier rates (optional; when present, wizard auto-picks by total pax)
  group_rate_1_to_6?: number;
  group_rate_7_to_14?: number;
  group_rate_15_to_20?: number;
  per_person_indian?: number;
  per_person_inbound?: number;
  misc_rate?: number;
}

export type GuideType = "Hindi Guide - Local" | "English Guide - Local" | "Tour Escort";
export interface Guide {
  id: string;
  name: string;
  guide_type: GuideType;
  destination: string;
  rate_per_day: number;
  description: string;
  is_active: boolean;
  created_at: string;
  // v2.0 tour-program + pax-tier rates
  city?: string;
  tour_program?: string;
  rate_1_to_5?: number;
  rate_6_to_14?: number;
  rate_15_plus?: number;
  escort_rate?: number;
  indian_entry?: number;
  inbound_entry?: number;
}

// Pax-tier rate helpers (v2.0). Fall back to legacy rate_per_day / price.
export function guideRateForPax(g: Guide, pax: number): number {
  if (pax <= 5 && g.rate_1_to_5 != null) return g.rate_1_to_5;
  if (pax <= 14 && g.rate_6_to_14 != null) return g.rate_6_to_14;
  if (pax >= 15 && g.rate_15_plus != null) return g.rate_15_plus;
  return g.rate_per_day;
}
export function activityRateForPax(a: Activity, pax: number): number {
  if (pax <= 6 && a.group_rate_1_to_6 != null) return a.group_rate_1_to_6;
  if (pax <= 14 && a.group_rate_7_to_14 != null) return a.group_rate_7_to_14;
  if (pax <= 20 && a.group_rate_15_to_20 != null) return a.group_rate_15_to_20;
  if (a.per_person_indian != null) return a.per_person_indian * Math.max(1, pax);
  return a.price;
}

export interface TravelOption {
  id: string;
  vehicle_type: string;
  description: string;
  capacity_persons: number;
  min_pax?: number;
  max_pax?: number;
  rate_per_day: number;
  rate_per_km: number;
  is_active: boolean;
  created_at: string;
}

// Standard MP Tourism vehicle allocation table. Used both as default seed
// for the Travels module and as the pax-based filter in Wizard Step 10.
export const VEHICLE_ALLOCATION: Array<{ min_pax: number; max_pax: number; name: string }> = [
  { min_pax: 1,  max_pax: 3,  name: "AC Sedan (Swift Dzire / Etios)" },
  { min_pax: 1,  max_pax: 6,  name: "AC Ertiga / Rumion" },
  { min_pax: 1,  max_pax: 6,  name: "AC Innova Crysta" },
  { min_pax: 4,  max_pax: 8,  name: "TT-1x1 - 11 Seater" },
  { min_pax: 4,  max_pax: 9,  name: "TT-2x1 - 12 Seater" },
  { min_pax: 4,  max_pax: 9,  name: "Urbania-1x1 - 09 Seater Modified" },
  { min_pax: 4,  max_pax: 10, name: "TT-1x1 - 13 Seater" },
  { min_pax: 4,  max_pax: 11, name: "Urbania-2x1 - 17 Seater" },
  { min_pax: 10, max_pax: 12, name: "TT-2x1 - 17 Seater" },
  { min_pax: 13, max_pax: 15, name: "TT-2x1 - 20 Seater" },
  { min_pax: 16, max_pax: 20, name: "TT-2x2 - 25 Seater" },
  { min_pax: 16, max_pax: 23, name: "Mini Coach - 27 Seater" },
  { min_pax: 21, max_pax: 30, name: "AC Coach - 35 Seater" },
  { min_pax: 30, max_pax: 40, name: "AC Volvo - 45 Seater" },
  { min_pax: 31, max_pax: 35, name: "AC Coach - 40 Seater" },
  { min_pax: 36, max_pax: 40, name: "AC Coach - 45 Seater" },
];

export interface DB {
  cities: City[];
  hotels: Hotel[];
  room_categories: RoomCategory[];
  rate_plans: RatePlan[];
  quotes: Quote[];
  miscellaneous_items: MiscellaneousItem[];
  entrance_cities: EntranceCity[];
  entrance_sites: EntranceSite[];
  activity_destinations: ActivityDestination[];
  activities: Activity[];
  guides: Guide[];
  guide_cities: string[];
  travel_options: TravelOption[];
}


const STORAGE_KEY = "mp-tourism-db-v6-seed4.0";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const now = () => new Date().toISOString();

import {
  MP_SEED_CITIES,
  MP_SEED_HOTELS,
  MP_SEED_ROOMS,
  MP_SEED_PLANS,
} from "./mp-hotels-seed";

function seed(): DB {
  // Real MP rate-sheet data is the master. Merge with a small list of extra
  // reference cities used elsewhere in the app.
  const extraCities = ["Jaipur", "Udaipur", "Agra"];
  const allCityNames = Array.from(new Set([...MP_SEED_CITIES, ...extraCities]));
  const cities: City[] = allCityNames.map((name) => ({ id: uid(), name }));
  const cityIdByName = new Map(cities.map((c) => [c.name, c.id]));

  const hotels: Hotel[] = [];
  const hotelIdByKey = new Map<string, string>(); // `${city}||${name}`
  for (const h of MP_SEED_HOTELS) {
    const cid = cityIdByName.get(h.city);
    if (!cid) continue;
    const id = uid();
    hotelIdByKey.set(`${h.city}||${h.name}`, id);
    const cat = (HOTEL_CATEGORIES as string[]).includes(h.category)
      ? (h.category as HotelCategory)
      : "3 Star";
    hotels.push({
      id, city_id: cid, name: h.name, hotel_category: cat,
      contact_name: h.contact_name, contact_phone: h.contact_phone,
      email: h.email, has_wifi: h.has_wifi, has_pool: h.has_pool,
      address: "", created_at: now(), updated_at: now(),
    });
  }

  const rooms: RoomCategory[] = [];
  const roomIdByKey = new Map<string, string>(); // `${city}||${hotel}||${roomName}`
  for (const r of MP_SEED_ROOMS) {
    const hid = hotelIdByKey.get(`${r.city}||${r.hotel}`);
    if (!hid) continue;
    const id = uid();
    roomIdByKey.set(`${r.city}||${r.hotel}||${r.name}`, id);
    rooms.push({ id, hotel_id: hid, name: r.name, created_at: now() });
  }

  const plans: RatePlan[] = [];
  for (const p of MP_SEED_PLANS) {
    const rid = roomIdByKey.get(`${p.city}||${p.hotel}||${p.room}`);
    if (!rid) continue;
    plans.push({
      id: uid(),
      room_category_id: rid,
      validity_start: p.start,
      validity_end: p.end,
      season_label: p.season,
      meal_plan: p.meal,
      double_rate: p.double,
      single_rate: p.single,
      extra_bed_rate: p.extra_bed,
      cwb_rate: p.cwb,
      cwb_rule_text: null,
      lunch_rate: p.lunch,
      dinner_rate: p.dinner,
      extra_breakfast_rate: p.extra_bkf,
      xmas_supplement: p.xmas,
      xmas_supplement_type: "per_person",
      newyear_supplement: p.nyear,
      newyear_supplement_type: "per_person",
      remarks: p.remarks,
      created_at: now(), updated_at: now(),
    });
  }


  const miscellaneous_items: MiscellaneousItem[] = [
    {
      id: uid(),
      name: "Basic Amenities Kit",
      description: "Including Mineral Water, Wet Tissue, Hand Sanitizers, Mask Etc",
      rate: 100, unit: "per_person", is_active: true, created_at: now(),
    },
  ];
  const entrance_cities: EntranceCity[] = [
    { id: uid(), name: "Gwalior", created_at: now() },
  ];
  const entrance_sites: EntranceSite[] = [
    {
      id: uid(), city_id: entrance_cities[0].id,
      site_name: "Gwalior Fort",
      indian_rate: 100, foreigner_rate: 1200,
      notes: "Open 09:00 – 17:30. Camera fee extra.",
      is_active: true, created_at: now(),
    },
  ];
  // v2.0 seed: destinations mirror rate-sheet cities so wizard filters by routing city.
  const ACT_CITY_NAMES = [
    "Gwalior", "Khajuraho", "Omkareshwar", "Ujjain",
    "Maheshwar", "Mandu", "Bhopal", "Kanha", "Bandhavgarh",
  ];
  const activity_destinations: ActivityDestination[] = ACT_CITY_NAMES.map((n) => ({
    id: uid(), name: n, created_at: now(),
  }));
  const destId = (name: string) => activity_destinations.find((d) => d.name === name)!.id;

  const mkAct = (
    dest: string, name: string,
    fields: Partial<Activity> & { unit?: string; price?: number },
  ): Activity => {
    const price = fields.price ?? fields.group_rate_7_to_14 ?? fields.per_person_indian ?? 0;
    const pricing_type: ActivityPricingType =
      fields.group_rate_7_to_14 != null ? "total_fixed" : "per_person";
    return {
      id: uid(), destination_id: destId(dest),
      activity_name: name, description: "",
      pricing_type, price, unit_label: fields.unit ?? "",
      is_active: true, created_at: now(),
      group_rate_1_to_6: fields.group_rate_1_to_6,
      group_rate_7_to_14: fields.group_rate_7_to_14,
      group_rate_15_to_20: fields.group_rate_15_to_20,
      per_person_indian: fields.per_person_indian,
      per_person_inbound: fields.per_person_inbound,
      misc_rate: fields.misc_rate,
    };
  };

  const activities: Activity[] = [
    mkAct("Gwalior", "Sound & Light Show", { per_person_indian: 350, per_person_inbound: 850, misc_rate: 100, unit: "Per Person" }),
    mkAct("Gwalior", "Heritage Walk", { group_rate_1_to_6: 2500, group_rate_7_to_14: 3500, group_rate_15_to_20: 4000, unit: "Group Total (Inbound)" }),
    mkAct("Gwalior", "Meditation Session in Mitaoli", { group_rate_1_to_6: 2000, group_rate_7_to_14: 2500, group_rate_15_to_20: 3000, unit: "Group Total" }),
    mkAct("Khajuraho", "Sound & Light Show", { per_person_indian: 350, per_person_inbound: 750, unit: "Per Person" }),
    mkAct("Omkareshwar", "Abhishekam", { group_rate_1_to_6: 2500, group_rate_7_to_14: 3500, group_rate_15_to_20: 4000, unit: "Group Total" }),
    mkAct("Ujjain", "Batik Art Experience", { group_rate_1_to_6: 200, group_rate_7_to_14: 3000, group_rate_15_to_20: 4000, unit: "Group Total" }),
    mkAct("Maheshwar", "Boat Ride", { group_rate_1_to_6: 2500, group_rate_7_to_14: 3000, group_rate_15_to_20: 3500, unit: "Group Total" }),
    mkAct("Mandu", "Traditional Malwa Village Outdoor", { per_person_inbound: 1750, unit: "Per Person (Inbound)" }),
    mkAct("Mandu", "Sound & Light Show", { per_person_indian: 400, per_person_inbound: 850, unit: "Per Person" }),
    mkAct("Bhopal", "Boat Ride", { per_person_inbound: 250, unit: "Per Person (Inbound)" }),
  ];

  const mkGuide = (
    city: string, tour_program: string,
    r5: number, r14: number, r15: number,
    escort: number, indian?: number, inbound?: number,
  ): Guide => ({
    id: uid(),
    name: `${city} — ${tour_program}`,
    guide_type: "English Guide - Local",
    destination: city,
    rate_per_day: r14,
    description: "",
    is_active: true, created_at: now(),
    city, tour_program,
    rate_1_to_5: r5, rate_6_to_14: r14, rate_15_plus: r15,
    escort_rate: escort,
    indian_entry: indian, inbound_entry: inbound,
  });

  const guides: Guide[] = [
    mkGuide("Gwalior", "PM Fort", 2000, 2500, 3000, 5000, 100, 500),
    mkGuide("Gwalior", "HDCT + PM Fort", 3000, 4000, 4500, 5000, 700, 1500),
    mkGuide("Gwalior", "HDCT (Without JVP) + HD Eve Fort", 2500, 3500, 4000, 5000, 100, 500),
    mkGuide("Gwalior", "HDCT", 2500, 3000, 3500, 5000, 700, 1000),
    mkGuide("Orchha", "HDCT", 2500, 3000, 3500, 5000, 100, 750),
    mkGuide("Orchha", "HDCT + Aarti", 3000, 3500, 4000, 5000, 100, 750),
    mkGuide("Khajuraho", "FDCT", 3000, 3500, 4000, 5000, 100, 700),
    mkGuide("Khajuraho", "AM HDCT", 2500, 3000, 4000, 5000, 100, 700),
    mkGuide("Khajuraho", "PM HDCT", 2500, 3000, 4000, 5000, 100, 700),
    mkGuide("Bhopal", "PM HDCT (Taj-ul-Masajid + Lake)", 3000, 3500, 4000, 5000),
    mkGuide("Bhopal", "AM HDCT (Tribal Museum)", 3000, 3500, 4000, 5000, 350, 1250),
    mkGuide("Bhopal", "Excursion Bhoj & Bhim", 4000, 4500, 5000, 5000),
    mkGuide("Bhopal", "Excursion Sanchi", 3500, 4000, 5000, 5000, 100, 600),
    mkGuide("Bhopal", "Excursion Sanchi & Udayagiri", 4000, 4500, 5000, 5000, 100, 900),
    mkGuide("Ujjain", "HDCT + Aarti", 4000, 4500, 5000, 5000, 300, 300),
    mkGuide("Omkareshwar", "HDCT", 2500, 3000, 3500, 5000, 500, 500),
    mkGuide("Maheshwar", "HDCT", 2500, 3000, 3500, 5000, 30, 100),
    mkGuide("Mandu", "FDCT", 3000, 3500, 4000, 5000, 100, 1200),
    mkGuide("Mandu", "PM HDCT", 2500, 3000, 3500, 5000, 50, 600),
    mkGuide("Mandu", "AM HDCT", 2500, 3000, 3500, 5000, 50, 600),
    mkGuide("Indore", "FDCT", 4000, 4500, 5000, 5000, 100, 1200),
  ];
  const travel_options: TravelOption[] = VEHICLE_ALLOCATION.map((v) => ({
    id: uid(),
    vehicle_type: v.name,
    description: "",
    capacity_persons: v.max_pax,
    min_pax: v.min_pax,
    max_pax: v.max_pax,
    rate_per_day: 0,
    rate_per_km: 0,
    is_active: true,
    created_at: now(),
  }));

  return {
    cities, hotels, room_categories: rooms, rate_plans: plans, quotes: [],
    miscellaneous_items, entrance_cities, entrance_sites, activity_destinations, activities,
    guides,
    guide_cities: ["Gwalior", "Orchha", "Khajuraho", "Bhopal", "Ujjain", "Omkareshwar", "Maheshwar", "Mandu", "Indore"],
    travel_options,
  };
}


let _db: DB | null = null;
const listeners = new Set<() => void>();

function load(): DB {
  if (_db) return _db;
  if (typeof window === "undefined") {
    _db = seed();
    return _db;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (!parsed.quotes) parsed.quotes = [];
      if (!parsed.miscellaneous_items) parsed.miscellaneous_items = [];
      if (!parsed.entrance_cities) parsed.entrance_cities = [];
      if (!parsed.entrance_sites) parsed.entrance_sites = [];
      if (!parsed.activity_destinations) parsed.activity_destinations = [];
      if (!parsed.activities) parsed.activities = [];
      if (!parsed.guides || parsed.guides.length === 0) {
        const s = seed();
        parsed.guides = s.guides;
      }
      if (!parsed.guide_cities || parsed.guide_cities.length === 0) {
        parsed.guide_cities = ["Gwalior", "Orchha", "Khajuraho", "Bhopal", "Ujjain", "Omkareshwar", "Maheshwar", "Mandu", "Indore"];
      }
      // Replace legacy travel_options (missing min_pax/max_pax) with the
      // standard VEHICLE_ALLOCATION seed so Step 10 filtering works.
      const needsTravelReseed =
        !parsed.travel_options ||
        parsed.travel_options.length === 0 ||
        parsed.travel_options.every((t) => t.min_pax == null && t.max_pax == null);
      if (needsTravelReseed) {
        const s = seed();
        parsed.travel_options = s.travel_options;
      }
      _db = parsed;
      return _db;
    }
  } catch {/* ignore */}
  _db = seed();
  persist();
  return _db;
}

function persist() {
  if (typeof window === "undefined" || !_db) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_db));
}

function emit() {
  listeners.forEach((l) => l());
}

export const db = {
  get(): DB { return load(); },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset() {
    _db = seed();
    persist();
    emit();
  },

  // Cities
  addCity(name: string): City {
    const d = load();
    const c: City = { id: uid(), name: name.trim() };
    d.cities.push(c);
    persist(); emit();
    return c;
  },

  // Hotels
  addHotel(input: Omit<Hotel, "id" | "created_at" | "updated_at">): Hotel {
    const d = load();
    const h: Hotel = { ...input, id: uid(), created_at: now(), updated_at: now() };
    d.hotels.push(h);
    persist(); emit();
    return h;
  },
  updateHotel(id: string, patch: Partial<Hotel>) {
    const d = load();
    const idx = d.hotels.findIndex((h) => h.id === id);
    if (idx >= 0) {
      d.hotels[idx] = { ...d.hotels[idx], ...patch, updated_at: now() };
      persist(); emit();
    }
  },
  deleteHotel(id: string) {
    const d = load();
    d.hotels = d.hotels.filter((h) => h.id !== id);
    const roomIds = d.room_categories.filter((r) => r.hotel_id === id).map((r) => r.id);
    d.room_categories = d.room_categories.filter((r) => r.hotel_id !== id);
    d.rate_plans = d.rate_plans.filter((p) => !roomIds.includes(p.room_category_id));
    persist(); emit();
  },

  // Room categories
  addRoom(hotel_id: string, name: string): RoomCategory {
    const d = load();
    const r: RoomCategory = { id: uid(), hotel_id, name: name.trim(), created_at: now() };
    d.room_categories.push(r);
    persist(); emit();
    return r;
  },
  updateRoom(id: string, name: string) {
    const d = load();
    const r = d.room_categories.find((x) => x.id === id);
    if (r) { r.name = name; persist(); emit(); }
  },
  deleteRoom(id: string) {
    const d = load();
    d.room_categories = d.room_categories.filter((r) => r.id !== id);
    d.rate_plans = d.rate_plans.filter((p) => p.room_category_id !== id);
    persist(); emit();
  },

  // Rate plans
  addRatePlans(plans: Omit<RatePlan, "id" | "created_at" | "updated_at">[]) {
    const d = load();
    plans.forEach((p) => {
      d.rate_plans.push({ ...p, id: uid(), created_at: now(), updated_at: now() });
    });
    persist(); emit();
  },
  updateRatePlan(id: string, patch: Partial<RatePlan>) {
    const d = load();
    const idx = d.rate_plans.findIndex((p) => p.id === id);
    if (idx >= 0) {
      d.rate_plans[idx] = { ...d.rate_plans[idx], ...patch, updated_at: now() };
      persist(); emit();
    }
  },
  deleteRatePlan(id: string) {
    const d = load();
    d.rate_plans = d.rate_plans.filter((p) => p.id !== id);
    persist(); emit();
  },
  deleteRatePlanGroup(room_category_id: string, validity_start: string, validity_end: string) {
    const d = load();
    d.rate_plans = d.rate_plans.filter(
      (p) => !(p.room_category_id === room_category_id && p.validity_start === validity_start && p.validity_end === validity_end),
    );
    persist(); emit();
  },

  // Quotes
  addQuote(q: Omit<Quote, "id" | "created_at">): Quote {
    const d = load();
    const quote: Quote = { ...q, id: uid(), created_at: now() };
    d.quotes.unshift(quote);
    persist(); emit();
    return quote;
  },
  deleteQuote(id: string) {
    const d = load();
    d.quotes = d.quotes.filter((q) => q.id !== id);
    persist(); emit();
  },

  // Miscellaneous items
  addMisc(input: Omit<MiscellaneousItem, "id" | "created_at">): MiscellaneousItem {
    const d = load();
    const it: MiscellaneousItem = { ...input, id: uid(), created_at: now() };
    d.miscellaneous_items.push(it); persist(); emit(); return it;
  },
  updateMisc(id: string, patch: Partial<MiscellaneousItem>) {
    const d = load();
    const idx = d.miscellaneous_items.findIndex((x) => x.id === id);
    if (idx >= 0) { d.miscellaneous_items[idx] = { ...d.miscellaneous_items[idx], ...patch }; persist(); emit(); }
  },
  deleteMisc(id: string) {
    const d = load();
    d.miscellaneous_items = d.miscellaneous_items.filter((x) => x.id !== id);
    persist(); emit();
  },

  // Entrance cities & sites
  addEntranceCity(name: string): EntranceCity {
    const d = load();
    const c: EntranceCity = { id: uid(), name: name.trim(), created_at: now() };
    d.entrance_cities.push(c); persist(); emit(); return c;
  },
  updateEntranceCity(id: string, name: string) {
    const d = load();
    const c = d.entrance_cities.find((x) => x.id === id);
    if (c) { c.name = name; persist(); emit(); }
  },
  deleteEntranceCity(id: string) {
    const d = load();
    d.entrance_cities = d.entrance_cities.filter((x) => x.id !== id);
    d.entrance_sites = d.entrance_sites.filter((s) => s.city_id !== id);
    persist(); emit();
  },
  addEntranceSite(input: Omit<EntranceSite, "id" | "created_at">): EntranceSite {
    const d = load();
    const s: EntranceSite = { ...input, id: uid(), created_at: now() };
    d.entrance_sites.push(s); persist(); emit(); return s;
  },
  updateEntranceSite(id: string, patch: Partial<EntranceSite>) {
    const d = load();
    const idx = d.entrance_sites.findIndex((x) => x.id === id);
    if (idx >= 0) { d.entrance_sites[idx] = { ...d.entrance_sites[idx], ...patch }; persist(); emit(); }
  },
  deleteEntranceSite(id: string) {
    const d = load();
    d.entrance_sites = d.entrance_sites.filter((x) => x.id !== id);
    persist(); emit();
  },

  // Activity destinations & activities
  addActivityDestination(name: string): ActivityDestination {
    const d = load();
    const c: ActivityDestination = { id: uid(), name: name.trim(), created_at: now() };
    d.activity_destinations.push(c); persist(); emit(); return c;
  },
  updateActivityDestination(id: string, name: string) {
    const d = load();
    const c = d.activity_destinations.find((x) => x.id === id);
    if (c) { c.name = name; persist(); emit(); }
  },
  deleteActivityDestination(id: string) {
    const d = load();
    d.activity_destinations = d.activity_destinations.filter((x) => x.id !== id);
    d.activities = d.activities.filter((a) => a.destination_id !== id);
    persist(); emit();
  },
  addActivity(input: Omit<Activity, "id" | "created_at">): Activity {
    const d = load();
    const a: Activity = { ...input, id: uid(), created_at: now() };
    d.activities.push(a); persist(); emit(); return a;
  },
  updateActivity(id: string, patch: Partial<Activity>) {
    const d = load();
    const idx = d.activities.findIndex((x) => x.id === id);
    if (idx >= 0) { d.activities[idx] = { ...d.activities[idx], ...patch }; persist(); emit(); }
  },
  deleteActivity(id: string) {
    const d = load();
    d.activities = d.activities.filter((x) => x.id !== id);
    persist(); emit();
  },

  // Guides
  addGuide(input: Omit<Guide, "id" | "created_at">): Guide {
    const d = load();
    const g: Guide = { ...input, id: uid(), created_at: now() };
    d.guides.push(g); persist(); emit(); return g;
  },
  updateGuide(id: string, patch: Partial<Guide>) {
    const d = load();
    const idx = d.guides.findIndex((x) => x.id === id);
    if (idx >= 0) { d.guides[idx] = { ...d.guides[idx], ...patch }; persist(); emit(); }
  },
  deleteGuide(id: string) {
    const d = load();
    d.guides = d.guides.filter((x) => x.id !== id);
    persist(); emit();
  },

  // Travel options
  addTravel(input: Omit<TravelOption, "id" | "created_at">): TravelOption {
    const d = load();
    const t: TravelOption = { ...input, id: uid(), created_at: now() };
    d.travel_options.push(t); persist(); emit(); return t;
  },
  updateTravel(id: string, patch: Partial<TravelOption>) {
    const d = load();
    const idx = d.travel_options.findIndex((x) => x.id === id);
    if (idx >= 0) { d.travel_options[idx] = { ...d.travel_options[idx], ...patch }; persist(); emit(); }
  },
  deleteTravel(id: string) {
    const d = load();
    d.travel_options = d.travel_options.filter((x) => x.id !== id);
    persist(); emit();
  },
};


// React helpers
import { useSyncExternalStore } from "react";

export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => db.subscribe(cb),
    () => db.get(),
    () => db.get(),
  );
}
