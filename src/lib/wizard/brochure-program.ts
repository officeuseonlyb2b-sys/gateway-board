import type { ProgramRoutingRow, SavedProgram } from "./agents-store";
import { addDaysISO } from "@/lib/format";
import { emptyDraft, type QuoteDraft, type RoutingDay } from "./types";

export function routingFromProgramme(
  programme: SavedProgram,
  startDate: string,
  cityIdForName: (name: string | null | undefined) => string,
  fallbackDepartureCity = "",
): RoutingDay[] {
  const source: ProgramRoutingRow[] = programme.routing;
  return source.map((row, index) => {
    const destinations = row.to_cities?.length
      ? row.to_cities
      : [...(row.intermediate_cities || []), row.destination_city || row.overnight_city || ""].filter(Boolean);
    const destination = row.destination_city || destinations.at(-1) || row.overnight_city;
    const destinationId = cityIdForName(destination);
    const dayZero = row.day === 0;
    const toursByCity = Object.fromEntries(
      Object.entries(row.tour_titles_by_city || {})
        .map(([name, titles]) => [cityIdForName(name), [...titles]] as [string, string[]])
        .filter(([cityId]) => Boolean(cityId)),
    );
    return {
      day: row.day,
      ...(dayZero ? { is_day_zero: true } : {}),
      date: startDate ? addDaysISO(startDate, dayZero ? -1 : row.day - 1) : "",
      city_id: cityIdForName(row.overnight_city),
      to_city_id: destinationId,
      to_city_ids: destinations.map(cityIdForName).filter(Boolean),
      from_city:
        row.from_city ||
        (row.day === 1 || index === 0 ? programme.departure_city || fallbackDepartureCity : undefined),
      to_city: destination || "",
      ...(row.tour_titles?.[0] ? { tour_title: row.tour_titles[0] } : {}),
      ...(Object.keys(toursByCity).length ? { tours_selected_by_city: toursByCity } : {}),
      day_name: row.program_text || undefined,
      program: row.program_text,
      program_mode: "text",
      overnight: Boolean(row.overnight_city),
      ...(row.travel_mode ? { travel_by: row.travel_mode as RoutingDay["travel_by"] } : {}),
    };
  });
}

export function hasBrochureProgrammeDependencies(draft: QuoteDraft): boolean {
  return Boolean(
    draft.routing.length ||
      draft.transport.length ||
      draft.transport_options?.length ||
      draft.activities.length ||
      draft.entrances.length ||
      draft.guides.length ||
      draft.misc.length ||
      draft.optionals.length ||
      draft.categories.length ||
      draft.inclusions.length ||
      draft.exclusions.length ||
      draft.day_room_mix && Object.keys(draft.day_room_mix).length > 0 ||
      draft.hotel_options.some(
        (option) =>
          option.selections.length ||
          Object.keys(option.rate_overrides ?? {}).length ||
          Object.keys(option.dynamic_allocations ?? {}).length ||
          option.inclusions?.length ||
          option.exclusions?.length ||
          option.pax_allocations?.length ||
          option.allocated_pax != null,
      ) ||
      Object.keys(draft.meal_selections ?? {}).length ||
      Object.keys(draft.meal_selections_by_option ?? {}).length ||
      Object.keys(draft.scenarios ?? {}).length ||
      Object.keys(draft.rate_sheet_rows ?? {}).length ||
      Object.keys(draft.costing_selection ?? {}).length,
  );
}

export type BrochureProgrammeSelectionResult =
  | { status: "unchanged"; nextDraft: QuoteDraft }
  | { status: "confirmation_required"; nextDraft: QuoteDraft }
  | { status: "cancelled" }
  | { status: "changed"; nextDraft: QuoteDraft };

