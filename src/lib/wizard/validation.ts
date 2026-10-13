import type { DB } from "@/lib/mock-store";
import { findRatePlan } from "./rate-lookup";
import { addDaysISO } from "@/lib/format";
import {
  effectivePaxForPricing,
  parsePaxRange,
  planForDay,
} from "./calc";
import { computeScenario, type ScenarioResult } from "./scenario";
import type { CostScenario, QuoteDraft } from "./types";
import { normalizeQueryFor } from "@/lib/query-for";
import { getEscortPricingMode, isEscortEnabled } from "./guide-pricing";

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
  const queryFor = normalizeQueryFor(draft.query_for) || "Package";
  const commercialMode = draft.commercial_mode || "package";
  const requiresAccommodation = commercialMode !== "transport_only";
  const requiresTransport = commercialMode === "transport_only";
  const escortMode = getEscortPricingMode(draft);
  const included = new Set(
    draft.included_option_keys?.length
      ? draft.included_option_keys
      : draft.hotel_options.map((option) => option.key),
  );

  if (!draft.query_type) {
    issues.push(issue("TYPE_REQUIRED", "blocker", "Type", "Quotation type is missing."));
  }
  if (draft.pax_mode === "range") {
    if (!Number.isInteger(draft.pax_min) || !Number.isInteger(draft.pax_max) || (draft.pax_min ?? 0) < 1 || (draft.pax_max ?? 0) < (draft.pax_min ?? 0)) {
      issues.push(issue("PAX_RANGE_INVALID", "blocker", "Travel Requirements", "Enter a valid minimum and maximum pax range."));
    }
  } else if (draft.children.some((child) => child.age === undefined || child.age < 0 || child.age > 17)) {
    issues.push(issue("CHILD_AGE_REQUIRED", "blocker", "Travel Requirements", "Every child must have a valid age."));
  }
  if (isEscortEnabled(draft) && !escortMode) {
    issues.push(issue("ESCORT_MODE_REQUIRED", "blocker", "Guide", "Choose Pax Slab / Range or Day-wise Escort pricing."));
  }
  if (isEscortEnabled(draft) && escortMode === "pax_range" && (draft.escort_ranges ?? []).some(
    (escort) => !Number.isInteger(escort.min_pax)
      || !Number.isInteger(escort.max_pax)
      || escort.min_pax < 1
      || escort.max_pax < escort.min_pax,
  )) {
    issues.push(issue("ESCORT_RANGE_INVALID", "blocker", "Guide", "Each Escort range must have Min Pax ≥ 1 and Max Pax ≥ Min Pax."));
  }
  if (isEscortEnabled(draft) && escortMode === "day_wise"
    && ((draft.escort_day_min_pax != null && draft.escort_day_min_pax < 1)
      || (draft.escort_day_min_pax != null && draft.escort_day_max_pax != null && draft.escort_day_max_pax < draft.escort_day_min_pax))) {
    issues.push(issue("ESCORT_DAY_RANGE_INVALID", "blocker", "Guide", "Enter a valid optional Escort pax applicability range."));
  }
  if (queryFor === "Package" && (draft.land_gst_percent !== 5 || draft.hotel_gst_percent !== 5)) {
    issues.push(issue("PACKAGE_GST_FIXED", "blocker", "Commercial Setup", "Package GST must be fixed at 5%."));
  }
  if ((queryFor === "Land Part" && ![5, 18].includes(draft.land_gst_percent ?? 0)) || (queryFor === "Accommodation Part" && ![5, 18].includes(draft.hotel_gst_percent ?? 0))) {
    issues.push(issue("GST_INVALID", "blocker", "Commercial Setup", "GST must be 5% or 18% for this Query For bucket."));
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
  if (!draft.program_name.trim() && !(draft.program_mode === "new" && draft.save_program_as_new && draft.new_program_name?.trim())) {
    if (draft.program_mode === "new" && !draft.save_program_as_new) {
      issues.push(issue("CUSTOM_PROGRAM_REQUIRED", "blocker", "Routing", "Enable saving this finalized customized routing as a new Program and provide its name."));
    } else {
      issues.push(issue("PROGRAM_REQUIRED", "blocker", "Program", "Select or create a program."));
    }
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
      const dynamic = (draft.dynamic_days ?? []).includes(day.day) || draft.allocation_mode === "dynamic";
      const selection = option.selections.find((item) => item.city_id === day.city_id);
      if (!selection?.hotel_id || (!dynamic && !selection.room_id)) {
        issues.push(issue(
          `HOTEL_MISSING_${option.key}_${day.day}`,
          "blocker",
          "Accommodation",
          `Option ${option.key}: hotel and room are missing for Day ${day.day}.`,
        ));
        return;
      }
      const date = day.date || addDaysISO(draft.start_date, index);
      const plan = !dynamic && selection?.room_id
        ? planForDay(
            option,
            day.day,
            findRatePlan(db.rate_plans, selection.room_id, selection.meal_plan, date),
          )
        : null;
      if (!dynamic && !plan) {
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

      const allocations = option.dynamic_allocations?.[day.day] ?? [];
      if (dynamic) {
        for (const allocation of allocations) {
          if (allocation.manual_net_rate != null && !allocation.override_reason?.trim()) {
            issues.push(issue(
              `DYNAMIC_OVERRIDE_REASON_${option.key}_${day.day}_${allocation.id}`,
              "blocker",
              "Accommodation",
              `Option ${option.key}, Day ${day.day}: provide a reason for the Dynamic room-rate override.`,
            ));
          }
        }
      }

      if (dynamic) {
        if (range) {
          issues.push(issue(
            `DYNAMIC_RANGE_${option.key}_${day.day}`,
            "blocker",
            "Accommodation",
            "Dynamic room mixes are available only for an exact traveller count, not a pax range.",
          ));
        }
        const capacityFor = { single: 1, double: 2, triple: 3, quad: 4 } as const;
        const allocatedCapacity = allocations.reduce(
          (sum, allocation) => sum + Math.max(0, allocation.rooms) * capacityFor[allocation.occupancy],
          0,
        );
        if (allocatedCapacity < pax) {
          issues.push(issue(
            `DYNAMIC_CAPACITY_${option.key}_${day.day}`,
            "blocker",
            "Accommodation",
            `Option ${option.key}, Day ${day.day}: allocated capacity ${allocatedCapacity} is below ${pax} traveller(s).`,
          ));
        }
        allocations.forEach((allocation) => {
          const room = db.room_categories.find((item) => item.id === allocation.room_id);
          if (!allocation.room_id || !room || room.hotel_id !== selection?.hotel_id) {
            issues.push(issue(
              `DYNAMIC_ROOM_${option.key}_${day.day}_${allocation.id}`,
              "blocker",
              "Accommodation",
              `Option ${option.key}, Day ${day.day}: select a room category from the chosen hotel.`,
            ));
            return;
          }
          const allocationPlan = findRatePlan(db.rate_plans, allocation.room_id, selection.meal_plan, date);
          const masterNet = allocationPlan
            ? allocation.occupancy === "single"
              ? allocationPlan.single_rate
              : allocation.occupancy === "double"
                ? allocationPlan.double_rate
                : allocation.occupancy === "triple"
                  ? allocationPlan.double_rate + (allocationPlan.extra_bed_rate || 0)
                  : (allocationPlan.quad_rate ?? 0)
            : 0;
          if (!(allocation.manual_net_rate != null && allocation.manual_net_rate > 0) && !(masterNet > 0)) {
            issues.push(issue(
              `DYNAMIC_RATE_MISSING_${option.key}_${day.day}_${allocation.id}`,
              "blocker",
              "Accommodation",
              `Option ${option.key}, Day ${day.day}: no contracted rate is available for this room occupancy.`,
            ));
          }
        });
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
