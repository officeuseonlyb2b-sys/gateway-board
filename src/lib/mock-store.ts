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
export type MiscPricingType = "per_person" | "per_day" | "fixed" | "slab";
export interface MiscPriceRange {
  from_pax: number;
  to_pax: number;
  price: number;
}
export interface MiscellaneousItem {
  id: string;
  name: string;
  description: string;
  rate: number;
  unit: MiscUnit;
  // NEW: slab-based pricing (backward compat — unit still populated for legacy code)
  pricing_type?: MiscPricingType;
  price_ranges?: MiscPriceRange[];
  slab_is_per_person?: boolean;
  is_active: boolean;
  created_at: string;
}

/**
 * Resolves the effective per-total cost for a miscellaneous item at a given pax count.
 * Returns { rate, qty, total, label } — qty defaults to 1 for fixed/slab, pax for per_person, nights for per_day.
 */
export function miscRateForPax(m: MiscellaneousItem, pax: number, nights: number): {
  rate: number; qty: number; total: number; label: string;
} {
  const type = m.pricing_type ?? m.unit;
  if (type === "slab" && m.price_ranges && m.price_ranges.length > 0) {
    const sorted = [...m.price_ranges].sort((a, b) => a.from_pax - b.from_pax);
    const slab = sorted.find((s) => pax >= s.from_pax && pax <= s.to_pax)
      ?? (pax < sorted[0].from_pax ? sorted[0] : sorted[sorted.length - 1]);
    if (m.slab_is_per_person) {
      const total = slab.price * Math.max(1, pax);
      return { rate: slab.price, qty: pax, total, label: `${slab.from_pax}-${slab.to_pax} pax · per person` };
    }
    return { rate: slab.price, qty: 1, total: slab.price, label: `${slab.from_pax}-${slab.to_pax} pax · total` };
  }
  if (type === "per_person") return { rate: m.rate, qty: pax, total: m.rate * pax, label: "Per person" };
  if (type === "per_day") return { rate: m.rate, qty: nights, total: m.rate * nights, label: "Per day" };
  return { rate: m.rate, qty: 1, total: m.rate, label: "Fixed" };
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
  tour_id?: string;
}

export interface DestinationCity {
  id: string;
  name: string;
  created_at: string;
}
export interface DestinationTour {
  id: string;
  city_id: string;
  title: string;
  description?: string;
  created_at: string;
}

export const GUIDE_LANGUAGES = [
  "Hindi", "English", "French", "German", "Spanish",
  "Japanese", "Italian", "Russian", "Portuguese", "Other",
] as const;
export type GuideLanguage = (typeof GUIDE_LANGUAGES)[number];
export const DEFAULT_GUIDE_LANGUAGES: GuideLanguage[] = ["Hindi", "English"];

export interface GuideLanguageRate {
  rate_1_to_5: number;
  rate_6_to_14: number;
  rate_15_plus: number;
}

export interface ActivityDestination {
  id: string;
  name: string;
  created_at: string;
}
export type ActivityPricingType = "per_person" | "total_fixed" | "per_vehicle";
export type ActivitySlabPricing = "per_person" | "total";
export interface ActivitySlab {
  id: string;
  from_pax: number;
  to_pax: number;
  price: number;
}
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
  // legacy pax-tier rates
  group_rate_1_to_6?: number;
  group_rate_7_to_14?: number;
  group_rate_15_to_20?: number;
  per_person_indian?: number;
  per_person_inbound?: number;
  misc_rate?: number;
  // v3.0 slab-based pricing
  slab_pricing_type?: ActivitySlabPricing;
  pricing_slabs?: ActivitySlab[];
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
  // legacy tour-program + pax-tier rates
  city?: string;
  tour_program?: string;
  rate_1_to_5?: number;
  rate_6_to_14?: number;
  rate_15_plus?: number;
  escort_rate?: number;
  indian_entry?: number;
  inbound_entry?: number;
  tour_id?: string;
  languages?: GuideLanguage[];
  // v3.0 per-language pricing
  language_rates?: Partial<Record<GuideLanguage, GuideLanguageRate>>;
}

