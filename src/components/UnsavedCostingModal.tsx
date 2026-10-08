/**
 * UnsavedCostingModal
 *
 * Shown when the user tries to logout OR navigate internally away from
 * costing while there are unsaved changes.
 *
 * Actions in Logout mode:
 *  1. Save Draft & Logout
 *  2. Discard Changes & Logout
 *  3. Continue Editing
 *
 * Actions in Navigation mode:
 *  1. Save Draft & Continue
 *  2. Discard & Continue
 *  3. Continue Editing
 */

import { useCallback, useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { AlertCircle, Save, Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLogoutModalOpen, cancelLogout, performLogout } from "@/lib/logout-manager";
import { costingDirtyStore, useCostingDirty } from "@/lib/costing-dirty-store";

// The costing page registers a save-draft callback here so the modal can
// trigger actual persistence without needing React props threading.
let _saveDraftCallback: (() => Promise<void>) | null = null;

export function registerSaveDraftCallback(fn: (() => Promise<void>) | null) {
  _saveDraftCallback = fn;
}

export function UnsavedCostingModal() {
  const logoutOpen = useLogoutModalOpen();
  const dirtyState = useCostingDirty();
  const dirty = dirtyState.isDirty;

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // TanStack Router blocker: intercepts internal navigation (Sidebar links, TopBar, navigate(), Link, Back/Forward)
  const blocker = useBlocker({
    shouldBlockFn: useCallback(() => costingDirtyStore.isDirty, []),
    withResolver: true,
    enableBeforeUnload: dirty,
  });

  const isNavigationBlocked = blocker.status === "blocked";
  const open = logoutOpen || isNavigationBlocked;
  const mode: "logout" | "navigation" = logoutOpen ? "logout" : "navigation";

  useEffect(() => {
    if (!open) {
      setConfirming(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (_saveDraftCallback) {
        await _saveDraftCallback();
      }
      costingDirtyStore.markClean();

      if (mode === "logout") {
        performLogout();
      } else {
        blocker.proceed?.();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save draft: ${message}. ${mode === "logout" ? "You are still logged in." : "Navigation cancelled."}`);
      if (mode === "navigation") {
        blocker.reset?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // Confirmed discard
    costingDirtyStore.markClean();
    if (mode === "logout") {
      performLogout();
    } else {
      blocker.proceed?.();
    }
  };

  const handleContinueEditing = () => {
    setConfirming(false);
    if (mode === "logout") {
      cancelLogout();
    } else {
      blocker.reset?.();
    }
  };

  const descriptionText = mode === "logout"
    ? "You have unsaved changes in the current costing. Before logging out, save your work as a draft or discard the changes."
    : "You have unsaved changes in the current costing. Before leaving, save your work as a draft or discard the changes.";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) handleContinueEditing(); }}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-lg font-semibold">Unsaved Costing</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-1">
            {descriptionText}
          </DialogDescription>
        </DialogHeader>

        {confirming && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <strong>Confirm discard?</strong> All unsaved changes will be lost. This cannot be undone.
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {/* Save Draft */}
          <Button
            className="w-full justify-start gap-2"
            disabled={saving}
            onClick={handleSaveDraft}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving
              ? "Saving draft…"
              : mode === "logout"
                ? "Save Draft & Logout"
                : "Save Draft & Continue"}
          </Button>

          {/* Discard */}
          <Button
            variant={confirming ? "destructive" : "outline"}
            className="w-full justify-start gap-2"
            disabled={saving}
            onClick={handleDiscard}
          >
            <Trash2 className="h-4 w-4" />
            {confirming
              ? mode === "logout"
                ? "Yes, Discard & Logout"
                : "Yes, Discard & Continue"
              : mode === "logout"
                ? "Discard Changes & Logout"
                : "Discard & Continue"}
          </Button>

          {/* Continue Editing */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            disabled={saving}
            onClick={handleContinueEditing}
          >
            <X className="h-4 w-4" />
            Continue Editing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
