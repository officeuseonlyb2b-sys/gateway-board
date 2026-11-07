import {
  brochurePricingCoverage,
  savedBrochureCostingEligibility,
  type BrochureVersion,
} from "@/lib/brochures-store";
import type { DraftRecord } from "@/lib/drafts-store";
import type { SavedQuote } from "@/lib/quotes-store";
import type { SavedProgram } from "@/lib/wizard/agents-store";
import {
  draftRoutingFingerprint,
  programmeRoutingFingerprint,
  quoteMatchesProgrammeRouting,
  quoteRoutingFingerprint,
  type RouteCityReference,
} from "@/lib/programme-routing-identity";

export type BrochureRoutingStatus =
  | "Not Costed"
  | "Costing Draft"
  | "Costing Completed"
  | "Published"
  | "Incomplete Pricing Coverage";

export interface ProgrammeRoutingRegistryEntry {
  programme: SavedProgram;
  routeFingerprint?: string;
  routeLabel: string;
  startCity: string;
  endCity: string;
  status: BrochureRoutingStatus;
  coverageLabel: string;
  scenarioCount: number;
  missingCount: number;
  costingQuote?: SavedQuote;
  brochureVersion?: BrochureVersion;
  costingDraft?: DraftRecord;
  routeMismatchSnapshots: SavedQuote[];
}

export interface CostedProgrammeChoice {
  programme: SavedProgram;
  routeFingerprint: string;
  quote: SavedQuote;
  brochureVersion: BrochureVersion;
  coverageLabel: string;
}

const latestFirst = <T extends { saved_at?: string; updated_at?: string; version?: number }>(left: T, right: T) =>
  (right.version ?? 0) - (left.version ?? 0) ||
  (right.saved_at || right.updated_at || "").localeCompare(left.saved_at || left.updated_at || "");

function routeDescription(programme: SavedProgram): string {
  // The preserved source expression carries overnight markers and abbreviations;
  // do not infer missing city-to-city days from it.
  return programme.routing_summary || programme.routing.map((row) => row.program_text).find(Boolean) || "Routing details unavailable";
}

function startAndEnd(programme: SavedProgram) {
  const first = programme.routing[0];
  const last = programme.routing.at(-1);
  return {
    startCity: first?.from_city || programme.departure_city || first?.destination_city || programme.cities[0] || "—",
    endCity: last?.destination_city || last?.overnight_city || programme.cities.at(-1) || "—",
  };
}

function quoteCoverageComplete(quote: SavedQuote, version: BrochureVersion | undefined): boolean {
  const eligibility = savedBrochureCostingEligibility(quote);
  return Boolean(
    quote.costing_complete === true &&
      eligibility.eligible &&
      version &&
      version.scenarios.length > 0 &&
      version.validation_errors.length === 0 &&
      (version.coverage_warnings?.length ?? 0) === 0,
  );
}

