/**
 * Centralized Logout Manager
 *
 * All logout requests must go through requestLogout().
 * If a costing has unsaved changes, it opens the UnsavedCostingModal.
 * Only after Save Draft, Discard & Logout, or when clean does it call performLogout().
 *
 * This keeps auth.signOut() calls out of every component and prevents
 * accidental sign-outs scattered around the codebase.
 */

import { useSyncExternalStore } from "react";
import { auth } from "@/lib/auth-mock";
import { costingDirtyStore } from "@/lib/costing-dirty-store";

// ─── Modal State ─────────────────────────────────────────────────────────────

interface LogoutModalState {
  open: boolean;
}

let _modalState: LogoutModalState = { open: false };
const _listeners = new Set<() => void>();

function emitModal() {
  _listeners.forEach((l) => l());
}

function getModalSnapshot(): LogoutModalState {
  return _modalState;
}

// ─── Logout Logic ─────────────────────────────────────────────────────────────

/** The single function all logout UI elements should call. */
export function requestLogout() {
  if (costingDirtyStore.isDirty) {
    // Open the unsaved-costing guard modal — do NOT sign out yet.
    _modalState = { open: true };
    emitModal();
  } else {
    performLogout();
  }
}

/**
 * Actually signs the user out and redirects to /login.
 * Called after: clean state, successful Save Draft, or confirmed Discard.
 */
export function performLogout() {
  costingDirtyStore.markClean(); // Clear dirty flag before sign-out.
  auth.signOut();
  // Redirect to /login using a full navigation so TanStack Router re-evaluates guards.
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

/** Close the modal without logging out (Continue Editing). */
export function cancelLogout() {
  _modalState = { open: false };
  emitModal();
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/** Reactive hook — returns whether the unsaved-costing modal should be shown. */
export function useLogoutModalOpen(): boolean {
  return useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => _listeners.delete(cb); },
    () => getModalSnapshot().open,
    () => false,
  );
}
