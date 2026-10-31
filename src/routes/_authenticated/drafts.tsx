import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Play, Trash2, Search, Pencil, Check, X, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type DraftTypeFilter = "all" | "B2B" | "B2C" | "Brochure";
type DraftDateFilter = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

function localDateKey(value: string | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function inputDateKey(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? year * 10000 + month * 100 + day
    : null;
}

function dayKeyOffset(days: number): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

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
  const [typeFilter, setTypeFilter] = useState<DraftTypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DraftDateFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [reviewDraft, setReviewDraft] = useState<DraftRecord | null>(null);
  const navigate = useNavigate();

  const programmes = useMemo(() => {
    const values = new Map<string, string>();
    drafts.forEach((draft) => {
      const name = draft.wizard_state.program_name?.trim();
      if (!name) return;
      const id = draft.wizard_state.program_id?.trim();
      const key = id ? `id:${id}` : `name:${name.toLocaleLowerCase()}`;
      if (!values.has(key)) values.set(key, name);
    });
    return [...values.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [drafts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const today = dayKeyOffset(0);
    const from = inputDateKey(fromDate);
    const to = inputDateKey(toDate);
    return drafts.filter((d) => {
      const type = d.wizard_state.query_type;
      const programmeName = d.wizard_state.program_name?.trim() || "";
      const programmeId = d.wizard_state.program_id?.trim();
      const programmeKey = programmeName
        ? programmeId
          ? `id:${programmeId}`
          : `name:${programmeName.toLocaleLowerCase()}`
        : "none";
      const modified = localDateKey(d.updated_at);
      const typeMatches = typeFilter === "all" || type === typeFilter;
      const programmeMatches = programmeFilter === "all" || programmeKey === programmeFilter;
      const dateMatches =
        dateFilter === "all" ||
        (modified !== null &&
          (dateFilter === "today"
            ? modified === today
            : dateFilter === "yesterday"
              ? modified === dayKeyOffset(-1)
              : dateFilter === "last7"
                ? modified >= dayKeyOffset(-6) && modified <= today
                : dateFilter === "last30"
                  ? modified >= dayKeyOffset(-29) && modified <= today
                  : dateFilter === "custom"
                    ? (!from || modified >= from) && (!to || modified <= to)
                    : true));
      const searchMatches =
        !needle ||
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
        .includes(needle);
      return typeMatches && programmeMatches && dateMatches && searchMatches;
    });
  }, [dateFilter, drafts, fromDate, programmeFilter, q, toDate, typeFilter]);

  const clearFilters = () => {
    setQ("");
    setTypeFilter("all");
    setDateFilter("all");
    setFromDate("");
    setToDate("");
    setProgrammeFilter("all");
  };

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
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-40">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Quotation Type</label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as DraftTypeFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="B2B">B2B</SelectItem>
                <SelectItem value="B2C">B2C</SelectItem>
                <SelectItem value="Brochure">Brochure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-44">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Modified Date</label>
            <Select value={dateFilter} onValueChange={(value) => setDateFilter(value as DraftDateFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Date Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-56">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Programme</label>
            <Select value={programmeFilter} onValueChange={setProgrammeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programmes</SelectItem>
                <SelectItem value="none">No Programme Selected</SelectItem>
                {programmes.map((programme) => (
                  <SelectItem key={programme.value} value={programme.value}>{programme.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {dateFilter === "custom" && (
            <>
              <div className="w-full sm:w-36">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">From Date</label>
                <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="w-full sm:w-36">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">To Date</label>
                <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
            </>
          )}
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear Filters</Button>
          <span className="pb-2 text-xs text-muted-foreground">Showing {filtered.length} of {drafts.length} drafts</span>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            {drafts.length
              ? "No drafts match your current filters."
              : "No drafts yet. A linked quotation is saved here automatically as you work."}
            {drafts.length > 0 && (
              <div className="mt-3"><Button size="sm" variant="outline" onClick={clearFilters}>Clear Filters</Button></div>
            )}
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