export function guideRateForPax(g: Guide, pax: number, language?: GuideLanguage): number {
  const lr = g.language_rates;
  const pick = (r: GuideLanguageRate) =>
    pax <= 5 ? r.rate_1_to_5 : pax <= 14 ? r.rate_6_to_14 : r.rate_15_plus;
  if (lr) {
    if (language && lr[language]) return pick(lr[language]!);
    if (lr.English) return pick(lr.English);
    if (lr.Hindi) return pick(lr.Hindi);
    const anyKey = Object.keys(lr)[0] as GuideLanguage | undefined;
    if (anyKey && lr[anyKey]) return pick(lr[anyKey]!);
  }
  if (pax <= 5 && g.rate_1_to_5 != null) return g.rate_1_to_5;
  if (pax <= 14 && g.rate_6_to_14 != null) return g.rate_6_to_14;
  if (pax >= 15 && g.rate_15_plus != null) return g.rate_15_plus;
  return g.rate_per_day;
}
export function activityRateForPax(a: Activity, pax: number): number {
  if (a.pricing_slabs && a.pricing_slabs.length > 0) {
    const slab = a.pricing_slabs.find((s) => pax >= s.from_pax && pax <= s.to_pax);
    const chosen = slab ?? (() => {
      const sorted = [...a.pricing_slabs!].sort((x, y) => x.from_pax - y.from_pax);
      return pax < sorted[0].from_pax ? sorted[0] : sorted[sorted.length - 1];
    })();
    return a.slab_pricing_type === "per_person"
      ? chosen.price * Math.max(1, pax)
      : chosen.price;
  }
  if (pax <= 6 && a.group_rate_1_to_6 != null) return a.group_rate_1_to_6;
  if (pax <= 14 && a.group_rate_7_to_14 != null) return a.group_rate_7_to_14;
  if (pax <= 20 && a.group_rate_15_to_20 != null) return a.group_rate_15_to_20;
  if (a.per_person_indian != null) return a.per_person_indian * Math.max(1, pax);
  return a.price;
}

export function guidePrimaryLanguage(g: Guide): GuideLanguage | null {
  const lr = g.language_rates;
  if (lr?.English) return "English";
  if (lr?.Hindi) return "Hindi";
  if (lr) {
    const k = Object.keys(lr)[0] as GuideLanguage | undefined;
    if (k) return k;
  }
  return null;
}
export function guideConfiguredLanguages(g: Guide): GuideLanguage[] {
  const lr = g.language_rates;
  if (!lr) return g.languages ?? [];
  return (Object.keys(lr) as GuideLanguage[]).filter((k) => !!lr[k]);
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
  destination_cities: DestinationCity[];
  destination_tours: DestinationTour[];
  travel_options: TravelOption[];
}


