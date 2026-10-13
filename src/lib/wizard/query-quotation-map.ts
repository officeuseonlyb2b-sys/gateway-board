import type { CrmQuery } from "@/lib/crm/types";
import type { QuoteDraft } from "@/lib/wizard/types";

/**
 * The one authoritative traveller mapping used whenever a Query opens a quote.
 * Exact query counts remain exact (including zero adults); range queries never
 * become fake exact travellers just because legacy `pax` is populated.
 */
export function mapQueryToQuotationTravellers(
  query: CrmQuery,
): Pick<QuoteDraft, "adults" | "ss" | "children" | "pax_mode" | "pax_min" | "pax_max"> {
  const paxMode =
    query.pax_mode ||
    (query.min_pax !== undefined || query.max_pax !== undefined ? "range" : "exact");
  if (paxMode === "range") {
    return {
      adults: 0,
      ss: 0,
      children: [],
      pax_mode: "range",
      pax_min: query.min_pax,
      pax_max: query.max_pax,
    };
  }
  return {
    adults: query.adults ?? query.pax ?? 0,
    ss: query.ss ?? 0,
    children: Array.from({ length: Math.max(0, query.children || 0) }, (_, index) => ({
      age: query.child_ages?.[index],
    })),
    pax_mode: "exact",
    pax_min: undefined,
    pax_max: undefined,
  };
}
