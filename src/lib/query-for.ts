export const QUERY_FOR_OPTIONS = ["Package", "Land Part", "Accommodation Part"] as const;

export type QueryFor = (typeof QUERY_FOR_OPTIONS)[number];

/** Map historical records to the supported authoritative commercial buckets. */
export function normalizeQueryFor(value?: string | null): QueryFor | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "package") return "Package";
  if (normalized.includes("hotel") || normalized.includes("accommodation")) return "Accommodation Part";
  if (normalized.includes("transport") || normalized.includes("guide") || normalized.includes("activity") || normalized.includes("assistance")) return "Land Part";
  return QUERY_FOR_OPTIONS.includes(value as QueryFor) ? (value as QueryFor) : undefined;
}