// Thin wrapper exposing the wizard draft store + step navigation helpers.
// `set` always reads the latest persisted draft (via loadDraft) so that
// successive updates in the same tick never clobber each other with stale
// closures (e.g. two `set()` calls dispatched back-to-back).
import { useCallback } from "react";
import { useDraft, writeDraft, initDraft, clearDraft, loadDraft } from "@/lib/wizard/store";
import type { QuoteDraft } from "@/lib/wizard/types";

export function useWizardState() {
  const draft = useDraft();
  const set = useCallback((patch: Partial<QuoteDraft>) => {
    // ALWAYS read latest to avoid stale-closure overwrites when multiple
    // set() calls are dispatched in quick succession from one handler.
    const current = loadDraft() ?? draft;
    if (!current) return;
    writeDraft({ ...current, ...patch });
  }, [draft]);
  const goto = useCallback((step: number) => set({ step }), [set]);
  return { draft, set, goto, initDraft, clearDraft };
}
