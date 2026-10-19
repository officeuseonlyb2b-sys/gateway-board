import {
  guideRateForPax,
  type DB,
  type DestinationTour,
  type Guide,
  type GuideLanguage,
} from "@/lib/mock-store";
import { landDayContext } from "./land-eligibility";
import type { QuoteDraft, RoutingDay } from "./types";

export type GuideReviewRate = { label: string; rate: number };

/** Persisted quotation rate wins over mutable master data. */
export function savedQuoteRawRate(
  line: { rate: number; pax_ranges?: { from_pax: number; to_pax: number; rate: number }[] },
  pax: number,
): number {
  return (
    line.pax_ranges?.find((range) => pax >= range.from_pax && pax <= range.to_pax)?.rate ??
    line.rate
  );
}

export interface LandReviewTourRow {
  tour_id?: string;
  city_id?: string;
  city: string;
  title: string;
}

const normalized = (value?: string) =>
  (value ?? "")
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function cityName(value: string | undefined, db: DB): string {
  if (!value) return "";
  return (
    db.cities.find((city) => city.id === value)?.name ??
    db.destination_cities.find((city) => city.id === value)?.name ??
    value
  );
}

function cityDestinationIds(value: string, db: DB): string[] {
  const name = cityName(value, db);
  return db.destination_cities
    .filter((city) => normalized(city.name) === normalized(name))
    .map((city) => city.id);
}

function tourCityName(tour: DestinationTour, db: DB): string {
  return cityName(tour.city_id, db) || "—";
}

/** Resolve complete finalized routing flow without repeating adjacent cities. */
export function landReviewRouteLabel(day: RoutingDay, db: DB, departureCity?: string): string {
  const fromValue = day.from_city || departureCity || "";
  const from = cityName(fromValue, db);
  const destinations = day.to_city_ids?.length
    ? day.to_city_ids.map((id) => cityName(id, db))
    : day.to_city_id
      ? [cityName(day.to_city_id, db)]
      : day.to_city && normalized(day.to_city) !== "local"
        ? [cityName(day.to_city, db)]
        : [];
  const flow: string[] = [];
  const append = (value: string) => {
    if (value && normalized(flow[flow.length - 1]) !== normalized(value)) flow.push(value);
  };
  append(from);
  destinations.forEach(append);
  if (day.overnight) append(cityName(day.city_id, db));
  if (
    (normalized(day.to_city) === "local" ||
      (!destinations.length &&
        from &&
        normalized(from) === normalized(cityName(day.city_id, db)))) &&
    from
  )
    return `${from} Local`;
  if (!flow.length && day.city_id) append(cityName(day.city_id, db));
  return flow.join(" → ") || "—";
}

/** One row per routing-selected Tour, preserving stable Tour IDs where present. */
export function landReviewToursForDay(
  draft: QuoteDraft,
  day: RoutingDay,
  db: DB,
): LandReviewTourRow[] {
  const context = landDayContext(draft, day, db);
  const rows: LandReviewTourRow[] = [];
  const seen = new Set<string>();
  const appendMaster = (tour: DestinationTour) => {
    if (seen.has(tour.id)) return;
    seen.add(tour.id);
    rows.push({
      tour_id: tour.id,
      city_id: tour.city_id,
      city: tourCityName(tour, db),
      title: tour.title,
    });
  };
  const appendLegacy = (cityKey: string, title: string) => {
    const mappedCityIds = cityDestinationIds(cityKey, db);
    const match = context.selectedTours.find(
      (tour) =>
        normalized(tour.title) === normalized(title) &&
        (!mappedCityIds.length || mappedCityIds.includes(tour.city_id)),
    );
    if (match) {
      appendMaster(match);
      return;
    }
    const city =
      cityName(cityKey, db) || db.cities.find((item) => item.id === day.city_id)?.name || "—";
    const key = `${normalized(city)}|${normalized(title)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ city_id: cityKey, city, title });
  };

  Object.values(day.tour_ids_by_city ?? {})
    .flat()
    .forEach((id) => {
      const tour = context.selectedTours.find((item) => item.id === id);
      if (tour) appendMaster(tour);
    });
  for (const [cityKey, titles] of Object.entries(day.tours_selected_by_city ?? {}))
    titles.forEach((title) => appendLegacy(cityKey, title));
  for (const [cityKey, title] of Object.entries(day.tour_titles_by_city ?? {}))
    appendLegacy(cityKey, title);
  if (day.tour_title) appendLegacy(day.to_city_id ?? day.city_id ?? "", day.tour_title);
  context.selectedTours.forEach(appendMaster);

  if (rows.length) return rows;
  const fallbackCity = db.cities.find((city) => city.id === day.city_id)?.name || "—";
  return [{ city_id: day.city_id, city: fallbackCity, title: "—" }];
}

function configuredGuideRates(guide: Guide, language: GuideLanguage): Record<string, number> {
  const configured = guide.language_rates;
  const selected =
    configured?.[language] ??
    configured?.English ??
    configured?.Hindi ??
    (configured ? Object.values(configured).find(Boolean) : undefined);
  return (selected ?? guide) as unknown as Record<string, number>;
}

/** Slab headers from actual saved Guide rate fields; zero/missing rates remain display dashes. */
export function guideReviewSlabs(guide: Guide, language: GuideLanguage): GuideReviewRate[] {
  return Object.entries(configuredGuideRates(guide, language))
    .flatMap(([key, rate]) => {
      const bounded = key.match(/^rate_(\d+)_to_(\d+)$/);
      if (bounded) return [{ label: `${bounded[1]}–${bounded[2]}`, rate }];
      const openEnded = key.match(/^rate_(\d+)_plus$/);
      if (openEnded) return [{ label: `${openEnded[1]}+`, rate }];
      return [];
    })
    .sort((left, right) => {
      const minLeft = Number(left.label.match(/^\d+/)?.[0] ?? 0);
      const minRight = Number(right.label.match(/^\d+/)?.[0] ?? 0);
      return minLeft - minRight;
    });
}

/** Pure review projection: it never changes the guide master or quotation draft. */
export function guideReviewRates(
  guide: Guide,
  language: GuideLanguage,
  mode: "ranges" | "exact",
  exactPax: number,
): GuideReviewRate[] {
  if (mode === "exact") {
    const pax = Math.max(1, exactPax);
    const rate = guideRateForPax(guide, pax, language);
    return rate > 0 ? [{ label: `${pax} Pax`, rate }] : [];
  }

  return guideReviewSlabs(guide, language).filter((item) => item.rate > 0);
}
