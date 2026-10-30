import type { DB, DestinationTour } from "@/lib/mock-store";
import type { QuoteDraft, RoutingDay } from "./types";

export interface LandDayContext {
  day: number;
  cityIds: string[];
  cityNames: string[];
  destinationCityIds: string[];
  tourIds: string[];
  tourTitles: string[];
  selectedTours: DestinationTour[];
  hasExplicitTourSelection: boolean;
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

const unique = <T>(values: T[]) => Array.from(new Set(values));

function operationalCityName(value: string, db: DB) {
  return db.cities.find((city) => city.id === value)?.name ?? value;
}

function destinationCityIdsFor(value: string, db: DB) {
  const cityName = operationalCityName(value, db);
  return db.destination_cities
    .filter((city) => normalized(city.name) === normalized(cityName))
    .map((city) => city.id);
}

export function landDayContext(_draft: QuoteDraft, routingDay: RoutingDay, db: DB): LandDayContext {
  const selectedTitleMap = routingDay.tours_selected_by_city ?? {};
  const selectedIdMap = routingDay.tour_ids_by_city ?? {};
  const selectionCityKeys = unique([
    ...Object.keys(selectedTitleMap),
    ...Object.keys(selectedIdMap),
    ...Object.keys(routingDay.tour_titles_by_city ?? {}),
  ]);
  const routeCityValues = [
    ...(routingDay.to_city_ids ?? []),
    routingDay.to_city_id,
    routingDay.city_id,
    routingDay.from_city,
    ...selectionCityKeys,
  ].filter(Boolean) as string[];
  const cityIds = unique(
    routeCityValues
      .map(
        (value) =>
          db.cities.find((city) => city.id === value || normalized(city.name) === normalized(value))
            ?.id,
      )
      .filter(Boolean) as string[],
  );
  const cityNames = unique(
    routeCityValues
      .map((value) => operationalCityName(value, db))
      .filter((name) => db.cities.some((city) => normalized(city.name) === normalized(name))),
  );
  const destinationCityIds = unique([
    ...routeCityValues.flatMap((value) => destinationCityIdsFor(value, db)),
    // Legacy/local fixtures used one city-ID namespace for every master.
    ...cityIds,
  ]);

  const selectedIds = unique(Object.values(selectedIdMap).flat().filter(Boolean));
  const selectedTitlesByCity = selectionCityKeys.flatMap((cityKey) => {
    const titles = selectedTitleMap[cityKey] ?? [];
    const legacyTitle = routingDay.tour_titles_by_city?.[cityKey];
    return [...titles, ...(legacyTitle ? [legacyTitle] : [])].map((title) => ({
      cityKey,
      title,
    }));
  });
  if (routingDay.tour_title) {
    selectedTitlesByCity.push({
      cityKey: routingDay.to_city_id ?? routingDay.city_id,
      title: routingDay.tour_title,
    });
  }

  const selectedToursById = db.destination_tours.filter((tour) => selectedIds.includes(tour.id));
  const selectedToursByTitle = selectedTitlesByCity.flatMap(({ cityKey, title }) => {
    const mappedCityIds = destinationCityIdsFor(cityKey, db);
    const cityScope = mappedCityIds.length > 0 ? mappedCityIds : destinationCityIds;
    return db.destination_tours.filter(
      (tour) => cityScope.includes(tour.city_id) && normalized(tour.title) === normalized(title),
    );
  });
  const selectedTours = unique([...selectedToursById, ...selectedToursByTitle]);
  const tourTitles = unique([
    ...selectedTitlesByCity.map(({ title }) => title),
    ...selectedTours.map((tour) => tour.title),
  ]);
  const hasExplicitTourSelection =
    routingDay.tour_ids_by_city !== undefined ||
    routingDay.tours_selected_by_city !== undefined ||
    routingDay.tour_titles_by_city !== undefined ||
    routingDay.tour_title !== undefined;

  return {
    day: routingDay.day,
    cityIds,
    cityNames,
    destinationCityIds,
    tourIds: selectedTours.map((tour) => tour.id),
    tourTitles,
    selectedTours,
    hasExplicitTourSelection,
  };
}

const warnedMappings = new Set<string>();

function warnUnmapped(kind: string, tours: DestinationTour[], mappedTourIds: Set<string>) {
  if (!import.meta.env.DEV) return;
  tours.forEach((tour) => {
    if (mappedTourIds.has(tour.id)) return;
    const key = `${kind}:${tour.id}`;
    if (warnedMappings.has(key)) return;
    warnedMappings.add(key);
    console.warn(
      `Selected Tour resolved successfully but no ${kind} mapping exists: Tour ID: ${tour.id}; Tour: ${tour.title}`,
    );
  });
}

export function eligibleEntrancesForDay(draft: QuoteDraft, routingDay: RoutingDay, db: DB) {
  const context = landDayContext(draft, routingDay, db);
  if ((routingDay.is_day_zero || routingDay.day === 0) && context.selectedTours.length === 0)
    return [];
  const activeForRoute = db.entrance_sites.filter(
    (site) => site.is_active && context.destinationCityIds.includes(site.city_id),
  );
  if (context.selectedTours.length > 0) {
    const mapped = activeForRoute.filter(
      (site) =>
        (site.tour_id && context.tourIds.includes(site.tour_id)) ||
        (!site.tour_id &&
          context.tourTitles.some((title) => normalized(title) === normalized(site.site_name))),
    );
    warnUnmapped(
      "Entrance",
      context.selectedTours,
      new Set(mapped.map((site) => site.tour_id).filter(Boolean) as string[]),
    );
    return mapped;
  }
  return context.hasExplicitTourSelection ? [] : activeForRoute;
}

export function eligibleGuidesForDay(draft: QuoteDraft, routingDay: RoutingDay, db: DB) {
  const context = landDayContext(draft, routingDay, db);
  if ((routingDay.is_day_zero || routingDay.day === 0) && context.selectedTours.length === 0)
    return [];
  const activeForRoute = db.guides.filter(
    (guide) =>
      guide.is_active &&
      context.cityNames.some(
        (city) => normalized(city) === normalized(guide.city ?? guide.destination),
      ),
  );
  if (context.selectedTours.length > 0) {
    const mapped = activeForRoute.filter(
      (guide) =>
        (guide.tour_id && context.tourIds.includes(guide.tour_id)) ||
        (!guide.tour_id &&
          context.tourTitles.some(
            (title) => normalized(title) === normalized(guide.tour_program ?? guide.name),
          )),
    );
    warnUnmapped(
      "Guide",
      context.selectedTours,
      new Set(mapped.map((guide) => guide.tour_id).filter(Boolean) as string[]),
    );
    return mapped;
  }
  return context.hasExplicitTourSelection ? [] : activeForRoute;
}

export function eligibleActivitiesForDay(draft: QuoteDraft, routingDay: RoutingDay, db: DB) {
  const context = landDayContext(draft, routingDay, db);
  const isDayZero = routingDay.is_day_zero || routingDay.day === 0;
  if (isDayZero && context.selectedTours.length === 0) {
    const explicitIds = new Set(
      draft.activities
        .filter(
          (line) =>
            line.independent_day_zero &&
            (line.from_routing_days ?? []).includes(routingDay.day) &&
            line.activity_id,
        )
        .map((line) => line.activity_id as string),
    );
    return db.activities.filter((activity) => activity.is_active && explicitIds.has(activity.id));
  }
  // Activities are city-based, not Tour-based. A routing day can contain an
  // intermediate city even when its selected Tour belongs to another city.
  const eligibleDestinationCityIds = unique(
    isDayZero
      ? context.selectedTours.map((tour) => tour.city_id)
      : [...context.destinationCityIds, ...context.selectedTours.map((tour) => tour.city_id)],
  );
  const eligibleCityNames = db.destination_cities
    .filter((city) => eligibleDestinationCityIds.includes(city.id))
    .map((city) => city.name);
  eligibleCityNames.push(...context.cityNames);
  const destinationIds = db.activity_destinations
    .filter((destination) =>
      eligibleCityNames.some((city) => normalized(city) === normalized(destination.name)),
    )
    .map((destination) => destination.id);
  return db.activities.filter(
    (activity) => activity.is_active && destinationIds.includes(activity.destination_id),
  );
}

/** Choices shown only after a user explicitly opens Add Activity for Day 0. */
export function eligibleActivitiesForExplicitDayZero(routingDay: RoutingDay, db: DB) {
  const context = landDayContext({ routing: [routingDay] } as QuoteDraft, routingDay, db);
  const destinationIds = db.activity_destinations
    .filter((destination) =>
      context.cityNames.some((city) => normalized(city) === normalized(destination.name)),
    )
    .map((destination) => destination.id);
  return db.activities.filter(
    (activity) => activity.is_active && destinationIds.includes(activity.destination_id),
  );
}

export function isSelectedLandServiceValid(
  kind: "activity" | "guide" | "entrance",
  masterId: string | undefined,
  day: number | undefined,
  draft: QuoteDraft,
  db: DB,
) {
  if (!masterId || day == null) return true;
  const routingDay = draft.routing.find((route) => route.day === day);
  if (!routingDay) return false;
  if (kind === "activity")
    return eligibleActivitiesForDay(draft, routingDay, db).some((item) => item.id === masterId);
  if (kind === "guide")
    return eligibleGuidesForDay(draft, routingDay, db).some((item) => item.id === masterId);
  return eligibleEntrancesForDay(draft, routingDay, db).some((item) => item.id === masterId);
}
