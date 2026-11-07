import type { DB } from "@/lib/mock-store";

export interface HotelMasterRecoveryBackup {
  format: "mp-tourism-hotel-master-recovery";
  format_version: number;
  exported_at: string;
  source: string;
  master_sync_status: string;
  current_shared_master_sha256: string;
  hotel_master: DB;
}

export interface HotelMasterRecoveryReport {
  exportedAt: string;
  originalHotelCount: number;
  originalCityCount: number;
  originalRoomCount: number;
  originalSupplierRateCount: number;
  originalBrochureRateCount: number;
  hotelsAdded: number;
  hotelsAlreadyPresent: number;
  citiesAdded: number;
  roomsAdded: number;
  supplierRatesAdded: number;
  supplierRatesAlreadyPresent: number;
  brochureRatesAdded: number;
  brochureRatesAlreadyPresent: number;
  conflicts: string[];
}

export interface HotelMasterRecoveryMerge {
  report: HotelMasterRecoveryReport;
  additions: Pick<DB, "cities" | "hotels" | "room_categories" | "rate_plans" | "brochure_hotel_rates">;
}

const normalized = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export async function verifyHotelMasterRecoveryBackup(value: unknown): Promise<HotelMasterRecoveryBackup> {
  const backup = value as Partial<HotelMasterRecoveryBackup> | null;
  if (!backup || backup.format !== "mp-tourism-hotel-master-recovery" || backup.format_version !== 1) {
    throw new Error("Unsupported Hotel Master recovery file format.");
  }
  if (backup.source !== "authenticated shared master snapshot" || backup.master_sync_status !== "ready") {
    throw new Error("Recovery file is not marked as a ready authenticated shared-master snapshot.");
  }
  const master = backup.hotel_master as DB | undefined;
  if (!master || !Array.isArray(master.hotels) || !Array.isArray(master.cities) || !Array.isArray(master.room_categories) || !Array.isArray(master.rate_plans)) {
    throw new Error("Recovery file is missing required Hotel Master arrays.");
  }
  if (typeof crypto === "undefined" || !crypto.subtle || !backup.current_shared_master_sha256) {
    throw new Error("Could not verify the recovery file checksum in this browser.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(master));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual.toLowerCase() !== backup.current_shared_master_sha256.toLowerCase()) {
    throw new Error("Recovery file checksum does not match; the backup may be incomplete or altered.");
  }
  return backup as HotelMasterRecoveryBackup;
}

function planRows<T extends { id: string }>(
  source: readonly T[],
  existing: readonly T[],
  same: (left: T, right: T) => boolean,
  label: string,
  conflicts: string[],
): { additions: T[]; alreadyPresent: number } {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const additions: T[] = [];
  let alreadyPresent = 0;
  for (const item of source) {
    const sameId = byId.get(item.id);
    if (sameId) {
      if (!same(sameId, item)) conflicts.push(`${label} ID ${item.id} exists with different identity/data; existing record was left unchanged.`);
      else alreadyPresent += 1;
      continue;
    }
    additions.push(item);
  }
  return { additions, alreadyPresent };
}

export function planHotelMasterRecovery(current: DB, backup: HotelMasterRecoveryBackup): HotelMasterRecoveryMerge {
  const source = backup.hotel_master;
  const conflicts: string[] = [];
  const cityIdMap = new Map<string, string>();
  const currentCitiesByName = new Map<string, typeof current.cities>();
  for (const city of current.cities) {
    const key = normalized(city.name);
    const list = currentCitiesByName.get(key) || [];
    list.push(city);
    currentCitiesByName.set(key, list);
  }
  const citiesToAdd = [] as typeof current.cities;
  for (const sourceCity of source.cities) {
    const sameId = current.cities.find((city) => city.id === sourceCity.id);
    if (sameId) {
      if (normalized(sameId.name) !== normalized(sourceCity.name)) conflicts.push(`City ID ${sourceCity.id} has a different name in the current master.`);
      else cityIdMap.set(sourceCity.id, sameId.id);
      continue;
    }
    const sameName = currentCitiesByName.get(normalized(sourceCity.name)) || [];
    if (sameName.length === 1) {
      cityIdMap.set(sourceCity.id, sameName[0].id);
      continue;
    }
    if (sameName.length > 1) {
      conflicts.push(`City “${sourceCity.name}” matches multiple current city records; manual reconciliation is required.`);
      continue;
    }
    citiesToAdd.push(sourceCity);
    cityIdMap.set(sourceCity.id, sourceCity.id);
  }

  const hotelIdMap = new Map<string, string>();
  const hotelsToAdd = [] as typeof current.hotels;
  let hotelsAlreadyPresent = 0;
  for (const sourceHotel of source.hotels) {
    const currentHotel = current.hotels.find((hotel) => hotel.id === sourceHotel.id);
    const mappedCityId = cityIdMap.get(sourceHotel.city_id);
    if (!mappedCityId) {
      conflicts.push(`Hotel ${sourceHotel.name} (${sourceHotel.id}) has no reconciled City ID.`);
      continue;
    }
    if (currentHotel) {
      if (normalized(currentHotel.name) !== normalized(sourceHotel.name) || currentHotel.city_id !== mappedCityId) {
        conflicts.push(`Hotel ID ${sourceHotel.id} conflicts with a different current Hotel identity; existing record was left unchanged.`);
      } else {
        hotelsAlreadyPresent += 1;
        hotelIdMap.set(sourceHotel.id, currentHotel.id);
      }
      continue;
    }
    const duplicate = current.hotels.find((hotel) => hotel.city_id === mappedCityId && normalized(hotel.name) === normalized(sourceHotel.name));
    if (duplicate) {
      conflicts.push(`Recovery Hotel ${sourceHotel.name} (${sourceHotel.id}) matches current Hotel ${duplicate.id} by City + Name; duplicate was not created.`);
      continue;
    }
    hotelsToAdd.push({ ...sourceHotel, city_id: mappedCityId });
    hotelIdMap.set(sourceHotel.id, sourceHotel.id);
  }

  const roomIdMap = new Map<string, string>();
  const roomsToAdd = [] as typeof current.room_categories;
  let roomsAlreadyPresent = 0;
  for (const sourceRoom of source.room_categories) {
    const hotelId = hotelIdMap.get(sourceRoom.hotel_id);
    if (!hotelId) {
      conflicts.push(`Room ${sourceRoom.name} (${sourceRoom.id}) has no reconciled Hotel ID.`);
      continue;
    }
    const sameId = current.room_categories.find((room) => room.id === sourceRoom.id);
    if (sameId) {
      if (sameId.hotel_id !== hotelId || normalized(sameId.name) !== normalized(sourceRoom.name)) conflicts.push(`Room ID ${sourceRoom.id} conflicts with existing room identity.`);
      else {
        roomIdMap.set(sourceRoom.id, sameId.id);
        roomsAlreadyPresent += 1;
      }
      continue;
    }
    const sameName = [...current.room_categories, ...roomsToAdd].filter((room) => room.hotel_id === hotelId && normalized(room.name) === normalized(sourceRoom.name));
    if (sameName.length === 1) {
      roomIdMap.set(sourceRoom.id, sameName[0].id);
      roomsAlreadyPresent += 1;
      continue;
    }
    if (sameName.length > 1) {
      conflicts.push(`Room “${sourceRoom.name}” has multiple current matches under Hotel ${hotelId}.`);
      continue;
    }
    roomsToAdd.push({ ...sourceRoom, hotel_id: hotelId });
    roomIdMap.set(sourceRoom.id, sourceRoom.id);
  }

  const supplierRatesToAdd = [] as typeof current.rate_plans;
  let supplierRatesAlreadyPresent = 0;
  for (const sourceRate of source.rate_plans) {
    const roomId = roomIdMap.get(sourceRate.room_category_id);
    if (!roomId) {
      conflicts.push(`Supplier rate ${sourceRate.id} has no reconciled Room ID.`);
      continue;
    }
    const candidate = { ...sourceRate, room_category_id: roomId };
    const sameId = current.rate_plans.find((rate) => rate.id === candidate.id);
    if (sameId) {
      if (JSON.stringify(sameId) !== JSON.stringify(candidate)) conflicts.push(`Supplier rate ID ${candidate.id} already exists with different values; no overwrite was made.`);
      else supplierRatesAlreadyPresent += 1;
      continue;
    }
    const sameKey = [...current.rate_plans, ...supplierRatesToAdd].find((rate) =>
      rate.room_category_id === roomId && rate.hotel_category === candidate.hotel_category &&
      rate.validity_start === candidate.validity_start && rate.validity_end === candidate.validity_end &&
      rate.season_label === candidate.season_label && rate.meal_plan === candidate.meal_plan,
    );
    if (sameKey) {
      if (JSON.stringify(sameKey) !== JSON.stringify(candidate)) conflicts.push(`Supplier rate period ${candidate.validity_start}–${candidate.validity_end} conflicts for room ${roomId}; no overwrite was made.`);
      else supplierRatesAlreadyPresent += 1;
      continue;
    }
    supplierRatesToAdd.push(candidate);
  }

  const brochureRatesToAdd = [] as typeof current.brochure_hotel_rates;
  let brochureRatesAlreadyPresent = 0;
  for (const sourceRate of source.brochure_hotel_rates || []) {
    const hotelId = hotelIdMap.get(sourceRate.hotel_id);
    if (!hotelId) {
      conflicts.push(`Brochure rate ${sourceRate.id} has no reconciled Hotel ID.`);
      continue;
    }
    const candidate = { ...sourceRate, hotel_id: hotelId };
    const sameId = (current.brochure_hotel_rates || []).find((rate) => rate.id === candidate.id);
    const samePeriod = [...(current.brochure_hotel_rates || []), ...brochureRatesToAdd].find((rate) => rate.hotel_id === hotelId && rate.validity_from === candidate.validity_from && rate.validity_to === candidate.validity_to);
    const existing = sameId || samePeriod;
    if (existing) {
      if (existing.rate_basis !== candidate.rate_basis || existing.single !== candidate.single || existing.double !== candidate.double || existing.triple !== candidate.triple || existing.extra_bed !== candidate.extra_bed || existing.child !== candidate.child || JSON.stringify(existing.pricing_basis) !== JSON.stringify(candidate.pricing_basis)) {
        conflicts.push(`Brochure rate period ${candidate.validity_from}–${candidate.validity_to} conflicts for Hotel ${hotelId}; no overwrite was made.`);
      } else brochureRatesAlreadyPresent += 1;
      continue;
    }
    brochureRatesToAdd.push(candidate);
  }

  return {
    report: {
      exportedAt: backup.exported_at,
      originalHotelCount: source.hotels.length,
      originalCityCount: source.cities.length,
      originalRoomCount: source.room_categories.length,
      originalSupplierRateCount: source.rate_plans.length,
      originalBrochureRateCount: source.brochure_hotel_rates?.length || 0,
      hotelsAdded: hotelsToAdd.length,
      hotelsAlreadyPresent,
      citiesAdded: citiesToAdd.length,
      roomsAdded: roomsToAdd.length,
      supplierRatesAdded: supplierRatesToAdd.length,
      supplierRatesAlreadyPresent,
      brochureRatesAdded: brochureRatesToAdd.length,
      brochureRatesAlreadyPresent,
      conflicts,
    },
    additions: { cities: citiesToAdd, hotels: hotelsToAdd, room_categories: roomsToAdd, rate_plans: supplierRatesToAdd, brochure_hotel_rates: brochureRatesToAdd },
  };
}
