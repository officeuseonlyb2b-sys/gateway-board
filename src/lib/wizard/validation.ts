import type { DB } from "@/lib/mock-store";
import { findRatePlan } from "./rate-lookup";
import {
  accommodationNightDate,
  effectivePaxForPricing,
  effectiveAccommodationPax,
  paxRangeActive,
  isSplitAccommodation,
  parsePaxRange,
  planForDay,
  splitAccommodationAllocation,
} from "./calc";
import { computeScenario, type ScenarioResult } from "./scenario";
import {
  accommodationNightsForOption,
  hotelSelectionForDay,
  isDynamicAccommodationMode,
  type CostScenario,
  type QuoteDraft,
} from "./types";
import { normalizeQueryFor, getQuotationScope } from "@/lib/query-for";
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

export function isRoutingReady(draft: Pick<QuoteDraft, "routing" | "nights">): boolean {
  const tourDays = draft.routing.filter((day) => !(day.is_day_zero || day.day === 0));
  const overnight = tourDays.filter((day) => day.overnight);
  return (
    draft.nights > 0 &&
    tourDays.length === draft.nights + 1 &&
    overnight.length === draft.nights &&
    overnight.every((day) => Boolean(day.city_id))
  );
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
  const tourDays = draft.routing.filter((day) => !(day.is_day_zero || day.day === 0));
  const overnight = tourDays.filter((day) => day.overnight);
  const queryFor = normalizeQueryFor(draft.query_for) || "Package";
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  const requiresAccommodation = scope.accommodationPart;
  const requiresLand = scope.landPart;
  const escortMode = getEscortPricingMode(draft);
  const included = new Set(
    draft.included_option_keys?.length
      ? draft.included_option_keys
      : draft.hotel_options.map((option) => option.key),
  );

  if (!draft.query_type) {
    issues.push(issue("TYPE_REQUIRED", "blocker", "Type", "Quotation type is missing."));
  }
  if (paxRangeActive(draft)) {
    if (
      !Number.isInteger(draft.pax_min) ||
      !Number.isInteger(draft.pax_max) ||
      (draft.pax_min ?? 0) < 1 ||
      (draft.pax_max ?? 0) < (draft.pax_min ?? 0)
    ) {
      issues.push(
        issue(
          "PAX_RANGE_INVALID",
          "blocker",
          "Travel Requirements",
          "Enter a valid minimum and maximum pax range.",
        ),
      );
    }
  } else if (
    draft.children.some((child) => child.age === undefined || child.age < 0 || child.age > 17)
  ) {
    issues.push(
      issue(
        "CHILD_AGE_REQUIRED",
        "blocker",
        "Travel Requirements",
        "Every child must have a valid age.",
      ),
    );
  }
  if (isEscortEnabled(draft) && !escortMode) {
    issues.push(
      issue(
        "ESCORT_MODE_REQUIRED",
        "blocker",
        "Guide",
        "Choose Pax Slab / Range or Day-wise Escort pricing.",
      ),
    );
  }
  if (
    isEscortEnabled(draft) &&
    escortMode === "pax_range" &&
    (draft.escort_ranges ?? []).some(
      (escort) =>
        !Number.isInteger(escort.min_pax) ||
        !Number.isInteger(escort.max_pax) ||
        escort.min_pax < 1 ||
        escort.max_pax < escort.min_pax,
    )
  ) {
    issues.push(
      issue(
        "ESCORT_RANGE_INVALID",
        "blocker",
        "Guide",
        "Each Escort range must have Min Pax ≥ 1 and Max Pax ≥ Min Pax.",
      ),
    );
  }
  if (
    isEscortEnabled(draft) &&
    escortMode === "day_wise" &&
    ((draft.escort_day_min_pax != null && draft.escort_day_min_pax < 1) ||
      (draft.escort_day_min_pax != null &&
        draft.escort_day_max_pax != null &&
        draft.escort_day_max_pax < draft.escort_day_min_pax))
  ) {
    issues.push(
      issue(
        "ESCORT_DAY_RANGE_INVALID",
        "blocker",
        "Guide",
        "Enter a valid optional Escort pax applicability range.",
      ),
    );
  }
  if (queryFor === "Package" && (draft.land_gst_percent !== 5 || draft.hotel_gst_percent !== 5)) {
    issues.push(
      issue("PACKAGE_GST_FIXED", "blocker", "Commercial Setup", "Package GST must be fixed at 5%."),
    );
  }
  if (
    (queryFor === "Land Part" && ![5, 18].includes(draft.land_gst_percent ?? 0)) ||
    (queryFor === "Accommodation Part" && ![5, 18].includes(draft.hotel_gst_percent ?? 0))
  ) {
    issues.push(
      issue(
        "GST_INVALID",
        "blocker",
        "Commercial Setup",
        "GST must be 5% or 18% for this Query For bucket.",
      ),
    );
  }
  if (draft.query_type === "B2B" && !draft.agent.agent_id) {
    issues.push(
      issue(
        "AGENT_MASTER_REQUIRED",
        "blocker",
        "Who",
        "Select a registered B2B Agent master record.",
      ),
    );
  }
  if (draft.query_type === "B2C" && !draft.guest.name.trim()) {
    issues.push(issue("CLIENT_REQUIRED", "blocker", "Who", "Enter the B2C client details."));
  }
  if (pax < 1) {
    issues.push(
      issue(
        "PAX_REQUIRED",
        "blocker",
        "Travel Requirements",
        "At least one traveller is required.",
      ),
    );
  }
  if (!draft.tour_start_city && !draft.departure_city) {
    issues.push(
      issue(
        "START_CITY_REQUIRED",
        "blocker",
        "Travel Requirements",
        "Tour starting city is required.",
      ),
    );
  }
  if (!draft.tour_end_city) {
    issues.push(
      issue("END_CITY_REQUIRED", "blocker", "Travel Requirements", "Tour ending city is required."),
    );
  }
  if (draft.query_type !== "Brochure" && (!draft.arrival_mode || !draft.departure_mode)) {
    issues.push(
      issue(
        "JOURNEY_MODE_PENDING",
        "warning",
        "Travel Requirements",
        "Arrival/departure mode is not yet confirmed; the quotation may proceed and these details can remain pending.",
      ),
    );
  }
  if (draft.has_dates !== false && !draft.start_date) {
    issues.push(
      issue("DATE_REQUIRED", "blocker", "Travel Requirements", "Tour start date is required."),
    );
  }
  if (
    draft.query_type === "Brochure" &&
    draft.has_dates !== false &&
    draft.start_date &&
    draft.brochure_validity_from &&
    draft.brochure_validity_till &&
    (draft.start_date < draft.brochure_validity_from || draft.start_date > draft.brochure_validity_till)
  ) {
    issues.push(
      issue(
        "BROCHURE_DEPARTURE_OUTSIDE_VALIDITY",
        "blocker",
        "Travel Requirements",
        "The selected Brochure departure date must fall within the Brochure validity window.",
      ),
    );
  }
  if (
    scope.program &&
    !draft.program_name.trim() &&
    !(draft.program_mode === "new" && draft.save_program_as_new && draft.new_program_name?.trim())
  ) {
    if (draft.program_mode === "new" && !draft.save_program_as_new) {
      issues.push(
        issue(
          "CUSTOM_PROGRAM_REQUIRED",
          "blocker",
          "Routing",
          "Enable saving this finalized customized routing as a new Program and provide its name.",
        ),
      );
    } else {
      issues.push(
        issue(
          "PROGRAM_REQUIRED",
          "blocker",
          "Programme",
          `Please select a Programme before saving Costing V${draft.intended_version || 1}.`,
        ),
      );
    }
  }
  if (scope.program && draft.save_program_as_new && !draft.new_program_name?.trim()) {
    issues.push(
      issue(
        "CUSTOM_PROGRAM_NAME_REQUIRED",
        "blocker",
        "Program",
        "Give the customized routing a new Program name before saving it to the master.",
      ),
    );
  }
  if (scope.routing && tourDays.length !== draft.nights + 1) {
    issues.push(
      issue(
        "ROUTING_DURATION_MISMATCH",
        "blocker",
        "Routing",
        `The itinerary has ${tourDays.length} touring day(s), but the trip is ${draft.nights + 1} day(s).`,
      ),
    );
  }
  if (scope.routing && overnight.length !== draft.nights) {
    issues.push(
      issue(
        "OVERNIGHT_MISMATCH",
        "blocker",
        "Routing",
        `${draft.nights} hotel night(s) are required, but ${overnight.length} overnight row(s) are defined.`,
      ),
    );
  }
  if (scope.routing && overnight.some((day) => !day.city_id)) {
    issues.push(
      issue(
        "OVERNIGHT_CITY_REQUIRED",
        "blocker",
        "Routing",
        "Select an overnight city for every accommodation night.",
      ),
    );
  }

  const splitAccommodation = isSplitAccommodation(draft);
  const splitAllocation = splitAccommodationAllocation(draft);
  if (requiresAccommodation && splitAccommodation) {
    if (splitAllocation.excess > 0) {
      issues.push(
        issue(
          "ACCOMMODATION_SPLIT_EXCEEDS_PAX",
          "blocker",
          "Accommodation",
          `Accommodation allocation exceeds quotation travellers by ${splitAllocation.excess} pax.`,
        ),
      );
    } else if (splitAllocation.remaining > 0) {
      issues.push(
        issue(
          "ACCOMMODATION_SPLIT_INCOMPLETE",
          "blocker",
          "Accommodation",
          `Allocate the remaining ${splitAllocation.remaining} accommodation pax before finalizing.`,
        ),
      );
    }
    draft.hotel_options.forEach((option) => {
      const optionPax = Math.trunc(option.allocated_pax ?? 0);
      if (optionPax > splitAllocation.total) {
        issues.push(
          issue(
            `ACCOMMODATION_OPTION_PAX_${option.key}`,
            "blocker",
            "Accommodation",
            `Option ${option.key}: Accommodation Pax cannot exceed ${splitAllocation.total}.`,
          ),
        );
      }
    });
  }
  const selectedOptions = draft.hotel_options.filter(
    (option) =>
      (splitAccommodation || included.has(option.key)) &&
      (!splitAccommodation || effectiveAccommodationPax(draft, option) > 0),
  );
  if (requiresAccommodation && !selectedOptions.length) {
    issues.push(
      issue(
        "HOTEL_OPTION_REQUIRED",
        "blocker",
        "Accommodation",
        "Include at least one completed hotel option.",
      ),
    );
  }

  if (requiresAccommodation)
    selectedOptions.forEach((option) => {
      if (draft.query_type === "Brochure" && draft.has_dates === false) {
        issues.push(
          issue(
            `BROCHURE_DEPARTURE_DATE_PENDING_${option.key}`,
            "warning",
            "Accommodation",
            `Option ${option.key}: Hotel Master rates are not validated until a specific Brochure departure date is selected.`,
          ),
        );
        return;
      }
      accommodationNightsForOption(draft.routing, option).forEach((day) => {
        const dynamic = isDynamicAccommodationMode(draft);
        const selection = hotelSelectionForDay(option, day, true);
        if (selection?.no_hotel) return;
        if (!selection?.hotel_id || (!dynamic && !selection.room_id)) {
          issues.push(
            issue(
              `HOTEL_MISSING_${option.key}_${day.day}`,
              "blocker",
              "Accommodation",
              `Option ${option.key}: hotel and room are missing for Day ${day.day}.`,
            ),
          );
          return;
        }
        const date = accommodationNightDate(draft, day, draft.routing.indexOf(day));
        const selectedHotel = db.hotels.find((item) => item.id === selection.hotel_id);
        const blackout = selectedHotel?.blackout_ranges?.some(
          (range) => range.from <= date && date <= range.to,
        );
        const plan =
          !dynamic && selection?.room_id && !blackout
            ? planForDay(
                option,
                day.day,
                findRatePlan(db.rate_plans, selection.room_id, selection.meal_plan, date),
              )
            : null;
        if (!dynamic && blackout) {
          const city =
            db.cities.find((item) => item.id === day.city_id)?.name ||
            day.to_city ||
            "Unknown city";
          issues.push(
            issue(
              `HOTEL_BLACKOUT_${option.key}_${day.day}`,
              "blocker",
              "Accommodation",
              `Option ${option.key} (${option.category || option.label || "Accommodation"}): ${selectedHotel?.name || "Selected hotel"} is blacked out in ${city} on ${date}. Select an available hotel; a price override cannot bypass a blackout.`,
            ),
          );
        }
        if (!dynamic && !plan && !blackout) {
          const city =
            db.cities.find((item) => item.id === day.city_id)?.name ||
            day.to_city ||
            "Unknown city";
          const hotel =
            db.hotels.find((item) => item.id === selection.hotel_id)?.name || "selected hotel";
          const room =
            db.room_categories.find((item) => item.id === selection.room_id)?.name ||
            "selected room";
          issues.push(
            issue(
              `RATE_MISSING_${option.key}_${day.day}`,
              "blocker",
              "Accommodation",
              `Option ${option.key} (${option.category || option.label || "Accommodation"}): ${city} on ${date} needs a valid ${selection.meal_plan} rate for ${hotel} / ${room}. Select a valid Hotel Master rate or enter an authorized manual rate with a reason.`,
            ),
          );
        }
        const override = option.rate_overrides?.[day.day];
        const manuallyChanged =
          override &&
          [override.sgl, override.dbl, override.trp, override.quad].some(
            (value) => typeof value === "number" && value > 0,
          );
        if (manuallyChanged && !override?.reason?.trim()) {
          issues.push(
            issue(
              `OVERRIDE_REASON_${option.key}_${day.day}`,
              "blocker",
              "Accommodation",
              `Option ${option.key}, Day ${day.day}: give a reason for the manual hotel-rate override.`,
            ),
          );
        }

        const allocations = option.dynamic_allocations?.[day.day] ?? [];
        if (dynamic) {
          for (const allocation of allocations) {
            if (allocation.manual_net_rate != null && !allocation.override_reason?.trim()) {
              issues.push(
                issue(
                  `DYNAMIC_OVERRIDE_REASON_${option.key}_${day.day}_${allocation.id}`,
                  "blocker",
                  "Accommodation",
                  `Option ${option.key}, Day ${day.day}: provide a reason for the Dynamic room-rate override.`,
                ),
              );
            }
          }
        }

        if (dynamic) {
          if (range) {
            issues.push(
              issue(
                `DYNAMIC_RANGE_${option.key}_${day.day}`,
                "blocker",
                "Accommodation",
                "Dynamic room mixes are available only for an exact traveller count, not a pax range.",
              ),
            );
          }
          const capacityFor = { single: 1, double: 2, triple: 3, quad: 4 } as const;
          const allocatedCapacity = allocations.reduce(
            (sum, allocation) =>
              sum + Math.max(0, allocation.rooms) * capacityFor[allocation.occupancy],
            0,
          );
          const accommodationPax = effectiveAccommodationPax(draft, option);
          if (allocatedCapacity < accommodationPax) {
            issues.push(
              issue(
                `DYNAMIC_CAPACITY_${option.key}_${day.day}`,
                "blocker",
                "Accommodation",
                `Option ${option.key}, Day ${day.day}: allocated capacity ${allocatedCapacity} is below ${accommodationPax} accommodation traveller(s).`,
              ),
            );
          }
          allocations.forEach((allocation) => {
            const room = db.room_categories.find((item) => item.id === allocation.room_id);
            if (!allocation.room_id || !room || room.hotel_id !== selection?.hotel_id) {
              issues.push(
                issue(
                  `DYNAMIC_ROOM_${option.key}_${day.day}_${allocation.id}`,
                  "blocker",
                  "Accommodation",
                  `Option ${option.key}, Day ${day.day}: select a room category from the chosen hotel.`,
                ),
              );
              return;
            }
            const allocationPlan = findRatePlan(
              db.rate_plans,
              allocation.room_id,
              selection.meal_plan,
              date,
            );
            const masterNet = allocationPlan
              ? allocation.occupancy === "single"
                ? allocationPlan.single_rate
                : allocation.occupancy === "double"
                  ? allocationPlan.double_rate
                  : allocation.occupancy === "triple"
                    ? allocationPlan.double_rate + (allocationPlan.extra_bed_rate || 0)
                    : (allocationPlan.quad_rate ?? 0)
              : 0;
            if (
              !(allocation.manual_net_rate != null && allocation.manual_net_rate > 0) &&
              !(masterNet > 0)
            ) {
              issues.push(
                issue(
                  `DYNAMIC_RATE_MISSING_${option.key}_${day.day}_${allocation.id}`,
                  "blocker",
                  "Accommodation",
                  `Option ${option.key}, Day ${day.day}: no contracted rate is available for this room occupancy.`,
                ),
              );
            }
          });
        }
      });
    });

  const scenarioOptions = requiresAccommodation ? selectedOptions : draft.hotel_options.slice(0, 1);
  const scenarioDefs: CostScenario[] =
    draft.scenarios?.length && !draft.transport_options?.length
      ? draft.scenarios.filter(
          (scenario) => !requiresAccommodation || included.has(scenario.option_key),
        )
      : scenarioOptions.flatMap((option) => {
          if (draft.transport_options?.length) {
            return draft.transport_options.map((transport) => ({
              id: `auto-${option.key}-${transport.id}`,
              label: `Option ${option.key} + ${transport.name}`,
              option_key: option.key,
              transport_option_id: transport.id,
            }));
          }
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
    issues.push(
      issue(
        "SCENARIO_REQUIRED",
        "blocker",
        "Costing",
        "Create at least one valid costing variation.",
      ),
    );
  }
  const selectedRateRows = Object.values(draft.rate_sheet_rows ?? {}).reduce(
    (count, rows) => count + rows.length,
    0,
  );
  if (selectedRateRows === 0) {
    issues.push(
      issue(
        "RATE_SHEET_ROW_REQUIRED",
        "blocker",
        "Costing",
        "Select at least one final pax row in the rate sheet before generating the quotation.",
      ),
    );
  }
  validScenarios.forEach((result) => {
    if (!result) return;
    if (result.rate_missing > 0) {
      issues.push(
        issue(
          `SCENARIO_RATE_${result.id}`,
          "blocker",
          "Costing",
          `${result.label} has ${result.rate_missing} missing accommodation rate(s).`,
        ),
      );
    }
    if (!Number.isFinite(result.grand_total) || result.grand_total <= 0) {
      issues.push(
        issue(
          `SCENARIO_TOTAL_${result.id}`,
          "blocker",
          "Costing",
          `${result.label} does not produce a valid package total.`,
        ),
      );
    }
    if (result.pax !== pax) {
      issues.push(
        issue(
          `SCENARIO_PAX_${result.id}`,
          "blocker",
          "Costing",
          `${result.label} is calculated for ${result.pax} pax while the quotation requires ${pax}.`,
        ),
      );
    }
  });

  if (draft.revision_of_quote_id && !draft.revision_reason?.trim()) {
    issues.push(
      issue(
        "REVISION_REASON",
        "blocker",
        "Versioning",
        "A reason is required for every revised quotation.",
      ),
    );
  }
  if (requiresLand && !draft.transport.length) {
    issues.push(
      issue("NO_TRANSPORT", "warning", "Land Part", "No transport is included in the package."),
    );
  }
  if (!draft.inclusions.length) {
    issues.push(
      issue(
        "NO_INCLUSIONS",
        "warning",
        "Preview & Save",
        "The quotation has no inclusion statements.",
      ),
    );
  }

  const blockers = issues.filter((item) => item.severity === "blocker");
  const warnings = issues.filter((item) => item.severity === "warning");
  return { canFinalize: blockers.length === 0, blockers, warnings, scenarios: validScenarios };
}
