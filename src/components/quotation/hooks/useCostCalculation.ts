// Memoized aggregate totals for the wizard's hotel options.
// Thin wrapper around lib/wizard/calc; extracted per plan.
import { useMemo } from "react";
import { useDB } from "@/lib/mock-store";
import { computeOption, computeAddonsTotal } from "@/lib/wizard/calc";
import type { QuoteDraft } from "@/lib/wizard/types";

export function useCostCalculation(draft: QuoteDraft) {
  const d = useDB();
  const optionTotals = useMemo(
    () => draft.hotel_options.map((o) => computeOption(draft, o, d)),
    [draft, d],
  );
  const addonsTotal = useMemo(() => computeAddonsTotal(draft, d), [draft, d]);
  return { optionTotals, addonsTotal };
}
