// Daily Performance Tracking — per-employee activity for the day plus the
// live smart-alert panel. All numbers derive from the shared CRM event log.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Panel, StatCard, fmtTime, initials, Bar } from "@/components/crm/ui";
import { PriorityBadge } from "@/components/crm/timeline";
import { useLeadTracking } from "@/lib/crm/tracking";
import { useCrmEvents } from "@/lib/crm/store";
import { EVENT_LABELS } from "@/lib/crm/types";
import { sameDay, startOfDay } from "@/lib/crm/metrics";
import { Activity, AlertTriangle, PhoneCall, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  red: "border-rose-200 bg-rose-50 text-rose-700",
  orange: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700",
};

export default function DailyActivity() {
  const t = useLeadTracking();
  const events = useCrmEvents();
  const [search, setSearch] = useState("");

  const today = startOfDay(new Date());
  const todayEvents = events
    .filter((e) => sameDay(e.at, today))
    .filter((e) => !search.trim() || `${e.by} ${e.title} ${e.query_id ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  const totals = t.daily.reduce(
    (a, r) => ({
      contacted: a.contacted + r.contactedToday,
      calls: a.calls + r.callsToday,
      followups: a.followups + r.followupsDoneToday,
      overdue: a.overdue + r.overdue,
    }),
    { contacted: 0, calls: 0, followups: 0, overdue: 0 },
  );
  const maxAssigned = Math.max(1, ...t.daily.map((r) => r.assigned));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Daily Activity &amp; Performance</h1>
        <p className="text-sm text-muted-foreground">Live employee activity for today, with inactivity and follow-up alerts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads Contacted Today" value={totals.contacted} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Calls Logged Today" value={totals.calls} icon={<PhoneCall className="h-5 w-5" />} />
        <StatCard label="Follow-ups Done Today" value={totals.followups} icon={<Activity className="h-5 w-5" />} tone="green" />
        <StatCard label="Overdue Follow-ups" value={totals.overdue} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
      </div>

      <Panel title="Smart alerts" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t.alerts.map((a) => (
            <div key={a.key} className={cn("rounded-lg border p-3", TONE[a.tone])}>
              <div className="text-xl font-bold">{a.count}</div>
              <div className="text-xs font-medium">{a.label}</div>
              {a.queries.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {a.queries.slice(0, 3).map((q) => (
                    <Link
                      key={q.id}
                      to="/queries/$id"
                      params={{ id: q.query_id }}
                      className="block text-[11px] underline underline-offset-2 truncate"
                    >
                      {q.query_id} — {q.customer}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Employee performance — today" icon={<Users className="h-4 w-4" />}>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-left">Leads</th>
                <th className="px-3 py-2 text-right">Active</th>
                <th className="px-3 py-2 text-right">New</th>
                <th className="px-3 py-2 text-right">Contacted</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Connected</th>
                <th className="px-3 py-2 text-right">F/U Done</th>
                <th className="px-3 py-2 text-right">F/U Due</th>
                <th className="px-3 py-2 text-right">Overdue</th>
                <th className="px-3 py-2 text-right">Quotes Sent</th>
                <th className="px-3 py-2 text-right">Won</th>
                <th className="px-3 py-2 text-right">Conv %</th>
                <th className="px-3 py-2 text-left">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {t.daily.length === 0 && (
                <tr><td colSpan={14} className="px-3 py-6 text-center text-muted-foreground">
                  No employees yet — add them in Users &amp; Roles.
                </td></tr>
              )}
              {t.daily.map((r) => (
                <tr key={r.employee.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[11px] font-semibold grid place-items-center">
                        {initials(r.employee.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.employee.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.employee.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 w-32"><Bar value={r.assigned} max={maxAssigned} /></td>
                  <td className="px-3 py-2 text-right">{r.active}</td>
                  <td className="px-3 py-2 text-right">{r.newToday}</td>
                  <td className="px-3 py-2 text-right">{r.contactedToday}</td>
                  <td className="px-3 py-2 text-right">{r.callsToday}</td>
                  <td className="px-3 py-2 text-right">{r.connectedToday}</td>
                  <td className="px-3 py-2 text-right">{r.followupsDoneToday}</td>
                  <td className="px-3 py-2 text-right">{r.followupsDueToday}</td>
                  <td className={cn("px-3 py-2 text-right", r.overdue > 0 && "text-rose-600 font-semibold")}>{r.overdue}</td>
                  <td className="px-3 py-2 text-right">{r.quotationsSent}</td>
                  <td className="px-3 py-2 text-right">{r.converted}</td>
                  <td className="px-3 py-2 text-right">{r.conversion.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.lastActivityAt ? fmtTime(r.lastActivityAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Inactive leads" icon={<Clock className="h-4 w-4" />}>
          <div className="space-y-4">
            {([
              ["No activity 24h+", t.inactive.h24],
              ["No activity 48h+", t.inactive.h48],
              ["No activity 3 days+", t.inactive.d3],
              ["No activity 7 days+", t.inactive.d7],
            ] as const).map(([label, rows]) => (
              <div key={label}>
                <div className="text-xs font-semibold text-muted-foreground mb-1">{label} ({rows.length})</div>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None.</p>
                ) : (
                  <ul className="space-y-1">
                    {rows.slice(0, 6).map((q) => (
                      <li key={q.id} className="flex items-center gap-2 text-sm">
                        <Link to="/queries/$id" params={{ id: q.query_id }} className="text-primary hover:underline">
                          {q.query_id}
                        </Link>
                        <span className="truncate text-muted-foreground">{q.customer}</span>
                        <PriorityBadge priority={q.priority} className="ml-auto" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Today's activity log"
          icon={<Activity className="h-4 w-4" />}
          action={<Input className="h-8 w-48" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />}
        >
          {todayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity logged today yet.</p>
          ) : (
            <ul className="max-h-[420px] overflow-auto divide-y">
              {todayEvents.map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{EVENT_LABELS[e.type] ?? e.type}</span>
                    <span className="text-xs text-muted-foreground">{fmtTime(e.at)} • {e.by}</span>
                    {e.query_id && (
                      <Link to="/queries/$id" params={{ id: e.query_id }} className="ml-auto text-xs text-primary hover:underline">
                        {e.query_id}
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{e.title}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
