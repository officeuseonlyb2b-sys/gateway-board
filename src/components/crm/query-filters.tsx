import { useMemo, useState } from "react";
import { ChevronDown, Filter, RotateCcw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmQuery, Stage } from "@/lib/crm/types";
import { STAGES } from "@/lib/crm/types";

export interface QueryFilterState {
  search: string;
  owner: string;
  stage: string;
  financialYear: string;
  receivedMonths: string[];
  dateFrom: string;
  dateTo: string;
  travelMonth: string;
  customer: string;
  costingBasis: string;
  priority: string;
  dueWindow: string;
}

const initial: QueryFilterState = {
  search: "",
  owner: "all",
  stage: "all",
  financialYear: "all",
  receivedMonths: [],
  dateFrom: "",
  dateTo: "",
  travelMonth: "all",
  customer: "all",
  costingBasis: "all",
  priority: "all",
  dueWindow: "all",
};
const monthKey = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const fy = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
};
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();

// Shared with every Query view so one filter state model drives all counters and lists.
// eslint-disable-next-line react-refresh/only-export-components
export function useQueryFilters(queries: CrmQuery[]) {
  const [filters, setFilters] = useState<QueryFilterState>(initial);
  const options = useMemo(
    () => ({
      owners: unique(queries.map((query) => query.owner)),
      months: unique(queries.map((query) => monthKey(query.created_at))).reverse(),
      financialYears: unique(queries.map((query) => fy(query.created_at))).reverse(),
      travelMonths: unique(queries.map((query) => monthKey(query.travel_start))).reverse(),
      customers: unique(queries.map((query) => query.customer)),
      costingBases: unique(queries.map((query) => query.costing_basis || query.travel_type)),
      priorities: unique(queries.map((query) => query.priority)),
    }),
    [queries],
  );
  const filtered = useMemo(() => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const next7 = new Date(today.getTime() + 7 * 86400000);
    return queries.filter((query) => {
      const haystack = [
        query.query_id,
        query.lead_id,
        query.customer,
        query.contact_person,
        query.destination,
        query.owner,
        query.program_name,
        query.mobile,
        query.email,
      ]
        .join(" ")
        .toLowerCase();
      const received = new Date(query.created_at);
      const due = query.followup_due ? new Date(query.followup_due) : null;
      const dueMatch =
        filters.dueWindow === "all" ||
        (filters.dueWindow === "overdue" && due && due < now) ||
        (filters.dueWindow === "today" && due && due.toDateString() === today.toDateString()) ||
        (filters.dueWindow === "next7" && due && due >= today && due <= next7);
      return (
        (!filters.search || haystack.includes(filters.search.toLowerCase())) &&
        (filters.owner === "all" || query.owner === filters.owner) &&
        (filters.stage === "all" || query.stage === filters.stage) &&
        (filters.financialYear === "all" || fy(query.created_at) === filters.financialYear) &&
        (!filters.receivedMonths.length ||
          filters.receivedMonths.includes(monthKey(query.created_at))) &&
        (!filters.dateFrom || received >= new Date(`${filters.dateFrom}T00:00:00`)) &&
        (!filters.dateTo || received <= new Date(`${filters.dateTo}T23:59:59`)) &&
        (filters.travelMonth === "all" || monthKey(query.travel_start) === filters.travelMonth) &&
        (filters.customer === "all" || query.customer === filters.customer) &&
        (filters.costingBasis === "all" ||
          (query.costing_basis || query.travel_type) === filters.costingBasis) &&
        (filters.priority === "all" || query.priority === filters.priority) &&
        Boolean(dueMatch)
      );
    });
  }, [queries, filters]);
  return { filters, setFilters, filtered, options, reset: () => setFilters(initial) };
}

function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const monthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

