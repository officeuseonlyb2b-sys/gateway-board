import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock3, ListFilter, TriangleAlert } from "lucide-react";
import { QueryFilters, useQueryFilters } from "@/components/crm/query-filters";
import { inr } from "@/components/crm/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccessibleQueries } from "@/lib/crm/access";
import { useCrmTasks, useEmployees } from "@/lib/crm/store";

const dayStart = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

export default function FollowUpDesk() {
  const navigate = useNavigate();
  const queries = useAccessibleQueries();
  const employees = useEmployees().filter((employee) => employee.active !== false);
  const tasks = useCrmTasks();
  const scope = useQueryFilters(queries);
  const [sortBy, setSortBy] = useState("urgency");
  const now = new Date();
  const today = dayStart(now);
  const tomorrow = new Date(today.getTime() + 86400000);
  const next7 = new Date(today.getTime() + 7 * 86400000);
  const next30 = new Date(today.getTime() + 30 * 86400000);
  const open = scope.filtered.filter((query) => !["Won", "Lost"].includes(query.stage));
  const due = (query: (typeof open)[number]) =>
    query.followup_due ? new Date(query.followup_due) : null;
  const queue = [...open]
    .filter((query) => due(query))
    .sort((a, b) => {
      if (sortBy === "value")
        return (b.commercials.top_line || b.value || 0) - (a.commercials.top_line || a.value || 0);
      if (sortBy === "priority")
        return (
          ["Urgent", "High", "Normal", "Medium", "Low"].indexOf(a.priority) -
          ["Urgent", "High", "Normal", "Medium", "Low"].indexOf(b.priority)
        );
      if (sortBy === "travel")
        return (a.travel_start || "9999").localeCompare(b.travel_start || "9999");
      return (a.followup_due || "9999").localeCompare(b.followup_due || "9999");
    });
  const advisorRows = employees.map((employee) => {
    const mine = open.filter((query) => query.owner === employee.name);
    const inRange = (end: Date) =>
      mine.filter((query) => {
        const date = due(query);
        return date && date >= today && date < end;
      }).length;
    return {
      name: employee.name,
      today: inRange(tomorrow),
      week: inRange(next7),
      month: inRange(next30),
      overdue: mine.filter((query) => {
        const date = due(query);
        return date && date < now;
      }).length,
      openTasks: tasks.filter((task) => task.owner === employee.name && !task.done).length,
    };
  });
  const counts = {
    nurturing: open.filter((query) =>
      ["Follow-up", "Nurturing", "Quotation Sent"].includes(query.stage),
    ).length,
    overdue: open.filter((query) => {
      const date = due(query);
      return date && date < now;
    }).length,
    today: open.filter((query) => {
      const date = due(query);
      return date && date >= today && date < tomorrow;
    }).length,
    next7: open.filter((query) => {
      const date = due(query);
      return date && date >= tomorrow && date < next7;
    }).length,
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <div>
        <p className="text-sm font-medium text-teal-700">MP Unit · SOD control</p>
        <h1 className="text-3xl font-bold">Follow-up Desk</h1>
        <p className="mt-1 text-sm text-slate-500">
          Advisor commitments, overdue escalation and priority leads in one actionable queue.
        </p>
      </div>
      <QueryFilters
        state={scope.filters}
        onChange={scope.setFilters}
        options={scope.options}
        onReset={scope.reset}
      />
      <div className="grid gap-4 md:grid-cols-4">
        {[
          {
            label: "Filtered nurturing",
            value: counts.nurturing,
            Icon: ListFilter,
            color: "text-amber-600",
          },
          { label: "Overdue", value: counts.overdue, Icon: TriangleAlert, color: "text-red-600" },
          { label: "Due today", value: counts.today, Icon: Clock3, color: "text-blue-600" },
          {
            label: "Next 7 days",
            value: counts.next7,
            Icon: CalendarDays,
            color: "text-emerald-600",
          },
        ].map(({ label, value, Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-4xl font-bold">{value}</p>
              </div>
              <Icon className={`h-7 w-7 ${color}`} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Advisor Follow-up Overview</CardTitle>
          <p className="text-sm text-slate-500">
            Daily, weekly and monthly SOD view using the current filter scope.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Advisor</th>
                  <th>Overdue</th>
                  <th>Today</th>
                  <th>Next 7 days</th>
                  <th>Next 30 days</th>
                  <th>Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {advisorRows.map((row) => (
                  <tr key={row.name} className="border-b">
                    <td className="p-3 font-semibold">{row.name}</td>
                    <td className="font-bold text-red-600">{row.overdue}</td>
                    <td>{row.today}</td>
                    <td>{row.week}</td>
                    <td>{row.month}</td>
                    <td>{row.openTasks}</td>
                  </tr>
                ))}
                {advisorRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Add employees in Users & Roles to populate the SOD view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Priority Queue</CardTitle>
              <p className="text-sm text-slate-500">
                Overdue items naturally rise to the top; choose another business scenario when
                needed.
              </p>
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgency">Due date / urgency</SelectItem>
                <SelectItem value="value">Top-line value</SelectItem>
                <SelectItem value="priority">Priority level</SelectItem>
                <SelectItem value="travel">Travel date</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {queue.map((query) => {
              const overdue = due(query)! < now;
              return (
                <div
                  key={query.id}
                  className={`grid gap-3 rounded-xl border p-4 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-center ${overdue ? "border-red-200 bg-red-50/40" : ""}`}
                >
                  <div>
                    <p className="font-bold">{query.customer}</p>
                    <p className="text-xs text-slate-500">
                      {query.query_id} · {query.owner || "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <p className={`font-semibold ${overdue ? "text-red-600" : ""}`}>
                      {new Date(query.followup_due).toLocaleString("en-GB")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {query.followup_note || query.next_action}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold">
                      {inr(query.commercials.top_line || query.value || 0)}
                    </p>
                    <Badge variant="outline">{query.priority}</Badge>
                  </div>
                  <Button
                    onClick={() => navigate({ to: "/queries/$id", params: { id: query.id } })}
                  >
                    Open
                  </Button>
                </div>
              );
            })}
            {queue.length === 0 && (
              <p className="p-8 text-center text-slate-500">
                No scheduled follow-ups in this filter scope.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Automation Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-emerald-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="mt-2 font-semibold">Quotation +3 days</p>
              <p className="text-xs text-slate-500">
                Follow-up is auto-created when a Query reaches Quotation Sent.
              </p>
            </div>
            <div className="rounded-lg bg-red-50 p-4">
              <TriangleAlert className="h-5 w-5 text-red-600" />
              <p className="mt-2 font-semibold">48-hour escalation</p>
              <p className="text-xs text-slate-500">
                Overdue actions flag the manager after 48 hours.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
