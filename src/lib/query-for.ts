export const QUERY_FOR_OPTIONS = [
  "Package",
  "Land Part",
  "Land Part + Meals",
  "Accommodation Part",
] as const;

export type QueryFor = (typeof QUERY_FOR_OPTIONS)[number];
export type QuotationStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Map historical records to the supported authoritative commercial buckets. */
export function normalizeQueryFor(value?: string | null): QueryFor | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "package") return "Package";
  if (normalized.includes("land") && normalized.includes("meal")) return "Land Part + Meals";
  if (normalized.includes("hotel") || normalized.includes("accommodation"))
    return "Accommodation Part";
  if (
    normalized.includes("transport") ||
    normalized.includes("guide") ||
    normalized.includes("activity") ||
    normalized.includes("assistance")
  )
    return "Land Part";
  return QUERY_FOR_OPTIONS.includes(value as QueryFor) ? (value as QueryFor) : undefined;
}

/** The single authoritative service scope for a quotation. Legacy commercial
 * modes are read only as a fallback so existing drafts retain their intent. */
export function getQuotationScope(queryFor?: string | null, commercialMode?: string | null) {
  const normalized =
    normalizeQueryFor(queryFor) ??
    (commercialMode === "accommodation_only"
      ? "Accommodation Part"
      : commercialMode === "transport_only"
        ? "Land Part"
        : "Package");
  const program = normalized !== "Accommodation Part";
  const routing = true;
  const landPart = normalized !== "Accommodation Part";
  const accommodationPart = normalized === "Package" || normalized === "Accommodation Part";
  const mealsPart =
    normalized === "Package" ||
    normalized === "Accommodation Part" ||
    normalized === "Land Part + Meals";
  const workflowSteps = [
    1,
    2,
    3,
    ...(program ? [4] : []),
    ...(routing ? [5] : []),
    6,
    ...(landPart ? [7] : []),
    ...(accommodationPart || mealsPart ? [8] : []),
    9,
    10,
  ] as QuotationStepId[];

  return {
    queryFor: normalized,
    program,
    routing,
    landPart,
    accommodationPart,
    mealsPart,
    workflowSteps,
  } as const;
}

/** Keep persisted step IDs stable while resolving to the nearest applicable step. */
export function resolveQuotationStep(step: number, workflowSteps: readonly number[]): number {
  if (!workflowSteps.length || workflowSteps.includes(step)) return step;
  return (
    workflowSteps.find((candidate) => candidate > step) ?? workflowSteps[workflowSteps.length - 1]
  );
}

export function nextQuotationStep(step: number, workflowSteps: readonly number[]): number {
  const current = resolveQuotationStep(step, workflowSteps);
  const index = workflowSteps.indexOf(current);
  return workflowSteps[index + 1] ?? current;
}

export function previousQuotationStep(step: number, workflowSteps: readonly number[]): number {
  const current = resolveQuotationStep(step, workflowSteps);
  const index = workflowSteps.indexOf(current);
  return workflowSteps[Math.max(0, index - 1)] ?? current;
}