const STORAGE_KEY = "mp-tourism-db-v7-seed5.0";

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
    languages: ["Hindi", "English"],
    language_rates: {
      Hindi:   { rate_1_to_5: r5, rate_6_to_14: r14, rate_15_plus: r15 },
      English: { rate_1_to_5: r5 + 500, rate_6_to_14: r14 + 500, rate_15_plus: r15 + 500 },
    },
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

  const guide_cities_list = ["Gwalior", "Orchha", "Khajuraho", "Bhopal", "Ujjain", "Omkareshwar", "Maheshwar", "Mandu", "Indore"];

  // Build shared Destinations from union of entrance cities + guide cities.
  const destCityNames = Array.from(new Set([
    ...entrance_cities.map((c) => c.name),
    ...guide_cities_list,
  ]));
  const destination_cities: DestinationCity[] = destCityNames.map((name) => {
    const existing = entrance_cities.find((c) => c.name === name);
    return { id: existing?.id ?? uid(), name, created_at: now() };
  });
  const destCityIdByName = new Map(destination_cities.map((c) => [c.name, c.id]));
  // Ensure entrance_cities mirrors destination_cities (same id/name).
  entrance_cities.length = 0;
  destination_cities.forEach((c) => entrance_cities.push({ id: c.id, name: c.name, created_at: c.created_at }));
  // Mirror activity_destinations onto destination_cities (shared master).
  // Remap activity.destination_id from old activity-destination uid → mirrored id.
  const oldActNameById = new Map(activity_destinations.map((d) => [d.id, d.name]));
  activity_destinations.length = 0;
  destination_cities.forEach((c) => activity_destinations.push({ id: c.id, name: c.name, created_at: c.created_at }));
  activities.forEach((a) => {
    const oldName = oldActNameById.get(a.destination_id);
    if (oldName) {
      const newId = destCityIdByName.get(oldName);
      if (newId) a.destination_id = newId;
    }
  });

  // Build tours: union of entrance sites (site_name per city) + guide tour_program per city.
  const destination_tours: DestinationTour[] = [];
  const tourKey = (cityId: string, title: string) => `${cityId}||${title.trim().toLowerCase()}`;
  const tourIndex = new Map<string, DestinationTour>();
  const addTour = (cityId: string, title: string) => {
    const k = tourKey(cityId, title);
    if (tourIndex.has(k)) return tourIndex.get(k)!;
    const t: DestinationTour = { id: uid(), city_id: cityId, title: title.trim(), created_at: now() };
    destination_tours.push(t);
    tourIndex.set(k, t);
    return t;
  };
  // Link entrance sites → tours
  entrance_sites.forEach((s) => {
    const t = addTour(s.city_id, s.site_name);
    s.tour_id = t.id;
  });
  // Link guides → tours; create tours for guide-only cities
  guides.forEach((g) => {
    const cityName = g.city ?? g.destination;
    const cityId = destCityIdByName.get(cityName);
    if (!cityId || !g.tour_program) return;
    const t = addTour(cityId, g.tour_program);
    g.tour_id = t.id;
    // Ensure a matching entrance_site row exists for this tour (empty prices).
    if (!entrance_sites.some((s) => s.tour_id === t.id)) {
      entrance_sites.push({
        id: uid(), city_id: cityId, site_name: t.title,
        indian_rate: 0, foreigner_rate: 0,
        notes: "", is_active: true,
        created_at: now(), tour_id: t.id,
      });
    }
    if (!g.languages || g.languages.length === 0) g.languages = ["English"];
  });

  return {
    cities, hotels, room_categories: rooms, rate_plans: plans, quotes: [],
    miscellaneous_items, entrance_cities, entrance_sites, activity_destinations, activities,
    guides,
    guide_cities: guide_cities_list,
    destination_cities, destination_tours,
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
      // Destinations migration: ensure destination_cities & destination_tours exist,
      // and back-link entrance_sites / guides to matching tour_id.
      if (!parsed.destination_cities || !parsed.destination_tours || parsed.destination_cities.length === 0) {
        const cityNames = Array.from(new Set([
          ...parsed.entrance_cities.map((c) => c.name),
          ...(parsed.guide_cities ?? []),
        ]));
        const dc: DestinationCity[] = cityNames.map((name) => {
          const existing = parsed.entrance_cities.find((c) => c.name === name);
          return { id: existing?.id ?? uid(), name, created_at: now() };
        });
        parsed.destination_cities = dc;
        const idByName = new Map(dc.map((c) => [c.name, c.id]));
        // Ensure entrance_cities mirrors destination_cities exactly.
        parsed.entrance_cities = dc.map((c) => ({ id: c.id, name: c.name, created_at: c.created_at }));

        const tours: DestinationTour[] = [];
        const idx = new Map<string, DestinationTour>();
        const upsertTour = (cityId: string, title: string): DestinationTour => {
          const k = `${cityId}||${title.trim().toLowerCase()}`;
          const hit = idx.get(k);
          if (hit) return hit;
          const t: DestinationTour = { id: uid(), city_id: cityId, title: title.trim(), created_at: now() };
          tours.push(t); idx.set(k, t); return t;
        };
        parsed.entrance_sites.forEach((s) => {
          if (!s.city_id || !s.site_name) return;
          const t = upsertTour(s.city_id, s.site_name);
          s.tour_id = t.id;
        });
        parsed.guides.forEach((g) => {
          const cityName = g.city ?? g.destination;
          const cityId = idByName.get(cityName);
          if (!cityId || !g.tour_program) return;
          const t = upsertTour(cityId, g.tour_program);
          g.tour_id = t.id;
          if (!parsed.entrance_sites.some((s) => s.tour_id === t.id)) {
            parsed.entrance_sites.push({
              id: uid(), city_id: cityId, site_name: t.title,
              indian_rate: 0, foreigner_rate: 0,
              notes: "", is_active: true,
              created_at: now(), tour_id: t.id,
            });
          }
          if (!g.languages || g.languages.length === 0) g.languages = ["English"];
        });
        parsed.destination_tours = tours;
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

  // Guide cities
  addGuideCity(name: string) {
    const d = load();
    const n = name.trim();
    if (!n) return;
    if (!d.guide_cities.includes(n)) d.guide_cities.push(n);
    persist(); emit();
  },
  renameGuideCity(oldName: string, newName: string) {
    const d = load();
    const n = newName.trim();
    if (!n) return;
    d.guide_cities = d.guide_cities.map((c) => c === oldName ? n : c);
    d.guides.forEach((g) => {
      if (g.city === oldName) g.city = n;
      if (g.destination === oldName) g.destination = n;
    });
    persist(); emit();
  },
  deleteGuideCity(name: string) {
    const d = load();
    d.guide_cities = d.guide_cities.filter((c) => c !== name);
    d.guides = d.guides.filter((g) => (g.city ?? g.destination) !== name);
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

  // ── Destinations (shared master for cities + tours) ───────────────────
  addDestinationCity(name: string): DestinationCity | null {
    const d = load();
    const n = name.trim();
    if (!n) return null;
    if (d.destination_cities.some((c) => c.name.toLowerCase() === n.toLowerCase())) return null;
    const c: DestinationCity = { id: uid(), name: n, created_at: now() };
    d.destination_cities.push(c);
    // Mirror to entrance_cities, activity_destinations (same id) + guide_cities (by name).
    d.entrance_cities.push({ id: c.id, name: n, created_at: c.created_at });
    d.activity_destinations.push({ id: c.id, name: n, created_at: c.created_at });
    if (!d.guide_cities.includes(n)) d.guide_cities.push(n);
    persist(); emit();
    return c;
  },
  renameDestinationCity(id: string, newName: string) {
    const d = load();
    const n = newName.trim();
    if (!n) return;
    const c = d.destination_cities.find((x) => x.id === id);
    if (!c) return;
    const old = c.name;
    c.name = n;
    const ec = d.entrance_cities.find((x) => x.id === id);
    if (ec) ec.name = n;
    const ad = d.activity_destinations.find((x) => x.id === id);
    if (ad) ad.name = n;
    d.guide_cities = d.guide_cities.map((x) => x === old ? n : x);
    d.guides.forEach((g) => {
      if (g.city === old) g.city = n;
      if (g.destination === old) g.destination = n;
    });
    persist(); emit();
  },
  deleteDestinationCity(id: string) {
    const d = load();
    const c = d.destination_cities.find((x) => x.id === id);
    if (!c) return;
    const name = c.name;
    const tourIds = d.destination_tours.filter((t) => t.city_id === id).map((t) => t.id);
    d.destination_tours = d.destination_tours.filter((t) => t.city_id !== id);
    d.destination_cities = d.destination_cities.filter((x) => x.id !== id);
    d.entrance_cities = d.entrance_cities.filter((x) => x.id !== id);
    d.entrance_sites = d.entrance_sites.filter((s) => s.city_id !== id && !(s.tour_id && tourIds.includes(s.tour_id)));
    d.activity_destinations = d.activity_destinations.filter((x) => x.id !== id);
    d.activities = d.activities.filter((a) => a.destination_id !== id);
    d.guide_cities = d.guide_cities.filter((x) => x !== name);
    d.guides = d.guides.filter((g) => (g.city ?? g.destination) !== name && !(g.tour_id && tourIds.includes(g.tour_id)));
    persist(); emit();
  },
  addDestinationTour(input: { city_id: string; title: string; description?: string }): DestinationTour | null {
    const d = load();
    const title = input.title.trim();
    if (!title) return null;
    const city = d.destination_cities.find((c) => c.id === input.city_id);
    if (!city) return null;
    if (d.destination_tours.some((t) => t.city_id === city.id && t.title.toLowerCase() === title.toLowerCase())) return null;
    const t: DestinationTour = {
      id: uid(), city_id: city.id, title,
      description: input.description?.trim() || undefined,
      created_at: now(),
    };
    d.destination_tours.push(t);
    // Mirror empty rows in entrance_sites and guides linked by tour_id.
    d.entrance_sites.push({
      id: uid(), city_id: city.id, site_name: title,
      indian_rate: 0, foreigner_rate: 0,
      notes: t.description ?? "", is_active: true,
      created_at: now(), tour_id: t.id,
    });
    d.guides.push({
      id: uid(),
      name: `${city.name} — ${title}`,
      guide_type: "English Guide - Local",
      destination: city.name,
      city: city.name,
      tour_program: title,
      rate_per_day: 0,
      description: t.description ?? "",
      is_active: true,
      created_at: now(),
      tour_id: t.id,
      languages: ["English"],
    });
    persist(); emit();
    return t;
  },
  updateDestinationTour(id: string, patch: { title?: string; description?: string }) {
    const d = load();
    const t = d.destination_tours.find((x) => x.id === id);
    if (!t) return;
    if (patch.title != null) {
      const newTitle = patch.title.trim();
      if (!newTitle) return;
      t.title = newTitle;
      d.entrance_sites.forEach((s) => { if (s.tour_id === id) s.site_name = newTitle; });
      const cityName = d.destination_cities.find((c) => c.id === t.city_id)?.name ?? "";
      d.guides.forEach((g) => {
        if (g.tour_id === id) {
          g.tour_program = newTitle;
          g.name = `${cityName} — ${newTitle}`;
        }
      });
    }
    if (patch.description !== undefined) {
      t.description = patch.description.trim() || undefined;
    }
    persist(); emit();
  },
  deleteDestinationTour(id: string) {
    const d = load();
    d.destination_tours = d.destination_tours.filter((t) => t.id !== id);
    d.entrance_sites = d.entrance_sites.filter((s) => s.tour_id !== id);
    d.guides = d.guides.filter((g) => g.tour_id !== id);
    persist(); emit();
  },

  // Upsert entrance pricing bound to a destination tour.
  upsertEntrancePricingForTour(tour_id: string, patch: Partial<EntranceSite>) {
    const d = load();
    const tour = d.destination_tours.find((t) => t.id === tour_id);
    if (!tour) return;
    let row = d.entrance_sites.find((s) => s.tour_id === tour_id);
    if (!row) {
      row = {
        id: uid(), city_id: tour.city_id, site_name: tour.title,
        indian_rate: 0, foreigner_rate: 0,
        notes: "", is_active: true, created_at: now(), tour_id,
      };
      d.entrance_sites.push(row);
    }
    Object.assign(row, patch);
    row.site_name = tour.title;
    row.city_id = tour.city_id;
    row.tour_id = tour_id;
    persist(); emit();
  },
  upsertGuidePricingForTour(tour_id: string, patch: Partial<Guide>) {
    const d = load();
    const tour = d.destination_tours.find((t) => t.id === tour_id);
    if (!tour) return;
    const cityName = d.destination_cities.find((c) => c.id === tour.city_id)?.name ?? "";
    let row = d.guides.find((g) => g.tour_id === tour_id);
    if (!row) {
      row = {
        id: uid(),
        name: `${cityName} — ${tour.title}`,
        guide_type: "English Guide - Local",
        destination: cityName,
        city: cityName,
        tour_program: tour.title,
        rate_per_day: 0,
        description: "",
        is_active: true,
        created_at: now(),
        tour_id,
        languages: ["English"],
      };
      d.guides.push(row);
    }
    Object.assign(row, patch);
    row.tour_program = tour.title;
    row.name = `${cityName} — ${tour.title}`;
    row.city = cityName;
    row.destination = cityName;
    row.tour_id = tour_id;
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
