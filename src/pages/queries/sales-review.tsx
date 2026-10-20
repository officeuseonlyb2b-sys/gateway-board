import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { useAccessibleQueries, useAccessProfile } from "@/lib/crm/access";
import {
  reassignReviewSupport,
  setAssistanceStatus,
  setReviewStatus,
  useEmployees,
} from "@/lib/crm/store";
import type {
  AssistanceAssignment,
  CrmQuery,
  QueryReviewAssignment,
  QuotationReviewAssignment,
} from "@/lib/crm/types";
import type { SavedQuote } from "@/lib/quotes-store";

export type ReviewMode = "query" | "quotation" | "assistance";
type QueueTab = "assigned" | "requested" | "completed" | "team";
type QueueItem = {
  query: CrmQuery;
  assignment: QueryReviewAssignment | QuotationReviewAssignment | AssistanceAssignment;
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
    () =>
      queries.flatMap((query) => {
        const assignments =
          mode === "query"
            ? query.review_support?.query_reviews || []
            : mode === "quotation"
              ? query.review_support?.quotation_reviews || []
              : query.review_support?.assistance || [];
        return assignments.map((assignment) => ({ query, assignment }));
      }),
    [queries, mode],
  );
  const visible = items.filter(({ query, assignment }) => {
    const assignedTo =
      "assistant_employee_id" in assignment
        ? assignment.assistant_employee_id
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
          (access.canManageTeam && managerTeamQuery(query)))
      );
    if (tab === "requested") return requestedBy === employeeId && !completed(assignment.status);
    if (tab === "team")
      return access.canManageTeam && managerTeamQuery(query) && !completed(assignment.status);
    return assignedTo === employeeId && !completed(assignment.status);
  });
  const title =
    mode === "query"
      ? "Queries for Review"
      : mode === "quotation"
        ? "Quotations for Review"
        : "Assisted Queries";
  const act = (
    item: QueueItem,
    action: "start" | "accept" | "approve" | "return" | "complete" | "cancel",
  ) => {
    try {
      if (mode === "assistance") {
        const summary =
          action === "complete" ? window.prompt("What was done? Completion summary:") : undefined;
        if (action === "complete" && !summary?.trim()) return;
        setAssistanceStatus(
          item.query.query_id,
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
        setReviewStatus(
          item.query.query_id,
          mode,
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
              : assignment.reviewer_employee_id;
          const requesterId =
            "assigned_by_employee_id" in assignment
              ? assignment.assigned_by_employee_id
              : assignment.requested_by_employee_id;
          const requestedAt =
            "assigned_at" in assignment ? assignment.assigned_at : assignment.requested_at;
          const quotation = "quotation_version" in assignment ? assignment : undefined;
          const assistance = "areas" in assignment ? assignment : undefined;
          return (
            <Card key={assignment.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/queries/$id"
                        params={{ id: item.query.id }}
                        className="font-bold text-teal-700 hover:underline"
                      >
                        {quotation
                          ? `${quotation.quotation_snapshot.quote.display_number || quotation.quotation_id} · V${quotation.quotation_version}`
                          : item.query.query_id}
                      </Link>
                      <Badge variant="outline">{assignment.status}</Badge>
                      <Badge>{assignment.priority || "Normal"}</Badge>
                    </div>
                    <p className="mt-1 font-semibold">{item.query.customer}</p>
                    <p className="text-sm text-slate-500">
                      Owner {item.query.owner || "Unassigned"} · Requested by{" "}
                      {employeeName(requesterId)} · Assigned to {employeeName(assignedId)}
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
                                item.query.query_id,
                                mode,
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
                        onClick={() => setViewingQuote(quotation.quotation_snapshot.quote)}
                      >
                        View Exact Version
                      </Button>
                    )}
                    <Button asChild variant="outline">
                      <Link to="/queries/$id" params={{ id: item.query.id }}>
                        Open Query Workspace
                      </Link>
                    </Button>
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
      <QuoteViewerDialog
        quote={viewingQuote}
        open={Boolean(viewingQuote)}
        onClose={() => setViewingQuote(null)}
      />
    </div>
  );
}
