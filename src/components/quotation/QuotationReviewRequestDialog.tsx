import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DraftRecord } from "@/lib/drafts-store";
import { upsertDraft } from "@/lib/drafts-store";
import { writeDraft } from "@/lib/wizard/store";
import { useDB } from "@/lib/mock-store";
import { buildSavedQuote } from "@/lib/wizard/build-saved-quote";
import { quoteContentHash, type SavedQuote } from "@/lib/quotes-store";
import { useAccessProfile, useAccessibleQueries } from "@/lib/crm/access";
import {
  getQueryQuotationDraft,
  requestDraftQuotationReview,
  requestQuotationReview,
  requestStandaloneQuotationReview,
  removeStandaloneQuotationReviewFromLocal,
  upsertQueryQuotationDraft,
  useEmployees,
} from "@/lib/crm/store";
import {
  persistQueryQuotationReview,
  persistStandaloneQuotationReview,
} from "@/lib/crm/crm-remote";
import type { CrmQuery, Employee, ReviewPriority } from "@/lib/crm/types";

function eligibleReviewers(actor: Employee, employees: Employee[]) {
  const actorUnit = actor.unit?.trim().toLowerCase();
  const roles =
    actor.role === "Sales Executive"
      ? ["Senior Sales Executive", "Sales Manager"]
      : actor.role === "Senior Sales Executive"
        ? ["Senior Sales Executive", "Sales Manager"]
        : actor.role === "Sales Manager"
          ? ["Senior Sales Executive", "Sales Manager"]
          : ["Sales Executive", "Senior Sales Executive", "Sales Manager"];
  return employees.filter(
    (candidate) =>
      candidate.id !== actor.id &&
      candidate.department === "Sales" &&
      candidate.active &&
      candidate.account_status === "Active" &&
      candidate.employee_status !== "Exited" &&
      roles.includes(candidate.role) &&
      (!actorUnit || !candidate.unit?.trim() || candidate.unit.trim().toLowerCase() === actorUnit),
  );
}

