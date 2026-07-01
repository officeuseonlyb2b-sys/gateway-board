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

export interface DB {
  cities: City[];
  hotels: Hotel[];
  room_categories: RoomCategory[];
  rate_plans: RatePlan[];
  quotes: Quote[];
}

const STORAGE_KEY = "mp-tourism-db-v1";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const now = () => new Date().toISOString();

function seed(): DB {
  const cityNames = [
    "Bhopal", "Indore", "Khajuraho", "Gwalior", "Ujjain", "Jabalpur",
    "Pachmarhi", "Mandu", "Orchha", "Kanha", "Bandhavgarh", "Panna",
    "Jaipur", "Udaipur", "Agra",
  ];
  const cities: City[] = cityNames.map((name) => ({ id: uid(), name }));
  const byCity = (n: string) => cities.find((c) => c.name === n)!.id;

  const hotels: Hotel[] = [
    {
      id: uid(),
      city_id: byCity("Khajuraho"),
      name: "Taj Chandela",
      hotel_category: "5 Star",
      contact_name: "Rakesh Sharma",
      contact_phone: "+91 98765 43210",
      email: "reservations@tajchandela.com",
      has_wifi: true, has_pool: true,
      address: "Airport Road, Khajuraho, MP",
      created_at: now(), updated_at: now(),
    },
    {
      id: uid(),
      city_id: byCity("Orchha"),
      name: "Amar Mahal",
      hotel_category: "Heritage",
      contact_name: "Priya Singh",
      contact_phone: "+91 98456 11122",
      email: "stay@amarmahal.in",
      has_wifi: true, has_pool: true,
      address: "Jhansi Road, Orchha",
      created_at: now(), updated_at: now(),
    },
    {
      id: uid(),
      city_id: byCity("Kanha"),
      name: "Kanha Jungle Lodge",
      hotel_category: "4 Star",
      contact_name: "Vivek Patel",
      contact_phone: "+91 99000 78912",
      email: "info@kanhalodge.com",
      has_wifi: true, has_pool: false,
      address: "Mukki Gate, Kanha National Park",
      created_at: now(), updated_at: now(),
    },
    {
      id: uid(),
      city_id: byCity("Bhopal"),
      name: "Jehan Numa Palace",
      hotel_category: "Heritage",
      contact_name: "Anjali Mehta",
      contact_phone: "+91 75500 22210",
      email: "reservations@jehannuma.com",
      has_wifi: true, has_pool: true,
      address: "Shamla Hills, Bhopal",
      created_at: now(), updated_at: now(),
    },
    {
      id: uid(),
      city_id: byCity("Pachmarhi"),
      name: "Hotel Highlands",
      hotel_category: "3 Star",
      contact_name: "Suresh Yadav",
      contact_phone: "+91 94250 11023",
      email: "highlands@mptourism.com",
      has_wifi: true, has_pool: false,
      address: "Main Road, Pachmarhi",
      created_at: now(), updated_at: now(),
    },
    {
      id: uid(),
      city_id: byCity("Indore"),
      name: "Sayaji Hotel",
      hotel_category: "5 Star Deluxe",
      contact_name: "Neha Joshi",
      contact_phone: "+91 96500 90011",
      email: "sales@sayajiindore.com",
      has_wifi: true, has_pool: true,
      address: "Vijay Nagar, Indore",
      created_at: now(), updated_at: now(),
    },
  ];

  const rooms: RoomCategory[] = [];
  const plans: RatePlan[] = [];

  hotels.forEach((h) => {
    const deluxe: RoomCategory = { id: uid(), hotel_id: h.id, name: "Deluxe Room", created_at: now() };
    const suite: RoomCategory = { id: uid(), hotel_id: h.id, name: "Executive Suite", created_at: now() };
    rooms.push(deluxe, suite);

    const baseDouble = h.hotel_category.includes("5 Star") ? 9000 : h.hotel_category === "Heritage" ? 7500 : h.hotel_category.includes("4 Star") ? 5500 : 3800;

    (["Peak Season", "Off Season"] as const).forEach((label, i) => {
      const startMonth = i === 0 ? "10" : "04";
      const endMonth = i === 0 ? "03" : "09";
      const startYear = "2026";
      const endYear = i === 0 ? "2027" : "2026";
      const factor = i === 0 ? 1 : 0.75;

      MEAL_PLANS.forEach((mp) => {
        const bump = mp === "AP" ? 1200 : mp === "MAP" ? 700 : 0;
        plans.push({
          id: uid(),
          room_category_id: deluxe.id,
          validity_start: `${startYear}-${startMonth}-01`,
          validity_end: `${endYear}-${endMonth}-${i === 0 ? "31" : "30"}`,
          season_label: label,
          meal_plan: mp,
          double_rate: Math.round((baseDouble + bump) * factor),
          single_rate: Math.round((baseDouble * 0.75 + bump) * factor),
          extra_bed_rate: Math.round(1500 * factor) + bump / 2,
          cwb_rate: 1200,
          cwb_rule_text: "06-12 Y / Rs.1500",
          lunch_rate: 650, dinner_rate: 750, extra_breakfast_rate: 350,
          xmas_supplement: 2500, xmas_supplement_type: "per_person",
          newyear_supplement: 3500, newyear_supplement_type: "per_person",
          remarks: i === 0 ? "Blackout: 24 Dec – 02 Jan additional supplement applies." : null,
          created_at: now(), updated_at: now(),
        });
      });
    });
  });

  return { cities, hotels, room_categories: rooms, rate_plans: plans, quotes: [] };
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
