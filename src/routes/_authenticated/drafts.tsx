import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Play, Trash2, Search, Pencil, Check, X, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useDrafts,
  deleteDraft,
  duplicateDraft,
  renameDraft,
  type DraftRecord,
} from "@/lib/drafts-store";
import { fmtDateShort } from "@/lib/format";
import { useAccessProfile, useAccessibleQueries } from "@/lib/crm/access";
import {
  removeQueryQuotationDraft,
  upsertQueryQuotationDraft,
  useStandaloneQuotationReviews,
} from "@/lib/crm/store";
import { QuotationReviewRequestDialog } from "@/components/quotation/QuotationReviewRequestDialog";
import { accommodationMode } from "@/lib/wizard/types";

export const Route = createFileRoute("/_authenticated/drafts")({
  head: () => ({ meta: [{ title: "Drafts — MP Tourism Hub" }] }),
  component: DraftsPage,
});

const STEP_LABELS = [
  "Type",
  "Who",
  "Trip Basics",
  "Program",
  "Routing",
  "Land Part",
  "Accommodation Part",
  "Costing",
  "Preview & Save",
];

function DraftsPage() {
  const localDrafts = useDrafts();
  const access = useAccessProfile();
  const queries = useAccessibleQueries();
  const standaloneReviews = useStandaloneQuotationReviews();
  const cloudDraftMetadata = useMemo(
    () =>
      new Map(
        queries.flatMap((query) => query.quotation_drafts ?? []).map((draft) => [draft.id, draft]),
      ),
    [queries],
  );
  const drafts = useMemo(() => {
    const merged = new Map(localDrafts.map((draft) => [draft.id, draft]));
    for (const cloud of cloudDraftMetadata.values()) {
      merged.set(cloud.id, {
        id: cloud.id,
        draft_name: cloud.draft_name,
        created_at: cloud.created_at,
        updated_at: cloud.updated_at,
        last_step: cloud.draft_data.step,
        wizard_state: cloud.draft_data,
      });
    }
    return [...merged.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [cloudDraftMetadata, localDrafts]);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [reviewDraft, setReviewDraft] = useState<DraftRecord | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return drafts;
    return drafts.filter((d) =>
      (
        d.draft_name +
        " " +
        (d.wizard_state.query_type || "") +
        " " +
        d.wizard_state.program_name +
        " " +
        (d.wizard_state.linked_query_id || "")
      )
        .toLowerCase()
        .includes(needle),
    );
  }, [drafts, q]);

  function resume(d: DraftRecord) {
    navigate({ to: "/costing", search: { id: d.id } as never });
  }
  function beginRename(d: DraftRecord) {
    setEditingId(d.id);
    setEditName(d.draft_name);
  }
  function saveRename() {
    if (editingId && editName.trim()) {
      renameDraft(editingId, editName.trim());
      toast.success("Renamed.");
    }
    setEditingId(null);
  }

  function duplicate(draft: DraftRecord) {
    let copy: DraftRecord | null = null;
    try {
      copy = duplicateDraft(draft);
      const employee = access.employee;
      if (copy.wizard_state.linked_query_id && employee) {
        upsertQueryQuotationDraft(copy.wizard_state.linked_query_id, {
          id: copy.id,
          draft_name: copy.draft_name,
          draft_data: copy.wizard_state,
          created_by_employee_id: employee.id,
          created_by_name: employee.name,
          created_by_role: employee.role,
          last_edited_by_employee_id: employee.id,
          last_edited_by_name: employee.name,
          last_edited_by_role: employee.role,
        });
      }
      toast.success(`Created independent draft “${copy.draft_name}”.`);
    } catch (error) {
      if (copy) deleteDraft(copy.id);
      toast.error(`Could not duplicate costing: ${(error as Error).message}`);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Drafts</h1>
            <p className="text-sm text-muted-foreground">
              In-progress quotations you can resume anytime.
            </p>
          </div>
        </div>
        <Link to="/costing" search={{ id: undefined }}>
          <Button size="sm">Start new</Button>
        </Link>
      </div>

      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search drafts by name, program, or type…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            No drafts yet. A linked quotation is saved here automatically as you work.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left py-2.5 px-4">Draft Name</th>
                <th className="text-left py-2.5 px-2">Type</th>
                <th className="text-left py-2.5 px-2">Hotel Mode</th>
                <th className="text-left py-2.5 px-2">Program</th>
                <th className="text-left py-2.5 px-2">Query</th>
                <th className="text-left py-2.5 px-2">Last Step</th>
                <th className="text-left py-2.5 px-2">Modified</th>
                <th className="text-left py-2.5 px-2">Created / Edited By</th>
                <th className="text-right py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const stepLabel =
                  STEP_LABELS[Math.max(0, Math.min(STEP_LABELS.length - 1, d.last_step - 1))];
                const completion = Math.max(
                  0,
                  Math.min(100, Math.round(((d.last_step - 1) / (STEP_LABELS.length - 1)) * 100)),
                );
                const cloud = cloudDraftMetadata.get(d.id);
                const query = queries.find((item) => item.query_id === cloud?.query_id);
                const standaloneReview = standaloneReviews
                  .filter((review) => review.draft_id === d.id)
                  .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
                const activeReview =
                  query?.review_support?.query_reviews?.some(
                    (review) =>
                      review.source_type === "draft" &&
                      review.draft_id === d.id &&
                      !["Approved", "Returned", "Cancelled"].includes(review.status),
                  ) ||
                  Boolean(
                    standaloneReview &&
                    !["Approved", "Returned", "Cancelled"].includes(standaloneReview.status),
                  );
                const changedAfterReview = Boolean(
                  (cloud?.latest_review_snapshot_at &&
                    d.updated_at > cloud.latest_review_snapshot_at) ||
                  (standaloneReview?.draft_updated_at &&
                    d.updated_at > standaloneReview.draft_updated_at),
                );
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2.5 px-4 font-medium">
                      {editingId === d.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-7 text-sm"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={saveRename}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{d.draft_name}</span>
                          {changedAfterReview && (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">
                              Draft changed after review request
                            </Badge>
                          )}
                          <button
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => beginRename(d)}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {d.wizard_state.query_type && (
                        <Badge variant="secondary">{d.wizard_state.query_type}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge variant="outline">
                        {accommodationMode(d.wizard_state) === "dynamic" ? "Dynamic" : "Standard"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-muted-foreground">
                      {d.wizard_state.program_name || "—"}
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      {d.wizard_state.linked_query_id ? (
                        <Link
                          to="/queries/$id"
                          params={{ id: d.wizard_state.linked_query_id }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {d.wizard_state.linked_query_id}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">
                          {d.last_step}/{STEP_LABELS.length}
                        </span>
                        <span className="text-muted-foreground">{stepLabel}</span>
                      </div>
                      <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">
                      {fmtDateShort(d.updated_at)}
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      {cloudDraftMetadata.has(d.id) ? (
                        <>
                          <div>{cloudDraftMetadata.get(d.id)?.created_by_name}</div>
                          <div className="text-muted-foreground">
                            Last: {cloudDraftMetadata.get(d.id)?.last_edited_by_name} ·{" "}
                            {cloudDraftMetadata.get(d.id)?.last_edited_by_role}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Legacy local draft</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => resume(d)}>
                          <Play className="h-3.5 w-3.5 mr-1" /> Resume
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => duplicate(d)}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate Costing
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(activeReview && !changedAfterReview)}
                          title={
                            activeReview && !changedAfterReview
                              ? "Review is pending for this exact snapshot."
                              : undefined
                          }
                          onClick={() => setReviewDraft(d)}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" />
                          {activeReview && !changedAfterReview
                            ? "Review Pending"
                            : changedAfterReview
                              ? "Request Updated Review"
                              : "Request Review"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Rename"
                          onClick={() => beginRename(d)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete saved draft "${d.draft_name}" permanently? This action cannot be undone.`,
                              )
                            ) {
                              deleteDraft(d.id);
                              const cloud = cloudDraftMetadata.get(d.id);
                              if (cloud) removeQueryQuotationDraft(cloud.query_id, d.id);
                              toast.success("Draft deleted.");
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <QuotationReviewRequestDialog
        draft={reviewDraft}
        open={Boolean(reviewDraft)}
        onOpenChange={(next) => {
          if (!next) setReviewDraft(null);
        }}
      />
    </div>
  );
}
