import type { SavedQuote } from "@/lib/quotes-store";
import type { SavedProgram } from "@/lib/wizard/agents-store";
import type { QuoteDraft } from "@/lib/wizard/types";

export interface RouteCityReference {
  id: string;
  name: string;
}

const normalize = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");

function fingerprint(rows: Array<[number, string, string, string, string]>): string | undefined {
  if (!rows.length) return undefined;
  const source = JSON.stringify(rows);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `route-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function programmeRoutingFingerprint(programme: SavedProgram): string | undefined {
  return fingerprint(
    (programme.routing || [])
      .filter((row) => row.day > 0)
      .map((row) => [
        row.day,
        normalize(row.from_city),
        normalize(row.destination_city || row.overnight_city),
        normalize(row.overnight_city),
        normalize(row.program_text),
      ]),
  );
}

export function quoteRoutingFingerprint(
  quote: SavedQuote,
  cities: RouteCityReference[] = [],
): string | undefined {
  const draft = quote.draft_snapshot as QuoteDraft | undefined;
  return draft ? draftRoutingFingerprint(draft, cities) : undefined;
}

export function draftRoutingFingerprint(
  draft: QuoteDraft,
  cities: RouteCityReference[] = [],
): string | undefined {
  if (!Array.isArray(draft.routing)) return undefined;
  const cityNames = new Map(cities.map((city) => [city.id, city.name]));
  const displayCity = (value: string | undefined) => (value ? cityNames.get(value) || value : "");
  return fingerprint(
    draft.routing
      .filter((day) => day.day > 0 && !day.is_day_zero)
      .map((day) => [
        day.day,
        normalize(displayCity(day.from_city)),
        normalize(displayCity(day.to_city) || displayCity(day.to_city_id) || displayCity(day.city_id)),
        normalize(day.overnight ? displayCity(day.city_id) : ""),
        normalize(day.program || day.day_name),
      ]),
  );
}

export function quoteMatchesProgrammeRouting(
  quote: SavedQuote,
  programme: SavedProgram,
  cities: RouteCityReference[] = [],
): boolean {
  if (quote.brochure_source?.programme_id !== programme.id) return false;
  const masterFingerprint = programmeRoutingFingerprint(programme);
  const snapshotFingerprint = quoteRoutingFingerprint(quote, cities);
  return Boolean(masterFingerprint && snapshotFingerprint && masterFingerprint === snapshotFingerprint);
}
