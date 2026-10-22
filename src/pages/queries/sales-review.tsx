import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FinalCostingWorkspace } from "@/components/quotation/FinalCostingWorkspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAccessibleQueries, useAccessProfile } from "@/lib/crm/access";
import {
  reassignReviewSupport,
  setAssistanceStatus,
  setReviewStatus,
  setStandaloneQuotationReviewStatus,
  useEmployees,
  useStandaloneQuotationReviews,
} from "@/lib/crm/store";
import type {
  AssistanceAssignment,
  CrmQuery,
  QueryReviewAssignment,
  QuotationReviewAssignment,
  StandaloneQuotationReviewAssignment,
} from "@/lib/crm/types";
import type { SavedQuote } from "@/lib/quotes-store";
import {
  persistQueryQuotationReview,
  persistStandaloneQuotationReviewUpdate,
} from "@/lib/crm/crm-remote";

export type ReviewMode = "query" | "quotation" | "assistance";
type QueueTab = "assigned" | "requested" | "completed" | "team";
type QueueItem = {
  query?: CrmQuery;
  assignment:
    | QueryReviewAssignment
    | QuotationReviewAssignment
    | StandaloneQuotationReviewAssignment
    | AssistanceAssignment;
};
const completed = (status: string) =>
  ["Approved", "Returned", "Cancelled", "Completed"].includes(status);
const fmt = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—";

