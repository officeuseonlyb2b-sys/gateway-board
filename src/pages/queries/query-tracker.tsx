import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clock3, IndianRupee, Plus, UserRoundCheck, Users } from "lucide-react";

import { QueryFilters, useQueryFilters } from "@/components/crm/query-filters";
import { inr, paxRangeLabel } from "@/components/crm/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccessibleQueries } from "@/lib/crm/access";

const fmt = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

export default function QueryTracker() {
  const navigate = useNavigate();
  const queries = useAccessibleQueries();
  const scope = useQueryFilters(queries);
  const totals = useMemo(
    () => ({
      open: scope.filtered.filter((query) => query.work_status === "Open" || !query.work_status)
        .length,
      awaiting: scope.filtered.filter((query) => query.assignment_status !== "Assigned").length,
      won: scope.filtered.filter((query) => query.stage === "Won").length,
      value: scope.filtered.reduce(
        (sum, query) => sum + (query.commercials.top_line || query.value || 0),
        0,
      ),
    }),
    [scope.filtered],
  );

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div>
          <p className="text-sm font-medium text-teal-700">MP Unit · One Query Truth</p>
          <h1 className="text-3xl font-bold">Query Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search and monitor Query health by financial year, multiple months, week, specific date
            or custom duration.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/new-lead" })}>
          <Plus className="mr-2 h-4 w-4" />
          Create Query
        </Button>
      </div>
      <QueryFilters
        state={scope.filters}
        onChange={scope.setFilters}
        options={scope.options}
        onReset={scope.reset}
      />
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Filtered Queries", value: scope.filtered.length, Icon: Users },
          { label: "Open Sales work", value: totals.open, Icon: Clock3 },
          { label: "Awaiting Assignment", value: totals.awaiting, Icon: UserRoundCheck },
          { label: "Top-line opportunity", value: inr(totals.value), Icon: IndianRupee },
        ].map(({ label, value, Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-bold">{value}</p>
              </div>
              <Icon className="h-6 w-6 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Partner / Client</TableHead>
                  <TableHead>Travel plan</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Advisor</TableHead>
                  <TableHead>Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scope.filtered.map((query) => (
                  <TableRow
                    key={query.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/queries/$id", params: { id: query.id } })}
                  >
                    <TableCell>
                      <p className="font-bold text-teal-700">{query.query_id}</p>
                      <p className="text-xs text-slate-500">
                        {query.customer_type} · {query.costing_basis || query.travel_type}
                      </p>
                    </TableCell>
                    <TableCell>{fmt(query.created_at)}</TableCell>
                    <TableCell>
                      <p className="font-semibold">{query.customer}</p>
                      <p className="text-xs text-slate-500">{query.contact_person}</p>
                    </TableCell>
                    <TableCell>
                      <p>{query.program_name || query.destination}</p>
                      <p className="text-xs text-slate-500">
                        {fmt(query.travel_start)} – {fmt(query.travel_end)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold">
                        {inr(query.commercials.bottom_line || 0)} →{" "}
                        {inr(query.commercials.top_line || query.value || 0)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {paxRangeLabel(query)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{query.stage}</Badge>
                    </TableCell>
                    <TableCell>
                      {query.owner || (
                        <Badge className="bg-amber-100 text-amber-800">Awaiting Assignment</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <p
                        className={
                          query.followup_due && new Date(query.followup_due) < new Date()
                            ? "font-semibold text-red-600"
                            : ""
                        }
                      >
                        {fmt(query.followup_due)}
                      </p>
                      <p className="text-xs text-slate-500">{query.next_action}</p>
                    </TableCell>
                  </TableRow>
                ))}
                {scope.filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center text-slate-500">
                      No Queries match this filter scope.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
