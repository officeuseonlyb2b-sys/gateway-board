import type { QuoteDraft } from "./types";

/** Selling validity is mandatory only when a Brochure pricing snapshot is published. */
export function brochureSellingValidityError(draft: QuoteDraft): string | undefined {
  if (draft.query_type !== "Brochure") return undefined;
  if (!draft.brochure_validity_from || !draft.brochure_validity_till)
    return "Brochure selling validity: enter both Valid From and Valid Till before saving the final pricing snapshot.";
  if (draft.brochure_validity_till < draft.brochure_validity_from)
    return "Brochure selling validity: Valid Till must be on or after Valid From.";
  return undefined;
}
