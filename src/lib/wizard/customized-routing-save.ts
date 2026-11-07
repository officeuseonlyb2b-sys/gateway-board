import {
  getPrograms,
  nextProgramCode,
  type ProgramRoutingRow,
  type SavedProgram,
} from "@/lib/wizard/agents-store";
import {
  listItineraries,
  newItinerary,
  saveItinerary,
  type ItineraryDay,
  type ItineraryRecord,
  type ItineraryRoutingSnapshot,
} from "@/lib/itineraries-store";
import { programmeRoutingFingerprint } from "@/lib/programme-routing-identity";
import type { QuoteDraft, RoutingDay } from "@/lib/wizard/types";

export interface RoutingCity {
  id: string;
  name: string;
}

export interface CustomizedRoutingSaveResult {
  program: SavedProgram;
  itinerary: ItineraryRecord;
  draft: QuoteDraft;
  programCreated: boolean;
  itineraryCreated: boolean;
}

const normalized = (value: string | undefined) => (value || "").trim().toLocaleLowerCase();

function displayCity(value: string | undefined, cities: RoutingCity[]): string {
  if (!value) return "";
  return cities.find((city) => city.id === value)?.name || value.trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function tourTitlesForDay(day: RoutingDay): string[] {
  return unique([
    ...(day.tour_title ? [day.tour_title] : []),
    ...Object.values(day.tours_selected_by_city || {}).flat(),
  ]);
}

function destinationsForDay(day: RoutingDay, cities: RoutingCity[]): string[] {
  const ids = day.to_city_ids?.length
    ? day.to_city_ids
    : day.to_city_id
      ? [day.to_city_id]
      : [];
  const destinations = unique(ids.map((id) => displayCity(id, cities)));
  const toCity = displayCity(day.to_city, cities);
  if (toCity && !/^(departure|—|-)$/i.test(toCity) && !destinations.includes(toCity)) {
    destinations.push(toCity);
  }
  if (!destinations.length && day.city_id) destinations.push(displayCity(day.city_id, cities));
  return destinations;
}

function toProgrammeRouting(
  draft: QuoteDraft,
  cities: RoutingCity[],
  startCity: string,
): ProgramRoutingRow[] {
  const rows = [...draft.routing].sort((left, right) => left.day - right.day);
  let previousCity = startCity;
  return rows.map((day) => {
    const destinations = destinationsForDay(day, cities);
    const isDayZero = day.is_day_zero || day.day === 0;
    const fromCity = displayCity(day.from_city, cities) || previousCity;
    const destinationCity = displayCity(day.to_city, cities) || destinations.at(-1) || "";
    const overnightCity = day.overnight ? displayCity(day.city_id, cities) || destinationCity : "";
    const tourTitles = tourTitlesForDay(day);
    const tourTitlesByCity = Object.fromEntries(
      Object.entries(day.tours_selected_by_city || {})
        .map(([cityId, titles]) => [displayCity(cityId, cities), [...titles]] as [string, string[]])
        .filter(([cityName]) => Boolean(cityName)),
    );
    const programText = day.program || day.day_name || "";
    previousCity = destinationCity || overnightCity || previousCity;
    return {
      day: isDayZero ? 0 : day.day,
      from_city: fromCity,
      destination_city: destinationCity,
      to_cities: destinations,
      intermediate_cities: destinations.filter((city) => city !== destinationCity),
      overnight_city: overnightCity || null,
      travel_mode: day.travel_by,
      tour_titles: tourTitles,
      tour_titles_by_city: tourTitlesByCity,
      program_text: programText,
    };
  });
}

function routeCities(startCity: string, endCity: string, routing: ProgramRoutingRow[]): string[] {
  return unique([
    startCity,
    ...routing.flatMap((row) => [
      row.from_city || "",
      ...(row.to_cities?.length ? row.to_cities : [...(row.intermediate_cities || []), row.destination_city || ""]),
      row.overnight_city || "",
    ]),
    endCity,
  ]);
}

function routingSummary(startCity: string, endCity: string, routing: ProgramRoutingRow[]): string {
  const path: string[] = [];
  const append = (city: string) => {
    if (city && path.at(-1) !== city) path.push(city);
  };
  append(startCity);
  for (const row of routing) {
    append(row.from_city || "");
    (row.to_cities?.length ? row.to_cities : [...(row.intermediate_cities || []), row.destination_city || ""]).forEach(append);
  }
  append(endCity);
  return path.join(" → ");
}

function buildProgramme(
  draft: QuoteDraft,
  cities: RoutingCity[],
  actor: string,
  code: string,
  source: SavedProgram["source"] = "Quotation Builder",
): SavedProgram {
  const name = (draft.new_program_name || draft.program_name).trim();
  const startCity = (draft.tour_start_city || draft.departure_city).trim();
  const endCity = (draft.tour_end_city || "").trim();
  const routing = toProgrammeRouting(draft, cities, startCity);
  const cityNames = routeCities(startCity, endCity, routing);
  return {
    id: code,
    code,
    name,
    nights: draft.nights,
    days: draft.nights + 1,
    duration_label: `${draft.nights} Nights / ${draft.nights + 1} Days`,
    routing_summary: routingSummary(startCity, endCity, routing),
    routing,
    cities: cityNames,
    categories: [...draft.categories],
    departure_city: startCity,
    ending_city: endCity,
    travel_modes: unique([
      ...draft.travel_modes,
      ...routing.map((row) => row.travel_mode || ""),
    ]),
    inclusions: [...draft.inclusions],
    exclusions: [...draft.exclusions],
    source,
    status: "Active",
    created_by: actor,
  };
}

function programmeIdentity(programme: SavedProgram): string {
  return JSON.stringify({
    name: normalized(programme.name),
    nights: programme.nights,
    days: programme.days,
    departure_city: normalized(programme.departure_city),
    ending_city: normalized(programme.ending_city),
    routing_summary: normalized(programme.routing_summary),
    routing: programme.routing.map((row) => ({
      day: row.day,
      from_city: normalized(row.from_city),
      destination_city: normalized(row.destination_city),
      to_cities: (row.to_cities || []).map(normalized),
      intermediate_cities: (row.intermediate_cities || []).map(normalized),
      overnight_city: normalized(row.overnight_city || undefined),
      travel_mode: normalized(row.travel_mode),
      tour_titles: (row.tour_titles || []).map(normalized),
      tour_titles_by_city: Object.fromEntries(Object.entries(row.tour_titles_by_city || {}).map(([city, titles]) => [normalized(city), titles.map(normalized)])),
      program_text: normalized(row.program_text),
    })),
    categories: [...programme.categories].map(normalized).sort(),
    travel_modes: [...(programme.travel_modes || [])].map(normalized).sort(),
  });
}

function isDayZero(day: RoutingDay): boolean {
  return Boolean(day.is_day_zero || day.day === 0);
}

export function customizedRoutingSaveErrors(
  draft: QuoteDraft,
  cities: RoutingCity[],
  programmes: SavedProgram[] = getPrograms(),
): string[] {
  const errors: string[] = [];
  if (draft.query_type === "Brochure") errors.push("Customized quotation routings cannot be saved from Brochure Costing.");
  if (draft.program_mode !== "new") errors.push("Select New Routing / Customized before saving a new Programme.");
  if (!draft.save_program_as_new) errors.push("Enable saving this customized routing as a new Programme first.");
  if (!(draft.new_program_name || draft.program_name).trim()) errors.push("Program Name is required.");
  if (!(draft.tour_start_city || draft.departure_city).trim()) errors.push("Tour Starting City is required.");
  if (!draft.tour_end_city?.trim()) errors.push("Tour Ending City is required.");
  if (!Number.isInteger(draft.nights) || draft.nights < 1) errors.push("Tour Duration must include at least one night.");

  const tourDays = draft.routing.filter((day) => !isDayZero(day));
  if (tourDays.length !== draft.nights + 1) {
    errors.push(`Complete all ${draft.nights + 1} touring days before saving.`);
  }
  if (new Set(tourDays.map((day) => day.day)).size !== tourDays.length ||
      tourDays.some((day, index) => day.day !== index + 1)) {
    errors.push("Touring days must be numbered consecutively from Day 1 through departure day.");
  }
  if (draft.routing.filter(isDayZero).length > 1) errors.push("Only one Day 0 routing row can be saved.");
  const overnights = tourDays.filter((day) => day.overnight);
  if (overnights.length !== draft.nights) errors.push(`Select exactly ${draft.nights} required Overnight Cities.`);
  if (overnights.some((day) => !day.city_id)) errors.push("Select an Overnight City for every required night.");

  const startCity = (draft.tour_start_city || draft.departure_city).trim();
  let previousCity = startCity;
  for (const day of [...draft.routing].sort((left, right) => left.day - right.day)) {
    const fromCity = displayCity(day.from_city, cities) || previousCity;
    const destinations = destinationsForDay(day, cities);
    const overnightCity = day.overnight ? displayCity(day.city_id, cities) : "";
    if (!fromCity || !destinations.length) {
      errors.push(`${isDayZero(day) ? "Day 0" : `Day ${day.day}`} needs a From City and at least one To City/destination.`);
    }
    if (isDayZero(day) && day.overnight && !day.city_id) errors.push("Select the Day 0 Overnight City or turn off its overnight stay.");
    previousCity = destinations.at(-1) || overnightCity || previousCity;
  }

  const code = (draft.new_program_code || draft.program_code || "").trim().toUpperCase();
  if (code) {
    const sameCode = programmes.find((programme) => programme.code.trim().toUpperCase() === code);
    if (sameCode) {
      const candidate = buildProgramme(draft, cities, sameCode.created_by || "Quotation Builder", code);
      if (programmeIdentity(sameCode) !== programmeIdentity(candidate)) {
        errors.push(`Programme Code ${code} already belongs to “${sameCode.name}”. Choose a unique code or leave it blank to generate one.`);
      }
    }
  }
  const name = normalized(draft.new_program_name || draft.program_name);
  const sameName = programmes.find((programme) => normalized(programme.name) === name);
  if (sameName) {
    const candidate = buildProgramme(draft, cities, sameName.created_by || "Quotation Builder", sameName.code);
    if (programmeIdentity(sameName) !== programmeIdentity(candidate)) {
      errors.push(`Programme “${sameName.name}” already exists (${sameName.code}). Choose it instead of creating a duplicate.`);
    } else if (code && sameName.code.trim().toUpperCase() !== code) {
      errors.push(`This Programme identity is already saved as ${sameName.code}; keep its canonical code or select the existing Programme.`);
    }
  }
  return [...new Set(errors)];
}

function itineraryDays(programme: SavedProgram): ItineraryDay[] {
  return programme.routing.map((row) => {
    const stops = unique([
      row.from_city || "",
      ...(row.to_cities?.length ? row.to_cities : [...(row.intermediate_cities || []), row.destination_city || ""]),
    ]);
    const tourTitles = row.tour_titles?.length
      ? [...row.tour_titles]
      : Object.values(row.tour_titles_by_city || {}).flat().length
        ? Object.values(row.tour_titles_by_city || {}).flat()
        : row.program_text
          ? [row.program_text]
          : [];
    return {
      day: row.day,
      title: tourTitles.join(" · "),
      route: stops.join(" → "),
      cities: stops,
      overnightCity: row.overnight_city || "",
      travelMode: row.travel_mode,
      tourTitles,
      meals: "",
      description: row.program_text || "",
      sightseeing: "",
      activities: "",
      hotelNotes: "",
    };
  });
}

export async function saveCustomizedRoutingToItineraryMaster(
  draft: QuoteDraft,
  cities: RoutingCity[],
  actor: string,
  sourceQuotationId: string,
): Promise<CustomizedRoutingSaveResult> {
  const before = getPrograms();
  const errors = customizedRoutingSaveErrors(draft, cities, before);
  if (errors.length) throw new Error(errors.join(" "));

  let code = (draft.new_program_code || draft.program_code || "").trim().toUpperCase();
  if (!code) {
    const sameName = before.find((programme) => normalized(programme.name) === normalized(draft.new_program_name || draft.program_name));
    if (sameName) {
      const sameNameCandidate = buildProgramme(draft, cities, actor, sameName.code);
      if (programmeIdentity(sameName) === programmeIdentity(sameNameCandidate)) code = sameName.code;
    }
  }
  if (!code) {
    code = nextProgramCode(before);
  }
  const candidate = buildProgramme(draft, cities, actor, code);
  const sameCode = before.find((programme) => programme.code.trim().toUpperCase() === code);
  let programCreated = false;
  let programme: SavedProgram;
  if (sameCode) {
    if (programmeIdentity(sameCode) !== programmeIdentity(candidate)) {
      throw new Error(`Programme Code ${code} already belongs to “${sameCode.name}”. No existing Programme was changed.`);
    }
    programme = sameCode;
  } else {
    // The legacy Programme collection is a large localStorage cache. Routing
    // saves are durable through the Itinerary Master snapshot below, so never
    // rewrite that collection just to add one active routing.
    programme = candidate;
    programCreated = true;
  }

  const fingerprint = programmeRoutingFingerprint(programme);
  if (!fingerprint) throw new Error("The customized routing has no stable route identity and cannot be saved.");
  const routingSnapshot: ItineraryRoutingSnapshot = {
    programmeId: programme.id,
    programmeName: programme.name,
    programmeCode: programme.code,
    startCity: programme.departure_city || "",
    endCity: programme.ending_city || "",
    nights: programme.nights,
    daysCount: programme.days,
    routingSummary: programme.routing_summary,
    routingFingerprint: fingerprint,
    routing: programme.routing.map((row) => ({
      ...row,
      to_cities: row.to_cities ? [...row.to_cities] : undefined,
      intermediate_cities: row.intermediate_cities ? [...row.intermediate_cities] : undefined,
      tour_titles: row.tour_titles ? [...row.tour_titles] : undefined,
      tour_titles_by_city: row.tour_titles_by_city
        ? Object.fromEntries(Object.entries(row.tour_titles_by_city).map(([city, titles]) => [city, [...titles]]))
        : undefined,
    })),
    sourceQuotationId,
    savedAt: new Date().toISOString(),
  };
  const existingItineraries = await listItineraries();
  const existingItinerary = existingItineraries.find(
    (item) => item.sourceQuotationId === sourceQuotationId && item.programmeId === programme.id,
  ) || existingItineraries.find((item) => item.programmeId === programme.id);
  if (existingItinerary) programCreated = false;
  if (existingItinerary?.routingFingerprint && existingItinerary.routingFingerprint !== fingerprint) {
    throw new Error("An Itinerary Master record for this Programme uses a different routing. It was preserved; no duplicate was created.");
  }
  let itinerary = existingItinerary;
  if (existingItinerary && !existingItinerary.routingSnapshot) {
    const upgraded = {
      ...existingItinerary,
      sourceQuotationId: existingItinerary.sourceQuotationId || sourceQuotationId,
      routingFingerprint: fingerprint,
      routingSnapshot: {
        ...routingSnapshot,
        sourceQuotationId: existingItinerary.sourceQuotationId || sourceQuotationId,
      },
    };
    await saveItinerary(upgraded);
    const readback = await listItineraries();
    const verified = readback.find((item) => item.id === upgraded.id && item.programmeId === programme.id);
    if (!verified?.routingSnapshot || verified.routingSnapshot.routingFingerprint !== fingerprint) {
      throw new Error("Existing Itinerary routing snapshot could not be verified after linking.");
    }
    itinerary = verified;
  }

  let itineraryCreated = false;
  if (!itinerary) {
    const id = `programme-${programme.id}`;
    const idConflict = existingItineraries.find((item) => item.id === id);
    if (idConflict && idConflict.programmeId !== programme.id) {
      throw new Error("The stable Itinerary Master ID is already in use by another Programme.");
    }
    const base = newItinerary(programme, actor);
    const route = programme.routing_summary;
    itinerary = {
      ...base,
      id,
      title: programme.name,
      code: programme.code,
      programmeId: programme.id,
      programmeName: programme.name,
      programmeCode: programme.code,
      nights: programme.nights,
      daysCount: programme.days,
      startCity: programme.departure_city || "",
      endCity: programme.ending_city || "",
      route,
      days: itineraryDays(programme),
      routingFingerprint: fingerprint,
      sourceQuotationId,
      routingSnapshot,
      status: "Routing Saved",
      fieldSources: {
        title: "Programme",
        code: "Programme",
        nights: "Programme",
        daysCount: "Programme",
        startCity: "Programme",
        endCity: "Programme",
        route: "Programme",
        days: "Programme",
      },
    };
    await saveItinerary(itinerary);
    const readback = await listItineraries();
    itinerary = readback.find((item) => item.id === id && item.programmeId === programme.id);
    if (!itinerary || itinerary.routingFingerprint !== fingerprint || itinerary.sourceQuotationId !== sourceQuotationId) {
      throw new Error("Itinerary Master write could not be verified after saving. No success was reported.");
    }
    itineraryCreated = true;
  }

  return {
    program: programme,
    itinerary,
    programCreated,
    itineraryCreated,
    draft: {
      ...draft,
      program_id: programme.id,
      program_code: programme.code,
      program_name: programme.name,
      new_program_code: programme.code,
      new_program_name: programme.name,
      customized_routing_saved: true,
      customized_routing_itinerary_id: itinerary.id,
    },
  };
}

/** Save a direct Itinerary Master routing without creating a quotation. */
export async function saveManualRoutingToItineraryMaster(
  draft: QuoteDraft,
  cities: RoutingCity[],
  actor: string,
  existingItineraryId?: string,
): Promise<CustomizedRoutingSaveResult> {
  const programmes = getPrograms();
  const errors = customizedRoutingSaveErrors(draft, cities, programmes);
  if (errors.length) throw new Error(errors.join(" "));
  const code = (draft.new_program_code || draft.program_code || nextProgramCode(programmes)).trim().toUpperCase();
  const candidate = buildProgramme(draft, cities, actor, code, "Manual");
  const sameCode = programmes.find((programme) => programme.code.trim().toUpperCase() === code);
  if (sameCode && programmeIdentity(sameCode) !== programmeIdentity(candidate)) {
    throw new Error(`Programme Code ${code} already belongs to â€œ${sameCode.name}â€. No existing Programme was changed.`);
  }
  const programme = sameCode || candidate;
  const fingerprint = programmeRoutingFingerprint(programme);
  if (!fingerprint) throw new Error("The manual routing has no stable route identity and cannot be saved.");
  const snapshot: ItineraryRoutingSnapshot = {
    programmeId: programme.id, programmeName: programme.name, programmeCode: programme.code,
    startCity: programme.departure_city || "", endCity: programme.ending_city || "",
    nights: programme.nights, daysCount: programme.days, routingSummary: programme.routing_summary,
    routingFingerprint: fingerprint,
    routing: programme.routing.map((row) => ({ ...row, to_cities: row.to_cities ? [...row.to_cities] : undefined, intermediate_cities: row.intermediate_cities ? [...row.intermediate_cities] : undefined, tour_titles: row.tour_titles ? [...row.tour_titles] : undefined, tour_titles_by_city: row.tour_titles_by_city ? Object.fromEntries(Object.entries(row.tour_titles_by_city).map(([city, titles]) => [city, [...titles]])) : undefined })),
    sourceQuotationId: "", sourceType: "manual", savedAt: new Date().toISOString(),
  };
  const records = await listItineraries();
  const existing = existingItineraryId ? records.find((item) => item.id === existingItineraryId) : undefined;
  if (existing && (existing.routingSnapshot?.sourceType !== "manual" || existing.status === "Published" || existing.portalPublication)) {
    throw new Error("Only an unpublished manual routing can be edited here. The existing record was preserved.");
  }
  const conflict = records.find((item) => item.programmeId === programme.id && item.id !== existingItineraryId);
  if (conflict) throw new Error("This canonical Programme is already linked to another Itinerary Master record. No record was changed.");
  const base = existing || newItinerary(programme, actor);
  const itinerary: ItineraryRecord = {
    ...base, id: existing?.id || `programme-${programme.id}`, title: programme.name, code: programme.code,
    programmeId: programme.id, programmeName: programme.name, programmeCode: programme.code,
    nights: programme.nights, daysCount: programme.days, startCity: programme.departure_city || "", endCity: programme.ending_city || "",
    route: programme.routing_summary, days: itineraryDays(programme), routingFingerprint: fingerprint,
    sourceQuotationId: "", routingSnapshot: snapshot, status: "Routing Saved", updatedAt: new Date().toISOString(), updatedBy: actor,
    costingQuoteId: undefined, brochureId: undefined, brochureVersionId: undefined, costingVersion: undefined, pricingValidity: undefined, pricingCoverage: undefined,
    fieldSources: { ...base.fieldSources, title: "Programme", code: "Programme", nights: "Programme", daysCount: "Programme", startCity: "Programme", endCity: "Programme", route: "Programme", days: "Programme" },
  };
  await saveItinerary(itinerary, { replaceRoutingSnapshot: Boolean(existing) });
  const verified = (await listItineraries()).find((item) => item.id === itinerary.id);
  if (!verified || verified.routingFingerprint !== fingerprint || verified.routingSnapshot?.sourceType !== "manual") throw new Error("Itinerary Master write could not be verified after saving. No success was reported.");
  return { program: programme, itinerary: verified, programCreated: !sameCode, itineraryCreated: !existing, draft: { ...draft, program_id: programme.id, program_code: programme.code, program_name: programme.name, new_program_code: programme.code, new_program_name: programme.name, customized_routing_saved: true, customized_routing_itinerary_id: verified.id } };
}