function MonthMultiSelect({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((month) => month !== value));
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Received months
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            {selected.length
              ? `${selected.length} month${selected.length > 1 ? "s" : ""} selected`
              : "All months"}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div className="mb-2 flex items-center justify-between border-b px-2 pb-2">
            <p className="text-sm font-semibold">Select multiple months</p>
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => onChange([])}>
                Clear
              </Button>
            )}
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {values.map((value) => {
              const checked = selected.includes(value);
              return (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-slate-50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => toggle(value, next === true)}
                  />
                  {monthLabel(value)}
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function QueryFilters({
  state,
  onChange,
  options,
  onReset,
  compact = false,
}: {
  state: QueryFilterState;
  onChange: (state: QueryFilterState) => void;
  options: ReturnType<typeof useQueryFilters>["options"];
  onReset: () => void;
  compact?: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [quickDuration, setQuickDuration] = useState("all");
  const set = <K extends keyof QueryFilterState>(key: K, value: QueryFilterState[K]) =>
    onChange({ ...state, [key]: value });
  const advancedCount =
    (state.receivedMonths.length ? 1 : 0) +
    (state.dateFrom ? 1 : 0) +
    (state.dateTo ? 1 : 0) +
    (state.customer !== "all" ? 1 : 0) +
    (state.costingBasis !== "all" ? 1 : 0) +
    (state.priority !== "all" ? 1 : 0) +
    (state.dueWindow !== "all" ? 1 : 0);
  const quickRange = (range: string) => {
    const end = new Date();
    const start = new Date();
    if (range === "today") start.setDate(end.getDate());
    if (range === "week") start.setDate(end.getDate() - 6);
    if (range === "month") start.setDate(end.getDate() - 29);
    if (range === "sixty") start.setDate(end.getDate() - 59);
    if (range === "quarter") start.setDate(end.getDate() - 89);
    const local = (date: Date) =>
      new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    onChange({
      ...state,
      dateFrom: range === "all" ? "" : local(start),
      dateTo: range === "all" ? "" : local(end),
    });
  };
  return (
    <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_220px_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search Query, partner/client, contact, programme or advisor"
            value={state.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </div>
        <Select
          value={quickDuration}
          onValueChange={(value) => {
            setQuickDuration(value);
            quickRange(value);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Quick duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
            <SelectItem value="sixty">Last 60 days</SelectItem>
            <SelectItem value="quarter">Last 90 days</SelectItem>
            <SelectItem value="custom" disabled>
              Custom range
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            onReset();
            setQuickDuration("all");
            setAdvancedOpen(false);
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Choice
          label="Financial year"
          value={state.financialYear}
          values={options.financialYears}
          onChange={(value) => set("financialYear", value)}
        />
        <Choice
          label="Stage"
          value={state.stage}
          values={STAGES}
          onChange={(value) => set("stage", value)}
        />
        <Choice
          label="Advisor"
          value={state.owner}
          values={options.owners}
          onChange={(value) => set("owner", value)}
        />
        <Choice
          label="Travel month"
          value={state.travelMonth}
          values={options.travelMonths}
          onChange={(value) => set("travelMonth", value)}
        />
      </div>
      {!compact && (
        <div className="border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 text-slate-600"
            onClick={() => setAdvancedOpen((current) => !current)}
            aria-expanded={advancedOpen}
          >
            <Filter className="mr-2 h-4 w-4" />
            {advancedOpen ? "Hide advanced filters" : "More filters"}
            {advancedCount > 0 && <Badge className="ml-2">{advancedCount}</Badge>}
            <ChevronDown
              className={`ml-2 h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </Button>
          {advancedOpen && (
            <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
              <Choice
                label="Partner / Client"
                value={state.customer}
                values={options.customers}
                onChange={(value) => set("customer", value)}
              />
              <Choice
                label="Costing basis"
                value={state.costingBasis}
                values={options.costingBases}
                onChange={(value) => set("costingBasis", value)}
              />
              <Choice
                label="Priority"
                value={state.priority}
                values={options.priorities}
                onChange={(value) => set("priority", value)}
              />
              <Choice
                label="Due window"
                value={state.dueWindow}
                values={["overdue", "today", "next7"]}
                onChange={(value) => set("dueWindow", value)}
              />
              <MonthMultiSelect
                values={options.months}
                selected={state.receivedMonths}
                onChange={(value) => set("receivedMonths", value)}
              />
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Received from</p>
                <Input
                  type="date"
                  value={state.dateFrom}
                  onChange={(event) => {
                    setQuickDuration(event.target.value || state.dateTo ? "custom" : "all");
                    set("dateFrom", event.target.value);
                  }}
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Received to</p>
                <Input
                  type="date"
                  value={state.dateTo}
                  onChange={(event) => {
                    setQuickDuration(event.target.value || state.dateFrom ? "custom" : "all");
                    set("dateTo", event.target.value);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
