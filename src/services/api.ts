// Unified data-access layer. Every function returns a Promise so the entire
// call surface can be swapped to Supabase later without touching UI code.
// Currently backed by the localStorage mock-store; when Supabase is enabled,
// replace the body of each function with a supabase.from(...) call.

import {
  db, type City, type Hotel, type RoomCategory, type RatePlan,
  type HotelCategory, type MealPlan, type Quote,
  type Guide, type TravelOption,
} from "@/lib/mock-store";


const delay = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- Cities ----------
export const cityService = {
  async list(): Promise<City[]> { await delay(); return [...db.get().cities].sort((a, b) => a.name.localeCompare(b.name)); },
  async create(name: string): Promise<City> { await delay(); return db.addCity(name); },
  async findOrCreate(name: string): Promise<City> {
    const trimmed = name.trim();
    const existing = db.get().cities.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    return db.addCity(trimmed);
  },
};

// ---------- Hotels ----------
export const hotelService = {
  async list(): Promise<Hotel[]> { await delay(); return [...db.get().hotels]; },
  async get(id: string): Promise<Hotel | null> { await delay(); return db.get().hotels.find((h) => h.id === id) ?? null; },
  async create(input: Omit<Hotel, "id" | "created_at" | "updated_at">): Promise<Hotel> { await delay(); return db.addHotel(input); },
  async update(id: string, patch: Partial<Hotel>): Promise<void> { await delay(); db.updateHotel(id, patch); },
  async remove(id: string): Promise<void> { await delay(); db.deleteHotel(id); },
  async findOrCreate(input: Omit<Hotel, "id" | "created_at" | "updated_at">): Promise<Hotel> {
    const existing = db.get().hotels.find(
      (h) => h.name.toLowerCase() === input.name.toLowerCase() && h.city_id === input.city_id,
    );
    if (existing) {
      db.updateHotel(existing.id, {
        hotel_category: input.hotel_category, contact_name: input.contact_name,
        contact_phone: input.contact_phone, email: input.email,
        has_wifi: input.has_wifi, has_pool: input.has_pool, address: input.address,
      });
      return db.get().hotels.find((h) => h.id === existing.id)!;
    }
    return db.addHotel(input);
  },
};

// ---------- Room Categories ----------
export const roomService = {
  async listByHotel(hotel_id: string): Promise<RoomCategory[]> { await delay(); return db.get().room_categories.filter((r) => r.hotel_id === hotel_id); },
  async create(hotel_id: string, name: string): Promise<RoomCategory> { await delay(); return db.addRoom(hotel_id, name); },
  async remove(id: string): Promise<void> { await delay(); db.deleteRoom(id); },
  async findOrCreate(hotel_id: string, name: string): Promise<RoomCategory> {
    const existing = db.get().room_categories.find(
      (r) => r.hotel_id === hotel_id && r.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    return db.addRoom(hotel_id, name);
  },
};

// ---------- Rate Plans ----------
export const ratePlanService = {
  async listByRoom(room_category_id: string): Promise<RatePlan[]> { await delay(); return db.get().rate_plans.filter((p) => p.room_category_id === room_category_id); },
  async createMany(plans: Omit<RatePlan, "id" | "created_at" | "updated_at">[]): Promise<void> { await delay(); db.addRatePlans(plans); },
  async update(id: string, patch: Partial<RatePlan>): Promise<void> { await delay(); db.updateRatePlan(id, patch); },
  async remove(id: string): Promise<void> { await delay(); db.deleteRatePlan(id); },
  // Find the rate plan matching hotel + room + meal + check-in date
  async findMatching(opts: {
    hotel_id: string; room_category_id: string; meal_plan: MealPlan; check_in: string;
  }): Promise<RatePlan | null> {
    await delay(20);
    const { room_category_id, meal_plan, check_in } = opts;
    const t = +new Date(check_in);
    const matches = db.get().rate_plans.filter((p) =>
      p.room_category_id === room_category_id &&
      p.meal_plan === meal_plan &&
      +new Date(p.validity_start) <= t &&
      +new Date(p.validity_end) >= t,
    );
    // Prefer the most specific / latest-created
    return matches.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null;
  },
};

// ---------- Quotes ----------
export const quoteService = {
  async list(limit?: number): Promise<Quote[]> {
    await delay();
    const rows = [...db.get().quotes].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return limit ? rows.slice(0, limit) : rows;
  },
  async create(q: Omit<Quote, "id" | "created_at">): Promise<Quote> { await delay(); return db.addQuote(q); },
  async remove(id: string): Promise<void> { await delay(); db.deleteQuote(id); },
};

// ---------- Guides ----------
export const guideService = {
  async list(): Promise<Guide[]> { await delay(); return [...db.get().guides]; },
  async create(input: Omit<Guide, "id" | "created_at">): Promise<Guide> { await delay(); return db.addGuide(input); },
  async update(id: string, patch: Partial<Guide>): Promise<void> { await delay(); db.updateGuide(id, patch); },
  async remove(id: string): Promise<void> { await delay(); db.deleteGuide(id); },
};

// ---------- Travel Options ----------
export const travelService = {
  async list(): Promise<TravelOption[]> { await delay(); return [...db.get().travel_options]; },
  async create(input: Omit<TravelOption, "id" | "created_at">): Promise<TravelOption> { await delay(); return db.addTravel(input); },
  async update(id: string, patch: Partial<TravelOption>): Promise<void> { await delay(); db.updateTravel(id, patch); },
  async remove(id: string): Promise<void> { await delay(); db.deleteTravel(id); },
};

// Re-export types for consumers of the service layer
export type { City, Hotel, RoomCategory, RatePlan, HotelCategory, MealPlan, Quote, Guide, TravelOption };