export function buildProgrammeRoutingRegistry(
  programmes: SavedProgram[],
  quotes: SavedQuote[],
  brochures: BrochureVersion[],
  drafts: DraftRecord[],
  cities: RouteCityReference[] = [],
): ProgrammeRoutingRegistryEntry[] {
  return programmes.map((programme) => {
    const routeFingerprint = programmeRoutingFingerprint(programme);
    const programmeQuotes = quotes.filter((quote) => quote.brochure_source?.programme_id === programme.id);
    const matchingQuotes = programmeQuotes
      .filter((quote) => quoteMatchesProgrammeRouting(quote, programme, cities))
      .sort(latestFirst);
    const routeMismatchSnapshots = programmeQuotes.filter((quote) => !quoteMatchesProgrammeRouting(quote, programme, cities));
    const versions = brochures
      .filter((version) => version.programme_id === programme.id)
      .filter((version) => version.status !== "Archived")
      .filter((version) => {
        const source = quotes.find((quote) => quote.id === version.source_quote_id);
        if (!source || !quoteMatchesProgrammeRouting(source, programme, cities)) return false;
        return !version.route_fingerprint || version.route_fingerprint === routeFingerprint;
      })
      .sort((left, right) => latestFirst(left, right));
    const quoteWithVersion = matchingQuotes
      .map((quote) => ({ quote, version: versions.filter((item) => item.source_quote_id === quote.id).sort(latestFirst)[0] }))
      .find((item) => item.version);
    const published = versions.find((version) => version.status === "Published");
    const completed = quoteWithVersion && quoteCoverageComplete(quoteWithVersion.quote, quoteWithVersion.version);
    const incompleteVersion = versions.find((version) => version.validation_errors.length || (version.coverage_warnings?.length ?? 0) > 0 || !version.scenarios.length);
    const costingDraft = drafts
      .filter((draft) => draft.wizard_state.query_type === "Brochure" && draft.wizard_state.program_id === programme.id)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
    const draftFingerprint = costingDraft ? draftRoutingFingerprint(costingDraft.wizard_state, cities) : undefined;
    const coverageSource = published || quoteWithVersion?.version || versions[0];
    const coverage = coverageSource ? brochurePricingCoverage(coverageSource) : undefined;
    const entry: ProgrammeRoutingRegistryEntry = {
      programme,
      routeFingerprint,
      routeLabel: routeDescription(programme),
      ...startAndEnd(programme),
      status: "Not Costed",
      coverageLabel: coverage ? `${coverage.configured_pax_range} · ${coverage.valid_scenarios} scenarios · ${coverage.readiness}` : "No saved pricing coverage",
      scenarioCount: coverage?.valid_scenarios ?? 0,
      missingCount: coverage?.missing_or_invalid_scenarios ?? 0,
      costingQuote: published
        ? quotes.find((quote) => quote.id === published.source_quote_id)
        : quoteWithVersion?.quote,
      brochureVersion: published || quoteWithVersion?.version || versions[0],
      costingDraft,
      routeMismatchSnapshots,
    };
    if (published) entry.status = "Published";
    else if (completed) entry.status = "Costing Completed";
    else if (incompleteVersion) entry.status = "Incomplete Pricing Coverage";
    else if (costingDraft) entry.status = "Costing Draft";
    else if (matchingQuotes.length && !completed) entry.status = "Incomplete Pricing Coverage";
    else if (routeMismatchSnapshots.length) entry.status = "Costing Draft";
    return entry;
  });
}

export function costedProgrammeChoices(
  programmes: SavedProgram[],
  quotes: SavedQuote[],
  brochures: BrochureVersion[],
  cities: RouteCityReference[] = [],
): CostedProgrammeChoice[] {
  const choices: CostedProgrammeChoice[] = [];
  for (const quote of quotes) {
    const programme = programmes.find((candidate) => candidate.id === quote.brochure_source?.programme_id);
    if (!programme || !quoteMatchesProgrammeRouting(quote, programme, cities)) continue;
    const routeFingerprint = programmeRoutingFingerprint(programme);
    if (!routeFingerprint || quoteRoutingFingerprint(quote, cities) !== routeFingerprint) continue;
    const version = brochures
      .filter((item) => item.source_quote_id === quote.id && item.programme_id === programme.id)
      .filter((item) => item.status !== "Archived")
      .filter((item) => !item.route_fingerprint || item.route_fingerprint === routeFingerprint)
      .sort(latestFirst)[0];
    if (!quoteCoverageComplete(quote, version)) continue;
    const coverage = brochurePricingCoverage(version);
    choices.push({ programme, routeFingerprint, quote, brochureVersion: version, coverageLabel: `${coverage.configured_pax_range} · ${coverage.valid_scenarios} scenarios` });
  }
  return choices.sort((left, right) => left.programme.code.localeCompare(right.programme.code) || latestFirst(left.quote, right.quote));
}
