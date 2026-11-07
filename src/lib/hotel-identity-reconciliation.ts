import type { BrochureHotelRate } from "@/lib/mock-store";
import type { ParsedBrochureExcelPeriod } from "@/lib/hotel-brochure-rates-excel";

export const SKIP_BROCHURE_HOTEL_MAPPING = "__skip_brochure_period__";

export interface CurrentHotelIdentity {
  id: string;
  name: string;
  city_id: string;
}

export interface CurrentCityIdentity {
  id: string;
  name: string;
}

export interface BrochureHotelIdentityMatch {
  key: string;
  sourceHotelId: string;
  sourceCity: string;
  sourceHotelName: string;
  rows: number[];
  status: "canonical_id" | "unique_city_name" | "ambiguous" | "missing" | "manual" | "skip";
  matchedHotelId?: string;
  candidateHotelIds: string[];
  unresolved: boolean;
}

export function normalizeHotelIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function brochureHotelIdentityKey(period: Pick<ParsedBrochureExcelPeriod, "hotelId" | "sourceCity" | "sourceHotelName">): string {
  return `${period.hotelId.trim()}|${normalizeHotelIdentity(period.sourceCity)}|${normalizeHotelIdentity(period.sourceHotelName)}`;
}

export function reconcileBrochureHotelIdentities(
  periods: readonly ParsedBrochureExcelPeriod[],
  hotels: readonly CurrentHotelIdentity[],
  cities: readonly CurrentCityIdentity[],
  manualMappings: Readonly<Record<string, string>> = {},
): BrochureHotelIdentityMatch[] {
  const cityById = new Map(cities.map((city) => [city.id, city.name]));
  const grouped = new Map<string, ParsedBrochureExcelPeriod[]>();
  for (const period of periods) {
    const key = brochureHotelIdentityKey(period);
    const list = grouped.get(key) || [];
    list.push(period);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([key, rows]) => {
    const first = rows[0];
    const candidateMapping = manualMappings[key];
    const exactId = hotels.find((hotel) => hotel.id === first.hotelId);
    if (exactId) return {
      key, sourceHotelId: first.hotelId, sourceCity: first.sourceCity, sourceHotelName: first.sourceHotelName,
      rows: rows.map((item) => item.row), status: "canonical_id", matchedHotelId: exactId.id,
      candidateHotelIds: [exactId.id], unresolved: false,
    };
    const normalizedCity = normalizeHotelIdentity(first.sourceCity);
    const normalizedName = normalizeHotelIdentity(first.sourceHotelName);
    const exactIdentity = hotels.filter((hotel) =>
      normalizeHotelIdentity(cityById.get(hotel.city_id) || "") === normalizedCity &&
      normalizeHotelIdentity(hotel.name) === normalizedName,
    );
    let candidates = exactIdentity;
    let status: BrochureHotelIdentityMatch["status"] = "missing";
    let matchedHotelId: string | undefined;
    if (exactIdentity.length === 1) {
      status = "unique_city_name";
      matchedHotelId = exactIdentity[0].id;
      candidates = exactIdentity;
    } else if (exactIdentity.length > 1) {
      status = "ambiguous";
      candidates = exactIdentity;
    } else {
      candidates = hotels.filter((hotel) =>
        (normalizedName && normalizeHotelIdentity(hotel.name) === normalizedName) ||
        (normalizedCity && normalizeHotelIdentity(cityById.get(hotel.city_id) || "") === normalizedCity),
      );
    }
    if (candidateMapping === SKIP_BROCHURE_HOTEL_MAPPING) {
      status = "skip";
      matchedHotelId = undefined;
    } else if (candidateMapping) {
      const chosen = hotels.find((hotel) => hotel.id === candidateMapping);
      if (chosen && candidates.some((candidate) => candidate.id === chosen.id)) {
        status = "manual";
        matchedHotelId = chosen.id;
      }
    }
    return {
      key,
      sourceHotelId: first.hotelId,
      sourceCity: first.sourceCity,
      sourceHotelName: first.sourceHotelName,
      rows: rows.map((item) => item.row),
      status,
      matchedHotelId,
      candidateHotelIds: candidates.map((hotel) => hotel.id),
      unresolved: status === "ambiguous" || status === "missing",
    };
  });
}

export function mapPeriodsToCurrentHotelIds(
  periods: readonly ParsedBrochureExcelPeriod[],
  matches: readonly BrochureHotelIdentityMatch[],
): { mapped: ParsedBrochureExcelPeriod[]; skipped: ParsedBrochureExcelPeriod[] } {
  const byKey = new Map(matches.map((match) => [match.key, match]));
  const mapped: ParsedBrochureExcelPeriod[] = [];
  const skipped: ParsedBrochureExcelPeriod[] = [];
  for (const period of periods) {
    const match = byKey.get(brochureHotelIdentityKey(period));
    if (match?.matchedHotelId) mapped.push({ ...period, hotelId: match.matchedHotelId });
    else skipped.push(period);
  }
  return { mapped, skipped };
}

export function sameBrochureRatePeriod(
  existing: Pick<BrochureHotelRate, "validity_from" | "validity_to">,
  incoming: Pick<ParsedBrochureExcelPeriod, "validityFrom" | "validityTo">,
): boolean {
  return existing.validity_from === incoming.validityFrom && existing.validity_to === incoming.validityTo;
}
