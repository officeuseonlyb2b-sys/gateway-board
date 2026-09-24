import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  IndianRupee,
  Plus,
  UserRoundCheck,
  Users,
} from "lucide-react";

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
import type { CrmQuery } from "@/lib/crm/types";

const fmt = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

type SortKey =
  "query" | "received" | "customer" | "travel" | "value" | "stage" | "advisor" | "followup";
type SortDirection = "asc" | "desc";

const sortValue = (query: CrmQuery, key: SortKey): string | number => {
  if (key === "query") return query.query_id;
  if (key === "received") return new Date(query.created_at).getTime() || 0;
  if (key === "customer") return query.customer || "";
  if (key === "travel") return new Date(query.travel_start).getTime() || 0;
  if (key === "value") return query.commercials.top_line || query.value || 0;
  if (key === "stage") return query.stage || "";
  if (key === "advisor") return query.owner || "";
  return query.followup_due ? new Date(query.followup_due).getTime() || 0 : "";
};

function SortableHead({
  label,
  column,
  active,
  direction,
  onSort,
}: {
  label: string;
  column: SortKey;
  active: boolean;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 whitespace-nowrap text-left font-semibold hover:text-teal-700"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-teal-600" : "text-slate-400"}`} />
      </button>
    </TableHead>
  );
}

export default function QueryTracker() {
  const navigate = useNavigate();
  const queries = useAccessibleQueries();
  const scope = useQueryFilters(queries);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "received",
    direction: "desc",
  });
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
  const sortedQueries = useMemo(
    () =>
      [...scope.filtered].sort((left, right) => {
        const a = sortValue(left, sort.key);
        const b = sortValue(right, sort.key);
        if (a === "" && b !== "") return 1;
        if (b === "" && a !== "") return -1;
        const comparison =
          typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
        return sort.direction === "asc" ? comparison : -comparison;
      }),
    [scope.filtered, sort],
  );
  const changeSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));

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
                  <SortableHead
                    label="Query"
                    column="query"
                    active={sort.key === "query"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Received"
                    column="received"
                    active={sort.key === "received"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Partner / Client"
                    column="customer"
                    active={sort.key === "customer"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Travel plan"
                    column="travel"
                    active={sort.key === "travel"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Range"
                    column="value"
                    active={sort.key === "value"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Stage"
                    column="stage"
                    active={sort.key === "stage"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Advisor"
                    column="advisor"
                    active={sort.key === "advisor"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                  <SortableHead
                    label="Next action"
                    column="followup"
                    active={sort.key === "followup"}
                    direction={sort.direction}
                    onSort={changeSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedQueries.map((query) => (
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
                      <p className="text-xs text-slate-500">{paxRangeLabel(query)}</p>
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
