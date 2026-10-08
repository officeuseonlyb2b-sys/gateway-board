/**
 * Costing Dirty-State Store
 *
 * Tracks whether the user has unsaved changes in the Costing/Quotation wizard.
 * Used to guard logout and navigation events.
 *
 * Rules:
 * - isDirty = true  → when any field in the wizard changes beyond the initial empty/loaded state.
 * - isDirty = false → after: Save Quote, Save Draft (success), Discard, or page load/init.
 *
 * This is a singleton pub/sub store (no React context needed) so it can be
 * read from both React components and non-React logout handlers.
 */

import { useSyncExternalStore } from "react";

interface CostingDirtyState {
  isDirty: boolean;
  /** A human-readable description of what is being worked on (for modal display) */
  description?: string;
}

let _state: CostingDirtyState = { isDirty: false };
const _listeners = new Set<() => void>();

function emit() {
  _listeners.forEach((l) => l());
}

function getSnapshot(): CostingDirtyState {
  return _state;
}

export const costingDirtyStore = {
  /** Mark the costing as having unsaved changes. */
  markDirty(description?: string) {
    if (_state.isDirty && _state.description === description) return; // no-op if same
    _state = { isDirty: true, description };
    emit();
  },

  /** Mark the costing as clean (saved, drafted, or discarded). */
  markClean() {
    if (!_state.isDirty) return; // no-op
    _state = { isDirty: false };
    emit();
  },

  /** Returns current dirty state (non-reactive — for use outside React). */
  get isDirty(): boolean {
    return _state.isDirty;
  },

  /** Returns the current description (non-reactive). */
  get description(): string | undefined {
    return _state.description;
  },

  subscribe(fn: () => void): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};

/** React hook: returns the current costing dirty state (reactive). */
export function useCostingDirty(): CostingDirtyState {
  return useSyncExternalStore(
    (cb) => costingDirtyStore.subscribe(cb),
    getSnapshot,
    getSnapshot,
  );
}
