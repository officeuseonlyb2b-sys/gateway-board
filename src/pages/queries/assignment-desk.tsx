import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Clock3, Inbox, Users } from "lucide-react";

import { ReassignQuery } from "@/components/crm/assign";
import { paxRangeLabel } from "@/components/crm/ui";
import { useAccessibleQueries } from "@/lib/crm/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEmployees } from "@/lib/crm/store";

export default function AssignmentDesk() {
  const queries = useAccessibleQueries();
  const employees = useEmployees().filter((employee) => employee.active !== false);
  const pending = useMemo(
    () =>
      queries
        .filter((query) => query.assignment_status !== "Assigned" || !query.owner)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [queries],
  );
  const assignedToday = queries.filter(
    (query) =>
      query.assigned_at && new Date(query.assigned_at).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <div>
        <p className="text-sm font-medium text-teal-700">MP Unit · Sales Control</p>
        <h1 className="text-3xl font-bold text-slate-950">Assignment Desk</h1>
        <p className="mt-1 text-sm text-slate-500">
          Managerial intake queue. Query creation and ownership assignment are separately audited.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Awaiting assignment", value: pending.length, Icon: Inbox },
          { label: "Assigned today", value: assignedToday, Icon: Clock3 },
          { label: "Active advisors", value: employees.length, Icon: Users },
        ].map(({ label, value, Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-bold">{value}</p>
              </div>
              <Icon className="h-6 w-6 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Oldest unassigned first</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">
              All Queries are assigned.
            </div>
          )}
          {pending.map((query) => (
            <div
              key={query.id}
              className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center"
            >
              <div>
                <Link
                  to="/queries/$id"
                  params={{ id: query.id }}
                  className="font-bold text-teal-700 hover:underline"
                >
                  {query.query_id}
                </Link>
                <p className="font-semibold text-slate-900">{query.customer}</p>
                <p className="text-xs text-slate-500">Created by {query.created_by || "Unknown"}</p>
              </div>
              <div>
                <p className="text-sm font-medium">{query.destination || "Destination pending"}</p>
                <p className="text-xs text-slate-500">
                  {paxRangeLabel(query)} ·{" "}
                  {query.costing_basis || query.travel_type}
                </p>
              </div>
              <div>
                <Badge variant="outline">{query.priority || "Normal"}</Badge>
                <p className="mt-1 text-xs text-slate-500">
                  Received {new Date(query.created_at).toLocaleString("en-GB")}
                </p>
              </div>
              <div className="min-w-64">
                <ReassignQuery queryId={query.query_id} owner="" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Button asChild variant="outline">
        <Link to="/queries/query-tracker">Open Query Tracker</Link>
      </Button>
    </div>
  );
}
