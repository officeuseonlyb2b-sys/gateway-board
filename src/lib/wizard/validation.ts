import type { DB } from "@/lib/mock-store";
import { findRatePlan } from "./rate-lookup";
import { addDaysISO } from "@/lib/format";
import {
  dayMixCoversPax,
  effectivePaxForPricing,
  parsePaxRange,
  planForDay,
} from "./calc";
import { computeScenario, type ScenarioResult } from "./scenario";
import type { CostScenario, QuoteDraft } from "./types";

export type ValidationSeverity = "blocker" | "warning";
export interface QuoteValidationIssue {
  code: string;
  severity: ValidationSeverity;
  section: string;
  message: string;
}

export interface QuoteValidationResult {
  canFinalize: boolean;
  blockers: QuoteValidationIssue[];
  warnings: QuoteValidationIssue[];
  scenarios: ScenarioResult[];
}

const issue = (
  code: string,
  severity: ValidationSeverity,
  section: string,
  message: string,
): QuoteValidationIssue => ({ code, severity, section, message });

/**
 * One authoritative readiness check used by both the Final Review UI and the
 * finalisation handler.  A button being hidden/disabled is not considered a
 * data-integrity control; finalisation always calls this function again.
 */
export function validateQuoteForFinalization(draft: QuoteDraft, db: DB): QuoteValidationResult {
  const issues: QuoteValidationIssue[] = [];
  const pax = effectivePaxForPricing(draft);
  const range = parsePaxRange(draft);
  const overnight = draft.routing.filter((day) => day.overnight);
  const commercialMode = draft.commercial_mode || "package";
  const requiresAccommodation = commercialMode !== "transport_only";
  const requiresTransport = commercialMode === "transport_only";
  const included = new Set(
    draft.included_option_keys?.length
      ? draft.included_option_keys
      : draft.hotel_options.map((option) => option.key),
  );

  if (!draft.linked_query_id) {
    issues.push(issue("QUERY_REQUIRED", "blocker", "Query", "Link this quotation to a Query before finalising."));
  }
  if (!draft.query_type) {
    issues.push(issue("TYPE_REQUIRED", "blocker", "Type", "Quotation type is missing."));
  }
  if (draft.query_type === "B2B" && !draft.agent.agent_id) {
    issues.push(issue("AGENT_MASTER_REQUIRED", "blocker", "Who", "Select a registered B2B Agent master record."));
  }
  if (draft.query_type === "B2C" && !draft.guest.name.trim()) {
    issues.push(issue("CLIENT_REQUIRED", "blocker", "Who", "Enter the B2C client details."));
  }
  if (pax < 1) {
    issues.push(issue("PAX_REQUIRED", "blocker", "Travel Requirements", "At least one traveller is required."));
  }
  if (!draft.tour_start_city && !draft.departure_city) {
    issues.push(issue("START_CITY_REQUIRED", "blocker", "Travel Requirements", "Tour starting city is required."));
  }
  if (!draft.tour_end_city) {
    issues.push(issue("END_CITY_REQUIRED", "blocker", "Travel Requirements", "Tour ending city is required."));
  }
  if (draft.query_type !== "Brochure" && (!draft.arrival_mode || !draft.departure_mode)) {
    issues.push(issue(
      "JOURNEY_MODE_PENDING",
      "warning",
      "Travel Requirements",
      "Arrival/departure mode is not yet confirmed; the quotation may proceed and these details can remain pending.",
    ));
  }
  if (draft.has_dates !== false && !draft.start_date) {
    issues.push(issue("DATE_REQUIRED", "blocker", "Travel Requirements", "Tour start date is required."));
  }
  if (!draft.program_name.trim()) {
    issues.push(issue("PROGRAM_REQUIRED", "blocker", "Program", "Select or create a program."));
  }
  if (draft.save_program_as_new && !draft.new_program_name?.trim()) {
    issues.push(issue(
      "CUSTOM_PROGRAM_NAME_REQUIRED",
      "blocker",
      "Program",
      "Give the customized routing a new Program name before saving it to the master.",
    ));
  }
  if (draft.routing.length !== draft.nights + 1) {
    issues.push(issue(
      "ROUTING_DURATION_MISMATCH",
      "blocker",
      "Routing",
      `The itinerary has ${draft.routing.length} day(s), but the trip is ${draft.nights + 1} day(s).`,
    ));
  }
  if (overnight.length !== draft.nights) {
    issues.push(issue(
      "OVERNIGHT_MISMATCH",
      "blocker",
      "Routing",
      `${draft.nights} hotel night(s) are required, but ${overnight.length} overnight row(s) are defined.`,
    ));
  }

  const selectedOptions = draft.hotel_options.filter((option) => included.has(option.key));
  if (requiresAccommodation && !selectedOptions.length) {
    issues.push(issue("HOTEL_OPTION_REQUIRED", "blocker", "Accommodation", "Include at least one completed hotel option."));
  }

  if (requiresAccommodation) selectedOptions.forEach((option) => {
    overnight.forEach((day, index) => {
      const selection = option.selections.find((item) => item.city_id === day.city_id);
      if (!selection?.hotel_id || !selection.room_id) {
        issues.push(issue(
          `HOTEL_MISSING_${option.key}_${day.day}`,
          "blocker",
          "Accommodation",
          `Option ${option.key}: hotel and room are missing for Day ${day.day}.`,
        ));
        return;
      }
      const date = day.date || addDaysISO(draft.start_date, index);
      const plan = planForDay(
        option,
        day.day,
        findRatePlan(db.rate_plans, selection.room_id, selection.meal_plan, date),
      );
      if (!plan) {
        issues.push(issue(
          `RATE_MISSING_${option.key}_${day.day}`,
          "blocker",
          "Accommodation",
          `Option ${option.key}: no valid contracted/manual rate is available for Day ${day.day}.`,
        ));
      }
      const override = option.rate_overrides?.[day.day];
      const manuallyChanged = override && [override.sgl, override.dbl, override.trp, override.quad]
        .some((value) => typeof value === "number" && value > 0);
      if (manuallyChanged && !override?.reason?.trim()) {
        issues.push(issue(
          `OVERRIDE_REASON_${option.key}_${day.day}`,
          "blocker",
          "Accommodation",
          `Option ${option.key}, Day ${day.day}: give a reason for the manual hotel-rate override.`,
        ));
      }

      const dynamic = (draft.dynamic_days ?? []).includes(day.day) || draft.allocation_mode === "dynamic";
      if (dynamic) {
        if (range) {
          issues.push(issue(
            `DYNAMIC_RANGE_${option.key}_${day.day}`,
            "blocker",
            "Accommodation",
            "Dynamic room mixes are available only for an exact traveller count, not a pax range.",
          ));
        }
        const mix = draft.day_room_mix?.[day.day];
        if (!mix || dayMixCoversPax(mix) !== pax) {
          issues.push(issue(
            `ROOM_MIX_${option.key}_${day.day}`,
            "blocker",
            "Accommodation",
            `Day ${day.day} room mix must cover exactly ${pax} traveller(s).`,
          ));
        }
        if ((mix?.quad ?? 0) > 0 && !(plan?.quad_rate && plan.quad_rate > 0)) {
          issues.push(issue(
            `QUAD_UNAVAILABLE_${option.key}_${day.day}`,
            "blocker",
            "Accommodation",
            `Day ${day.day} uses Quad rooms, but the selected hotel contract has no Quad rate.`,
          ));
        }
      }
    });
  });

  const scenarioOptions = requiresAccommodation
    ? selectedOptions
    : draft.hotel_options.slice(0, 1);
  const scenarioDefs: CostScenario[] = draft.scenarios?.length
    ? draft.scenarios
    : scenarioOptions.flatMap((option) => {
        const vehicles = draft.transport.length ? draft.transport : [undefined];
        return vehicles.map((vehicle, index) => ({
          id: `auto-${option.key}-${vehicle?.id ?? index}`,
          label: `Option ${option.key}${vehicle ? " + vehicle" : ""}`,
          option_key: option.key,
          transport_line_id: vehicle?.id,
        }));
      });
  const scenarios = scenarioDefs.map((definition) => computeScenario(draft, definition, db));
  const validScenarios = scenarios.filter((result): result is ScenarioResult => Boolean(result));
  if (!validScenarios.length) {
    issues.push(issue("SCENARIO_REQUIRED", "blocker", "Costing", "Create at least one valid costing variation."));
  }
  const selectedRateRows = Object.values(draft.rate_sheet_rows ?? {})
    .reduce((count, rows) => count + rows.length, 0);
  if (selectedRateRows === 0) {
    issues.push(issue(
      "RATE_SHEET_ROW_REQUIRED",
      "blocker",
      "Costing",
      "Select at least one final pax row in the rate sheet before generating the quotation.",
    ));
  }
  validScenarios.forEach((result) => {
    if (!result) return;
    if (result.rate_missing > 0) {
      issues.push(issue(
        `SCENARIO_RATE_${result.id}`,
        "blocker",
        "Costing",
        `${result.label} has ${result.rate_missing} missing accommodation rate(s).`,
      ));
    }
    if (!Number.isFinite(result.grand_total) || result.grand_total <= 0) {
      issues.push(issue(
        `SCENARIO_TOTAL_${result.id}`,
        "blocker",
        "Costing",
        `${result.label} does not produce a valid package total.`,
      ));
    }
    if (result.pax !== pax) {
      issues.push(issue(
        `SCENARIO_PAX_${result.id}`,
        "blocker",
        "Costing",
        `${result.label} is calculated for ${result.pax} pax while the quotation requires ${pax}.`,
      ));
    }
  });

  if (draft.revision_of_quote_id && !draft.revision_reason?.trim()) {
    issues.push(issue("REVISION_REASON", "blocker", "Versioning", "A reason is required for every revised quotation."));
  }
  if (requiresTransport && !draft.transport.length) {
    issues.push(issue("TRANSPORT_REQUIRED", "blocker", "Land Part", "Transport-only quotations require at least one vehicle option."));
  } else if (commercialMode === "package" && !draft.transport.length) {
    issues.push(issue("NO_TRANSPORT", "warning", "Land Part", "No transport is included in the package."));
  }
  if (!draft.inclusions.length) {
    issues.push(issue("NO_INCLUSIONS", "warning", "Final Review", "The quotation has no inclusion statements."));
  }

  const blockers = issues.filter((item) => item.severity === "blocker");
  const warnings = issues.filter((item) => item.severity === "warning");
  return { canFinalize: blockers.length === 0, blockers, warnings, scenarios: validScenarios };
}
