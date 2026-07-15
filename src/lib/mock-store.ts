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
}

export type GuideType = "Local" | "Expert" | "Specialist";
export interface Guide {
  id: string;
  name: string;
  guide_type: GuideType;
  destination: string;
  rate_per_day: number;
  description: string;
  is_active: boolean;
  created_at: string;
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
  travel_options: TravelOption[];
}


const STORAGE_KEY = "mp-tourism-db-v2";

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
  const activity_destinations: ActivityDestination[] = [
    { id: uid(), name: "Kanha", created_at: now() },
    { id: uid(), name: "Bandhavgarh", created_at: now() },
  ];
  const activities: Activity[] = [
    {
      id: uid(), destination_id: activity_destinations[0].id,
      activity_name: "Jungle Safari", description: "Shared jeep safari inside core zone (up to 6 pax)",
      pricing_type: "total_fixed", price: 12500, unit_label: "Jungle Safari Total",
      is_active: true, created_at: now(),
    },
    {
      id: uid(), destination_id: activity_destinations[0].id,
      activity_name: "Boat Safari", description: "Guided boat safari on Banjar river",
      pricing_type: "total_fixed", price: 8500, unit_label: "Total",
      is_active: true, created_at: now(),
    },
    {
      id: uid(), destination_id: activity_destinations[1].id,
      activity_name: "Jungle Safari", description: "Shared jeep safari, Tala zone",
      pricing_type: "total_fixed", price: 13500, unit_label: "Total",
      is_active: true, created_at: now(),
    },
  ];

  const guides: Guide[] = [
    { id: uid(), name: "Local City Guide", guide_type: "Local", destination: "Any", rate_per_day: 800, description: "Half-day / full-day local city guide", is_active: true, created_at: now() },
    { id: uid(), name: "Wildlife Expert Guide", guide_type: "Expert", destination: "Kanha/Bandhavgarh", rate_per_day: 1500, description: "Experienced naturalist for jungle safaris", is_active: true, created_at: now() },
    { id: uid(), name: "Archaeological Specialist", guide_type: "Specialist", destination: "Gwalior/Orchha", rate_per_day: 1200, description: "Heritage & archaeology expert", is_active: true, created_at: now() },
  ];
  const travel_options: TravelOption[] = [
    { id: uid(), vehicle_type: "AC Bus 2×2", description: "Luxury coach for large groups", capacity_persons: 32, rate_per_day: 8000, rate_per_km: 25, is_active: true, created_at: now() },
    { id: uid(), vehicle_type: "AC Tempo Traveller", description: "Comfortable mid-size group vehicle", capacity_persons: 12, rate_per_day: 4500, rate_per_km: 18, is_active: true, created_at: now() },
    { id: uid(), vehicle_type: "AC Sedan", description: "Dzire / Etios class", capacity_persons: 4, rate_per_day: 2500, rate_per_km: 14, is_active: true, created_at: now() },
    { id: uid(), vehicle_type: "AC SUV / Innova", description: "Innova Crysta / Ertiga", capacity_persons: 6, rate_per_day: 3000, rate_per_km: 16, is_active: true, created_at: now() },
  ];

  return {
    cities, hotels, room_categories: rooms, rate_plans: plans, quotes: [],
    miscellaneous_items, entrance_cities, entrance_sites, activity_destinations, activities,
    guides, travel_options,
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
      if (!parsed.travel_options || parsed.travel_options.length === 0) {
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