export default function SalesReview({ mode }: { mode: ReviewMode }) {
  const access = useAccessProfile();
  const employeeId = access.employee?.id;
  const employees = useEmployees();
  const queries = useAccessibleQueries();
  const standaloneReviews = useStandaloneQuotationReviews();
  const [tab, setTab] = useState<QueueTab>("assigned");
  const [viewingQuote, setViewingQuote] = useState<SavedQuote | null>(null);
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const employeeName = (id: string) => employees.find((item) => item.id === id)?.name || id;
  const managerTeamQuery = (query: CrmQuery) => {
    if (access.role === "Super Admin") return true;
    const owner = employees.find(
      (employee) => employee.id === query.owner || employee.name === query.owner,
    );
    return owner
      ? owner.department === "Sales" && owner.unit === access.unit
      : !query.owner &&
          (query.primary_unit === access.unit ||
            Boolean(access.unit && query.participating_units?.includes(access.unit)));
  };
  const reassignableEmployees = employees.filter(
    (employee) =>
      employee.department === "Sales" &&
      (access.role === "Super Admin" || employee.unit === access.unit) &&
      employee.active &&
      employee.account_status === "Active" &&
      employee.employee_status !== "Exited" &&
      ["Senior Sales Executive", "Sales Manager"].includes(employee.role),
  );
  const items = useMemo<QueueItem[]>(
    () => [
      ...queries.flatMap((query) => {
        const assignments =
          mode === "query"
            ? (query.review_support?.query_reviews || []).filter(
                (assignment) => assignment.source_type !== "draft",
              )
            : mode === "quotation"
              ? [
                  ...(query.review_support?.quotation_reviews || []),
                  ...(query.review_support?.query_reviews || []).filter(
                    (assignment) => assignment.source_type === "draft",
                  ),
                ]
              : query.review_support?.assistance || [];
        return assignments.map((assignment) => ({ query, assignment }));
      }),
      ...(mode === "quotation" ? standaloneReviews.map((assignment) => ({ assignment })) : []),
    ],
    [queries, mode, standaloneReviews],
  );
  const visible = items.filter(({ query, assignment }) => {
    const assignedTo =
      "assistant_employee_id" in assignment
        ? assignment.assistant_employee_id
        : "assigned_to_employee_id" in assignment
          ? assignment.assigned_to_employee_id
          : assignment.reviewer_employee_id;
    const requestedBy =
      "assigned_by_employee_id" in assignment
        ? assignment.assigned_by_employee_id
        : assignment.requested_by_employee_id;
    if (tab === "completed")
      return (
        completed(assignment.status) &&
        (assignedTo === employeeId ||
          requestedBy === employeeId ||
          (query && access.canManageTeam && managerTeamQuery(query)))
      );
    if (tab === "requested") return requestedBy === employeeId && !completed(assignment.status);
    if (tab === "team")
      return Boolean(
        access.canManageTeam && query && managerTeamQuery(query) && !completed(assignment.status),
      );
    return assignedTo === employeeId && !completed(assignment.status);
  });
  const title =
    mode === "query"
      ? "Queries for Review"
      : mode === "quotation"
        ? "Quotations for Review"
        : "Assisted Queries";
  const act = async (
    item: QueueItem,
    action: "start" | "accept" | "approve" | "return" | "complete" | "cancel",
  ) => {
    try {
      if (mode === "assistance") {
        const summary =
          action === "complete" ? window.prompt("What was done? Completion summary:") : undefined;
        if (action === "complete" && !summary?.trim()) return;
        setAssistanceStatus(
          item.query!.query_id,
          item.assignment.id,
          action === "complete"
            ? "Completed"
            : action === "cancel"
              ? "Cancelled"
              : action === "accept"
                ? "Assigned"
                : "In Progress",
          employeeId || "Unknown employee",
          summary || undefined,
        );
      } else {
        const note = action === "return" ? window.prompt("Correction instructions:") : undefined;
        if (action === "return" && !note?.trim()) return;
        if (
          "source_type" in item.assignment &&
          item.assignment.source_type === "standalone_draft"
        ) {
          setStandaloneQuotationReviewStatus(
            item.assignment.id,
            action === "approve"
              ? "Approved"
              : action === "return"
                ? "Returned"
                : action === "cancel"
                  ? "Cancelled"
                  : "In Review",
            employeeId || "Unknown employee",
            note || undefined,
          );
          await persistStandaloneQuotationReviewUpdate(item.assignment.id);
          toast.success("Workflow updated.");
          return;
        }
        const reviewKind =
          "source_type" in item.assignment && item.assignment.source_type === "draft"
            ? "query"
            : mode;
        setReviewStatus(
          item.query!.query_id,
          reviewKind as "query" | "quotation",
          item.assignment.id,
          action === "approve"
            ? "Approved"
            : action === "return"
              ? "Returned"
              : action === "cancel"
                ? "Cancelled"
                : "In Review",
          employeeId || "Unknown employee",
          note || undefined,
        );
        await persistQueryQuotationReview(item.query!.query_id);
      }
      toast.success("Workflow updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update workflow.");
    }
  };
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-teal-700">Explicit review &amp; support access</p>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only owned, requested, or explicitly assigned records are visible here.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["assigned", "Assigned to Me"],
          ["requested", "Requested by Me"],
          ["completed", "Completed"],
          ...(access.canManageTeam ? [["team", "Team Review Queue"]] : []),
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={tab === value ? "default" : "outline"}
            onClick={() => setTab(value as QueueTab)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {visible.map((item) => {
          const assignment = item.assignment;
          const assignedId =
            "assistant_employee_id" in assignment
              ? assignment.assistant_employee_id
              : "assigned_to_employee_id" in assignment
                ? assignment.assigned_to_employee_id
                : assignment.reviewer_employee_id;
          const requesterId =
            "assigned_by_employee_id" in assignment
              ? assignment.assigned_by_employee_id
              : assignment.requested_by_employee_id;
          const requestedAt =
            "assigned_at" in assignment ? assignment.assigned_at : assignment.requested_at;
          const savedQuotation =
            "quotation_version" in assignment
              ? (assignment as QuotationReviewAssignment)
              : undefined;
          const draftQuotation =
            "source_type" in assignment &&
            assignment.source_type === "draft" &&
            assignment.quotation_snapshot
              ? (assignment as QueryReviewAssignment)
              : undefined;
          const standaloneQuotation =
            "source_type" in assignment && assignment.source_type === "standalone_draft"
              ? (assignment as StandaloneQuotationReviewAssignment)
              : undefined;
          const quotation = savedQuotation || draftQuotation || standaloneQuotation;
          const assistance = "areas" in assignment ? assignment : undefined;
          return (
            <Card key={assignment.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-teal-700">
                        {quotation
                          ? savedQuotation
                            ? `${savedQuotation.quotation_snapshot.quote.display_number || savedQuotation.quotation_id} · V${savedQuotation.quotation_version}`
                            : `${standaloneQuotation ? "Standalone Costing" : "Draft Review Snapshot"} · R${quotation.draft_snapshot_revision || 1}`
                          : item.query?.query_id}
                      </span>
                      <Badge variant="outline">{assignment.status}</Badge>
                      <Badge>{assignment.priority || "Normal"}</Badge>
                    </div>
                    <p className="mt-1 font-semibold">
                      {item.query?.customer ||
                        standaloneQuotation?.draft_name ||
                        "Standalone Costing"}
                    </p>
                    {quotation && (
                      <p className="text-sm text-slate-600">
                        {item.query ? `Query No. ${item.query.query_id}` : "Query: Not linked"} ·{" "}
                        {draftQuotation ? "Draft" : "Saved version"}
                        {draftQuotation?.draft_id ? ` ${draftQuotation.draft_id}` : ""} · Prepared
                        by{" "}
                        {quotation.quotation_snapshot?.prepared_by_name ||
                          quotation.quotation_snapshot?.quote.prepared_by_name ||
                          quotation.quotation_snapshot?.saved_by ||
                          "Not recorded"}
                      </p>
                    )}
                    <p className="text-sm text-slate-500">
                      {item.query
                        ? `Owner ${item.query.owner || "Unassigned"}`
                        : "Standalone Costing"}{" "}
                      · Requested by {employeeName(requesterId)} · Assigned to{" "}
                      {employeeName(assignedId)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Requested {fmt(requestedAt)} · Due {fmt(assignment.due_at)}
                    </p>
                    <p className="mt-2 text-sm">
                      {assistance
                        ? assistance.reason || "No assistance instructions supplied."
                        : "instructions" in assignment
                          ? assignment.instructions || "No review note supplied."
                          : "No review note supplied."}
                    </p>
                    {assistance && (
                      <p className="text-xs text-teal-700">Area: {assistance.areas.join(", ")}</p>
                    )}
                    {"decision_note" in assignment && assignment.decision_note && (
                      <p className="mt-2 rounded bg-amber-50 p-2 text-sm">
                        {assignment.decision_note}
                      </p>
                    )}
                    {tab === "team" && access.canManageTeam && !completed(assignment.status) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          className="h-9 rounded-md border bg-white px-3 text-sm"
                          value={reassignTargets[assignment.id] || ""}
                          onChange={(event) =>
                            setReassignTargets((current) => ({
                              ...current,
                              [assignment.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Reassign within team…</option>
                          {reassignableEmployees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name} · {employee.role}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!reassignTargets[assignment.id]}
                          onClick={() => {
                            try {
                              reassignReviewSupport(
                                item.query!.query_id,
                                "source_type" in assignment && assignment.source_type === "draft"
                                  ? "query"
                                  : mode,
                                assignment.id,
                                reassignTargets[assignment.id],
                                employeeId || "",
                              );
                              setReassignTargets((current) => ({
                                ...current,
                                [assignment.id]: "",
                              }));
                              toast.success("Work reassigned.");
                            } catch (error) {
                              toast.error(
                                error instanceof Error ? error.message : "Could not reassign work.",
                              );
                            }
                          }}
                        >
                          Reassign
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {quotation && (
                      <Button
                        variant="outline"
                        onClick={() => setViewingQuote(quotation.quotation_snapshot!.quote)}
                      >
                        View Exact Snapshot
                      </Button>
                    )}
                    {item.query && (
                      <Button asChild variant="outline">
                        <Link to="/queries/$id" params={{ id: item.query.id }}>
                          Open Query Workspace
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
                {assignedId === employeeId && !completed(assignment.status) && (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {mode === "assistance" ? (
                      <>
                        {assignment.status === "Requested" && (
                          <Button size="sm" variant="outline" onClick={() => act(item, "accept")}>
                            Accept Assistance
                          </Button>
                        )}
                        {assignment.status === "Assigned" && (
                          <Button size="sm" variant="outline" onClick={() => act(item, "start")}>
                            Start Assistance
                          </Button>
                        )}
                        {assignment.status === "In Progress" && (
                          <Button size="sm" onClick={() => act(item, "complete")}>
                            Complete Assistance
                          </Button>
                        )}
                      </>
                    ) : assignment.status === "In Review" ? (
                      <>
                        <Button size="sm" onClick={() => act(item, "approve")}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => act(item, "return")}>
                          Return for Correction
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => act(item, "start")}>
                        Start Review
                      </Button>
                    )}
                  </div>
                )}
                {requesterId === employeeId && !completed(assignment.status) && (
                  <div className="border-t pt-3">
                    <Button size="sm" variant="ghost" onClick={() => act(item, "cancel")}>
                      Cancel Request
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!visible.length && (
          <Card>
            <CardContent className="p-10 text-center text-slate-500">
              No records in this queue.
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog open={Boolean(viewingQuote)} onOpenChange={(next) => !next && setViewingQuote(null)}>
        <DialogContent className="max-h-[94vh] max-w-[96vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Final Quotation Review · Immutable Snapshot</DialogTitle>
          </DialogHeader>
          {viewingQuote?.draft_snapshot ? (
            <div className="pointer-events-none">
              <FinalCostingWorkspace draft={viewingQuote.draft_snapshot} set={() => undefined} />
            </div>
          ) : (
            <p className="p-6 text-sm text-slate-500">
              This legacy snapshot does not contain the full Step 9 input state.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