export function QuotationReviewRequestDialog({
  draft,
  quote = null,
  open,
  onOpenChange,
}: {
  draft: DraftRecord | null;
  quote?: SavedQuote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const access = useAccessProfile();
  const queries = useAccessibleQueries();
  const employees = useEmployees();
  const db = useDB();
  const [queryId, setQueryId] = useState("");
  const [linked, setLinked] = useState(false);
  const [reviewerId, setReviewerId] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<ReviewPriority>("Normal");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const stableLinkedQueryId =
    quote?.query_id ||
    (draft
      ? queries.find((query) => {
          const stableId = draft.wizard_state.linked_query_id || "";
          return query.query_id === stableId || query.id === stableId;
        })?.query_id || ""
      : "");

  useEffect(() => {
    if (!open || (!draft && !quote)) return;
    setQueryId(stableLinkedQueryId);
    setLinked(
      Boolean(quote) ||
        !draft?.wizard_state.linked_query_id ||
        Boolean(draft && stableLinkedQueryId && getQueryQuotationDraft(draft.id)),
    );
    setReviewerId("");
    setReason("");
    setPriority("Normal");
    setDueAt("");
  }, [draft, quote, open, stableLinkedQueryId]);

  const actor = access.employee;
  const reviewers = useMemo(
    () => (actor ? eligibleReviewers(actor, employees) : []),
    [actor, employees],
  );
  const selectedQuery = queries.find((query) => query.query_id === queryId || query.id === queryId);

  function linkDraft() {
    if (!draft || !actor || !selectedQuery) return;
    const nextState = {
      ...draft.wizard_state,
      linked_query_id: selectedQuery.query_id,
      linked_query_name: selectedQuery.customer,
      updated_at: new Date().toISOString(),
    };
    upsertDraft(nextState, draft.id, draft.draft_name);
    writeDraft(nextState);
    upsertQueryQuotationDraft(selectedQuery.query_id, {
      id: draft.id,
      based_on_version_id: nextState.revision_of_quote_id,
      based_on_version_number: nextState.intended_version
        ? Math.max(1, nextState.intended_version - 1)
        : undefined,
      draft_name: draft.draft_name,
      draft_data: nextState,
      // A legacy browser-only draft has no trustworthy creator relation. Do not
      // rewrite history by attributing creation to the employee linking it now.
      created_by_employee_id: "",
      created_by_name: "Legacy local draft",
      created_by_role: "",
      last_edited_by_employee_id: actor.id,
      last_edited_by_name: actor.name,
      last_edited_by_role: actor.role,
      created_at: draft.created_at,
    });
    setLinked(true);
  }

  async function submit() {
    if ((!draft && !quote) || !actor || !linked || !reviewerId || !reason.trim()) return;
    setSubmitting(true);
    try {
      if (quote) {
        if (!selectedQuery)
          throw new Error("The saved quotation is not linked to an accessible Query.");
        requestQuotationReview(selectedQuery.query_id, {
          quotationId: quote.id,
          quotationVersion: quote.version,
          reviewerEmployeeId: reviewerId,
          requestedByEmployeeId: actor.id,
          instructions: reason.trim(),
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        });
        await persistQueryQuotationReview(selectedQuery.query_id);
        const reviewer = reviewers.find((employee) => employee.id === reviewerId);
        toast.success(`Review requested from ${reviewer?.name || "the selected reviewer"}.`);
        onOpenChange(false);
        return;
      }
      if (!draft) return;
      const shared = selectedQuery ? getQueryQuotationDraft(draft.id) : undefined;
      if (selectedQuery && !shared)
        throw new Error("The draft could not be linked to the selected Query.");
      const snapshot = buildSavedQuote(
        shared?.draft_data || draft.wizard_state,
        db,
        actor.name,
        {
          employeeId: actor.id,
          authUserId: actor.auth_user_id,
          name: actor.name,
          role: actor.role,
        },
        { preview: true },
      );
      snapshot.content_hash = quoteContentHash(snapshot);
      const request = {
        draftId: draft.id,
        snapshot,
        reviewerEmployeeId: reviewerId,
        requestedByEmployeeId: actor.id,
        instructions: reason.trim(),
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      };
      if (selectedQuery) {
        requestDraftQuotationReview(selectedQuery.query_id, request);
        await persistQueryQuotationReview(selectedQuery.query_id);
      } else {
        const assignment = requestStandaloneQuotationReview({
          ...request,
          draftName: draft.draft_name,
          draftUpdatedAt: draft.updated_at,
          deferCloudSync: true,
        });
        try {
          await persistStandaloneQuotationReview(assignment);
        } catch (error) {
          removeStandaloneQuotationReviewFromLocal(assignment.id);
          throw error;
        }
      }
      const reviewer = reviewers.find((employee) => employee.id === reviewerId);
      toast.success(`Review requested from ${reviewer?.name || "the selected reviewer"}.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Request Quotation Review</DialogTitle>
          <DialogDescription>
            The reviewer receives the exact immutable{" "}
            {quote ? `V${quote.version}` : "draft snapshot"}.
          </DialogDescription>
        </DialogHeader>

        {!linked ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This legacy draft must be linked to a Query before it can be reviewed.
            </div>
            <div className="space-y-2">
              <Label>Query *</Label>
              <Select value={queryId} onValueChange={setQueryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Search / select an authorized Query" />
                </SelectTrigger>
                <SelectContent>
                  {queries.map((query: CrmQuery) => (
                    <SelectItem key={query.id} value={query.query_id}>
                      {query.query_id} · {query.customer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!selectedQuery || !actor} onClick={linkDraft}>
                Link &amp; Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              {selectedQuery ? (
                <>
                  Query <strong>{selectedQuery.query_id}</strong> · Draft snapshot
                </>
              ) : (
                <>
                  <strong>Standalone Costing</strong> · Query not linked
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Reviewer *</Label>
              <Select value={reviewerId} onValueChange={setReviewerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {reviewers.map((reviewer) => (
                    <SelectItem key={reviewer.id} value={reviewer.id}>
                      {reviewer.name} · {reviewer.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!reviewers.length && (
                <p className="text-xs text-destructive">
                  No active Senior Sales Executive or Sales Manager is configured.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Reason / What should be checked *</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as ReviewPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Normal", "High", "Urgent"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={submitting || !reviewerId || !reason.trim()} onClick={submit}>
                Submit Review Request
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
