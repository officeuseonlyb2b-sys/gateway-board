import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryMetrics, type EnrichedQuery } from "@/lib/queries/metrics";
import { FINAL_STATUSES, MARKET_SOURCES, QUERY_TYPES, SOURCE_TYPES } from "@/lib/queries/types";
import {
  PageHeader, ReportingFilters, useReportingContext, selectCls, inr,
  fmtDay, fmtDateTime, StatusPill, FlagChip, EmptyState,
} from "@/components/queries/qm-ui";

const PAGE_SIZE = 15;

export default function QueryTrackerPage() {
  const ctx = useReportingContext();
  const m = useQueryMetrics(ctx);

  const [search, setSearch] = useState("");
  const [advisor, setAdvisor] = useState("all");
  const [status, setStatus] = useState("all");
  const [market, setMarket] = useState("all");
  const [source, setSource] = useState("all");
  const [qtype, setQtype] = useState("all");
  const [priority, setPriority] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return m.scoped.filter((q) => {
      if (s) {
        const hay = [q.query_no, q.contact_person, q.query_source_name, q.contact_number, q.email_id, q.interested_program_name]
          .join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (advisor !== "all" && (q.travel_advisor || "Unassigned") !== advisor) return false;
      if (status !== "all" && q.final_status !== status) return false;
      if (market !== "all" && q.query_market_source !== market) return false;
      if (source !== "all" && q.query_source_type !== source) return false;
      if (qtype !== "all" && q.query_type !== qtype) return false;
      if (priority === "high" && q.priority.score < 60) return false;
      if (priority === "medium" && (q.priority.score < 30 || q.priority.score >= 60)) return false;
      if (priority === "low" && q.priority.score >= 30) return false;
      if (from && q.query_date < from) return false;
      if (to && q.query_date > to) return false;
      return true;
    }).sort((a, b) => b.priority.score - a.priority.score);
  }, [m.scoped, search, advisor, status, market, source, qtype, priority, from, to]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const reset = () => {
    setSearch(""); setAdvisor("all"); setStatus("all"); setMarket("all");
    setSource("all"); setQtype("all"); setPriority("all"); setFrom(""); setTo(""); setPage(1);
  };

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1800px] mx-auto">
      <PageHeader
        title="Query Tracker"
        subtitle="Every enquiry with live priority, follow-up status and commercial value."
        actions={<ReportingFilters fys={m.fys} months={m.months} />}
      />

      <Card className="p-4 rounded-xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search query no., contact person, source name, phone or programme…"
              className="pl-8 h-9"
            />
          </div>
          <select className={selectCls} value={advisor} onChange={(e) => { setAdvisor(e.target.value); setPage(1); }}>
            <option value="all">All Advisors</option>
            {m.advisorNames.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className={selectCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="all">All Statuses</option>
            {FINAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={market} onChange={(e) => { setMarket(e.target.value); setPage(1); }}>
            <option value="all">All Markets</option>
            {MARKET_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="all">All Sources</option>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={qtype} onChange={(e) => { setQtype(e.target.value); setPage(1); }}>
            <option value="all">All Query Types</option>
            {QUERY_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="all">Any Priority</option>
            <option value="high">High (60+)</option>
            <option value="medium">Medium (30-59)</option>
            <option value="low">Low (&lt;30)</option>
          </select>
          <input type="date" className={selectCls} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} title="Received from" />
          <input type="date" className={selectCls} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} title="Received to" />
          <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {slice.length} of {rows.length} queries · {m.total} in reporting period
        </p>
      </Card>

      <Card className="rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted/50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                {["Query No.", "Received", "Contact / Company", "Market", "Query Type", "Travel Date", "Pax", "Query Value", "Advisor", "Status", "Next Action", "Follow-up Due", "Priority", "Last Activity", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((q) => <TrackerRow key={q.id} q={q} />)}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState message="No queries match the current filters." />}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {current} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackerRow({ q }: { q: EnrichedQuery }) {
  const p = q.priority;
  const tone = p.score >= 60 ? "text-destructive" : p.score >= 30 ? "text-amber-600" : "text-muted-foreground";
  return (
    <tr className="border-t border-border/60 hover:bg-muted/40 transition-colors">
      <td className="px-3 py-2.5 font-semibold">
        <Link to="/queries/$id" params={{ id: q.id }} className="text-primary hover:underline">{q.query_no}</Link>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{fmtDay(q.query_date)}</td>
      <td className="px-3 py-2.5">
        <div className="font-medium">{q.contact_person || "—"}</div>
        <div className="text-xs text-muted-foreground">{q.query_source_name || q.contact_number || "—"}</div>
      </td>
      <td className="px-3 py-2.5">{q.query_market_source}</td>
      <td className="px-3 py-2.5 max-w-56 truncate" title={q.query_type}>{q.query_type}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{fmtDay(q.tour_starting_date)}</td>
      <td className="px-3 py-2.5 tabular-nums">{q.no_of_pax}</td>
      <td className="px-3 py-2.5 tabular-nums font-medium">{inr(q.amount)}</td>
      <td className="px-3 py-2.5">{q.travel_advisor || <span className="text-muted-foreground">Unassigned</span>}</td>
      <td className="px-3 py-2.5"><StatusPill status={q.final_status} /></td>
      <td className="px-3 py-2.5 max-w-48 truncate" title={q.next_action || ""}>{q.next_action || <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2.5">
        {p.due ? (
          <span className={p.overdueDays > 0 ? "text-destructive font-medium" : ""}>
            {fmtDateTime(p.due.due_at)}{p.overdueDays > 0 ? ` (${p.overdueDays}d late)` : ""}
          </span>
        ) : <span className="text-muted-foreground">Not scheduled</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className={`font-bold tabular-nums ${tone}`}>{p.score}</div>
        <div className="flex flex-wrap gap-1 mt-1 max-w-52">
          {p.flags.map((f) => <FlagChip key={f} label={f} />)}
        </div>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{p.staleDays}d ago</td>
      <td className="px-3 py-2.5">
        <Button asChild size="sm" variant="outline" className="h-7">
          <Link to="/queries/$id" params={{ id: q.id }}>Open</Link>
        </Button>
      </td>
    </tr>
  );
}