/** Prepare a confirmed Brochure Programme change without touching Programme Master. */
export function prepareBrochureProgrammeSelection(
  current: QuoteDraft,
  programme: SavedProgram,
  cityIdForName: (name: string | null | undefined) => string,
  confirmed?: boolean,
): BrochureProgrammeSelectionResult {
  if (current.program_id === programme.id) return { status: "unchanged", nextDraft: current };
  const requiresConfirmation =
    (Boolean(current.program_id) && current.program_id !== programme.id) ||
    hasBrochureProgrammeDependencies(current);
  if (requiresConfirmation && confirmed === undefined)
    return { status: "confirmation_required", nextDraft: current };
  if (requiresConfirmation && confirmed === false) return { status: "cancelled" };

  const hydrated = brochureDraftFromProgramme(programme, cityIdForName);
  const hasValidPaxRange =
    current.query_type === "Brochure" &&
    Number.isInteger(current.pax_min) &&
    Number.isInteger(current.pax_max) &&
    (current.pax_min ?? 0) >= 1 &&
    (current.pax_max ?? 0) >= (current.pax_min ?? 0);
  return {
    status: "changed",
    nextDraft: {
      ...hydrated,
      step: 2,
      programme_days: programme.days,
      ...(hasValidPaxRange
        ? {
            pax_mode: "range" as const,
            pax_min: current.pax_min,
            pax_max: current.pax_max,
            pax_range: `${current.pax_min}-${current.pax_max}`,
          }
        : {}),
      has_dates: current.has_dates ?? false,
      start_date: current.start_date || hydrated.start_date,
      brochure_validity_from: current.brochure_validity_from || "",
      brochure_validity_till: current.brochure_validity_till || "",
      markup_percent: current.markup_percent,
      land_markup_percent: current.land_markup_percent,
      land_gst_percent: current.land_gst_percent,
      hotel_markup_percent: current.hotel_markup_percent,
      hotel_gst_percent: current.hotel_gst_percent,
      brochure: {
        ...hydrated.brochure,
        ...current.brochure,
        tour_type: "Brochure",
        theme: programme.name,
      },
      traveler_type: current.traveler_type || hydrated.traveler_type,
      children: current.children,
    },
  };
}

/** Build a new editable, CRM-independent Brochure draft from a master programme. */
export function brochureDraftFromProgramme(
  programme: SavedProgram,
  cityIdForName: (name: string | null | undefined) => string,
): QuoteDraft {
  const draft = emptyDraft();
  const touringRows = programme.routing.filter((row) => row.day > 0);
  const firstTouringRow = touringRows[0] || programme.routing[0];
  const lastTouringRow = touringRows.at(-1) || programme.routing.at(-1);
  return {
    ...draft,
    step: 3,
    query_type: "Brochure",
    tour_type: "Brochure",
    query_for: "Package",
    commercial_mode: "package",
    has_dates: false,
    pax_mode: "range",
    pax_min: 1,
    pax_max: 40,
    pax_range: "1-40",
    brochure: { ...draft.brochure, tour_type: "Brochure", theme: programme.name },
    program_mode: "existing",
    program_id: programme.id,
    program_code: programme.code,
    program_name: programme.name,
    programme_days: programme.days,
    nights: programme.nights,
    categories: programme.categories?.length ? [...programme.categories] : draft.categories,
    travel_modes: programme.travel_modes?.length ? [...programme.travel_modes] : draft.travel_modes,
    routing: routingFromProgramme(
      programme,
      "",
      cityIdForName,
      draft.tour_start_city,
    ),
    tour_start_city:
      firstTouringRow?.from_city ||
      programme.departure_city ||
      firstTouringRow?.destination_city ||
      firstTouringRow?.overnight_city ||
      programme.cities[0] ||
      "",
    tour_end_city:
      programme.ending_city ||
      lastTouringRow?.destination_city ||
      lastTouringRow?.overnight_city ||
      programme.cities.at(-1) ||
      "",
    departure_city:
      programme.departure_city ||
      programme.routing[0]?.from_city ||
      programme.routing[0]?.destination_city ||
      programme.cities[0] ||
      "",
    inclusions: programme.inclusions?.length ? [...programme.inclusions] : draft.inclusions,
    exclusions: programme.exclusions?.length ? [...programme.exclusions] : draft.exclusions,
  };
}
