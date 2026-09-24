import type { CrmQuery } from "./types";

const positive = (value?: number) =>
  Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;

export function latestQuotationValue(query: CrmQuery) {
  const latest = query.costing_versions?.at(-1)?.quote;
  if (!latest) return 0;
  const totals = latest.totals;
  return Math.max(
    positive(totals?.grand_sgl),
    positive(totals?.grand_dbl),
    positive(totals?.grand_trp),
  );
}

export function queryWonValue(query: CrmQuery) {
  return (
    positive(query.commercials.final_selling) ||
    latestQuotationValue(query) ||
    positive(query.commercials.bottom_line) ||
    positive(query.value)
  );
}

/** Best evidence of the amount that was actually quoted before a Query was lost. */
export function queryLostValue(query: CrmQuery) {
  return (
    latestQuotationValue(query) ||
    positive(query.commercials.final_selling) ||
    positive(query.commercials.bottom_line) ||
    positive(query.value)
  );
}

/** Highest recorded commercial scenario: useful as an additional lost-potential ceiling. */
export function queryPotentialCeiling(query: CrmQuery) {
  return positive(query.commercials.top_line) || positive(query.value) || queryLostValue(query);
}

export function queryOpenValue(query: CrmQuery) {
  return queryPotentialCeiling(query);
}
