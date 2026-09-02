// Follow-up Tracker — every scheduled follow-up across the CRM, bucketed by
// due date, all derived live from the shared CRM store.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, StatCard, StageBadge, fmtTime } from "@/components/crm/ui";
import { PriorityBadge, FollowupDialog } from "@/components/crm/timeline";
import { useLeadTracking } from "@/lib/crm/tracking";
import { useEmployees } from "@/lib/crm/store";
import type { CrmQuery } from "@/lib/crm/types";
import { CalendarClock, AlarmClock, CheckCircle2, CalendarX } from "lucide-react";

function FollowupTable({ rows, empty }: { rows: CrmQuery[]; empty: string }) {
  if (!rows.length) return <p className="p-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Query</th>
            <th className="px-3 py-2 text-left">Customer</th>
            <th className="px-3 py-2 text-left">Owner</th>
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-left">Priority</th>
            <th className="px-3 py-2 text-left">Follow-up due</th>
            <th className="px-3 py-2 text-left">Next action</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((q) => (
            <tr key={q.id} className="hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">
                <Link to="/query/$queryId" params={{ queryId: q.query_id }} className="text-primary hover:underline">
                  {q.query_id}
                </Link>
              </td>
              <td className="px-3 py-2">{q.customer}</td>
              <td className="px-3 py-2">{q.owner || <span className="text-muted-foreground">Unassigned</span>}</td>
              <td className="px-3 py-2"><StageBadge stage={q.stage} /></td>
              <td className="px-3 py-2"><PriorityBadge priority={q.priority} /></td>
              <td className="px-3 py-2">{q.followup_due ? fmtTime(q.followup_due) : "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{q.next_action || "—"}</td>
              <td className="px-3 py-2 text-right">
                <FollowupDialog complete query={q} trigger={<Button size="sm" variant="outline">Complete</Button>} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FollowupTracker() {
  const t = useLeadTracking();
  const employees = useEmployees();
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");

  const filter = (rows: CrmQuery[]) =>
    rows.filter((q) =>
      (owner === "all" || q.owner === owner) &&
      (!search.trim() ||
        `${q.query_id} ${q.customer} ${q.contact_person} ${q.destination}`.toLowerCase().includes(search.toLowerCase())),
    );

  const buckets = useMemo(() => ({
    dueToday: filter(t.followups.dueToday),
    overdue: filter(t.followups.overdue),
    upcoming: filter(t.followups.upcoming),
    completed: filter(t.followups.completedToday),
    noDate: filter(t.followups.noDate),
  }), [t, owner, search]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Follow-up Tracker</h1>
        <p className="text-sm text-muted-foreground">Every planned follow-up across the sales team, live from the CRM.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Due Today" value={buckets.dueToday.length} icon={CalendarClock} />
        <StatCard label="Overdue" value={buckets.overdue.length} icon={AlarmClock} />
        <StatCard label="Upcoming" value={buckets.upcoming.length} icon={CalendarClock} />
        <StatCard label="Completed Today" value={buckets.completed.length} icon={CheckCircle2} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search query, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All owners" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Panel title="Follow-ups" icon={CalendarClock}>
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">Due Today ({buckets.dueToday.length})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({buckets.overdue.length})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({buckets.upcoming.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed Today ({buckets.completed.length})</TabsTrigger>
            <TabsTrigger value="nodate">No Date ({buckets.noDate.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="today"><FollowupTable rows={buckets.dueToday} empty="Nothing due today." /></TabsContent>
          <TabsContent value="overdue"><FollowupTable rows={buckets.overdue} empty="No overdue follow-ups. " /></TabsContent>
          <TabsContent value="upcoming"><FollowupTable rows={buckets.upcoming} empty="No upcoming follow-ups scheduled." /></TabsContent>
          <TabsContent value="completed"><FollowupTable rows={buckets.completed} empty="No follow-ups completed today yet." /></TabsContent>
          <TabsContent value="nodate">
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <CalendarX className="h-3.5 w-3.5" /> These open leads have no follow-up scheduled.
            </div>
            <FollowupTable rows={buckets.noDate} empty="Every open lead has a follow-up date." />
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}
