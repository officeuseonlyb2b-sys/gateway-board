// Seed data v2.0 — 32 hotels, validity 01 Oct 2026 – 30 Mar 2027.

export interface SeedHotel { city: string; name: string; category: string; contact_name: string; contact_phone: string; email: string; has_wifi: boolean; has_pool: boolean; }
export interface SeedRoom { city: string; hotel: string; name: string; }
export interface SeedPlan {
  city: string; hotel: string; room: string;
  start: string; end: string; season: string;
  meal: 'CP' | 'MAP' | 'AP';
  double: number; single: number; extra_bed: number;
  cwb: number | null; lunch: number | null; dinner: number | null;
  extra_bkf: number | null; xmas: number | null; nyear: number | null;
  remarks: string | null;
}

// Raw table: [city, hotelName, category, roomName, meal, dbl, sgl, extra, lunch, dinner, remarks?]
type Row = [string, string, string, string, 'CP' | 'MAP' | 'AP', number, number, number, number, number | 'INCLUDED', string?];

const ROWS: Row[] = [
  // GWALIOR
  ["Gwalior", "Prabha International", "Excellent Budget", "AC Room", "CP", 2500, 2200, 600, 500, 500],
  ["Gwalior", "Narayanam", "3 Star", "AC Deluxe Room", "CP", 3000, 2800, 800, 700, 700],
  ["Gwalior", "Regenta", "3 Star Deluxe", "AC Deluxe Room", "CP", 4500, 4000, 1200, 1000, 1000],
  ["Gwalior", "Radisson", "4 Star", "AC Standard Room", "CP", 7500, 7000, 2000, 1200, 1200],
  // ORCHHA
  ["Orchha", "Bundeli Farm Resort", "Excellent Budget", "AC Room", "CP", 2500, 2000, 600, 500, 500],
  ["Orchha", "MPT Betwa Retreat", "3 Star", "AC Room", "CP", 3500, 3000, 1000, 800, 800],
  ["Orchha", "Raj Mahal", "3 Star Deluxe", "AC Deluxe", "CP", 4000, 3500, 1200, 800, 800],
  ["Orchha", "Amar Mahal", "4 Star", "AC Deluxe", "CP", 5500, 5000, 1500, 1000, 1000],
  // KHAJURAHO
  ["Khajuraho", "Isabel Palace", "Excellent Budget", "AC Room", "CP", 2500, 2000, 1344, 600, 600],
  ["Khajuraho", "MPT Jhankar", "3 Star", "AC Room", "CP", 3000, 3000, 800, 750, 750],
  ["Khajuraho", "A S Hotel", "3 Star Deluxe", "AC Standard Room", "CP", 3500, 3200, 1000, 900, 900],
  ["Khajuraho", "Ramada By Wyndham", "4 Star", "AC Deluxe", "CP", 5500, 5000, 1200, 1000, 1000],
  // BHOPAL
  ["Bhopal", "Playsales By Playotel", "Excellent Budget", "Play Deluxe", "CP", 2600, 2300, 600, 500, 500],
  ["Bhopal", "Citurs Prime", "3 Star", "AC Standard Room", "CP", 3200, 3000, 800, 700, 700],
  ["Bhopal", "Tulip Inn", "3 Star Deluxe", "AC Deluxe", "CP", 3500, 3200, 1000, 800, 800],
  ["Bhopal", "Regenta", "4 Star", "AC Deluxe Room", "CP", 4500, 4000, 1200, 1000, 1000],
  // UJJAIN
  ["Ujjain", "Varay Express", "Excellent Budget", "AC Deluxe", "CP", 2500, 2000, 600, 500, 500],
  ["Ujjain", "MPT Shipra Residency", "3 Star", "AC Room", "CP", 3000, 3000, 700, 750, 750],
  ["Ujjain", "Playotel Premier", "3 Star Deluxe", "Play Deluxe", "CP", 4000, 3800, 1200, 750, 750],
  ["Ujjain", "Rudrakash Club & Resort", "4 Star", "AC Superior", "CP", 6500, 6000, 1500, 1000, 1000],
  // MAHESHWAR
  ["Maheshwar", "Royal Residency", "Excellent Budget", "AC Room", "CP", 2600, 2200, 600, 500, 500],
  ["Maheshwar", "MPT Narmada Resort", "3 Star", "AC Deluxe Room", "MAP", 5000, 5000, 2000, 750, "INCLUDED", "Dinner included in MAP"],
  ["Maheshwar", "MPT Narmada Resort Cottage", "3 Star Deluxe", "AC Deluxe Cottage", "MAP", 6200, 6200, 2800, 750, "INCLUDED", "Dinner included in MAP"],
  ["Maheshwar", "Amram Bagh", "4 Star", "AC Suite", "CP", 7500, 7200, 2000, 1000, 1000],
  // MANDU
  ["Mandu", "Fun N Food", "Excellent Budget", "AC Room", "CP", 3000, 3000, 800, 600, 600],
  ["Mandu", "MPT Malwa Resort", "3 Star", "AC Deluxe Room Downstairs", "CP", 4500, 4500, 1200, 800, 800],
  ["Mandu", "MPT Malwa Resort Ground", "3 Star Deluxe", "AC Deluxe Room Ground Floor", "CP", 4800, 4800, 1200, 800, 800],
  ["Mandu", "The Clarks Exotica Mandav Heritage", "4 Star", "Cottage with Private Jacuzzi", "CP", 6500, 6000, 1500, 1000, 1000],
  // INDORE
  ["Indore", "Stayzo Scheme 114", "Excellent Budget", "AC Room", "CP", 2500, 2200, 600, 500, 500],
  ["Indore", "Kyriad by OTHPL", "3 Star", "AC Standard Room", "CP", 3200, 2800, 1000, 750, 750],
  ["Indore", "Abhinandanam", "3 Star Deluxe", "AC Standard Room", "CP", 3500, 3000, 1200, 900, 900],
  ["Indore", "Ramada Encore by Wyndham", "4 Star", "AC Deluxe", "CP", 5000, 4500, 1500, 1000, 1000],
];

const CITY_SET = Array.from(new Set(ROWS.map((r) => r[0])));
export const MP_SEED_CITIES: string[] = CITY_SET;

export const MP_SEED_HOTELS: SeedHotel[] = ROWS.map((r) => ({
  city: r[0], name: r[1], category: r[2],
  contact_name: "", contact_phone: "", email: "",
  has_wifi: true, has_pool: false,
}));

export const MP_SEED_ROOMS: SeedRoom[] = ROWS.map((r) => ({
  city: r[0], hotel: r[1], name: r[3],
}));

export const MP_SEED_PLANS: SeedPlan[] = ROWS.map((r) => {
  const dinner = r[9] === "INCLUDED" ? 0 : (r[9] as number);
  return {
    city: r[0], hotel: r[1], room: r[3],
    start: "2026-10-01", end: "2027-03-30",
    season: "Winter 2026-27",
    meal: r[4],
    double: r[5], single: r[6], extra_bed: r[7],
    cwb: null,
    lunch: r[8], dinner,
    extra_bkf: null, xmas: null, nyear: null,
    remarks: r[10] ?? null,
  };
});
