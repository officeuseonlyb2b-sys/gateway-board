// Thin wrapper exposing the wizard draft store + step navigation helpers.
// Preserves current behavior; existing step components still receive
// `{ draft, set }` via props for zero-diff extraction.
import { useCallback } from "react";
import { useDraft, writeDraft, initDraft, clearDraft, loadDraft } from "@/lib/wizard/store";
import type { QuoteDraft } from "@/lib/wizard/types";

export function useWizardState() {
  const draft = useDraft();
  const set = useCallback((patch: Partial<QuoteDraft>) => {
    const current = draft ?? loadDraft();
    if (!current) return;
    writeDraft({ ...current, ...patch });
  }, [draft]);
  const goto = useCallback((step: number) => set({ step }), [set]);
  return { draft, set, goto, initDraft, clearDraft };
}
